// PostHog product analytics, and the privacy rules it runs under:
// no runner or invite token, player name or email ever leaves the
// device. Squads are lists of children's names.
//
// PostHog is prod-only. Each test sets the e2e cookie that turns it on
// in debug mode (src/lib/analytics/posthog-server.ts): a dummy key,
// readable JSON, one request per event. Every /ingest request is
// caught here, so nothing reaches PostHog.
//
// Covers: src/components/analytics/PostHogAnalytics.tsx,
// src/lib/analytics/{sanitize,posthog-config}.ts, the /account opt-out
// (src/components/preferences/UsageDataSettings.tsx), and Phase 2's
// events: the catalogue (src/lib/analytics/events.ts) sent from the
// shared live components, and the lifecycle events the server sends
// (src/lib/analytics/{server,lifecycle}.ts). Playwright can't see a
// request the server makes, so in debug mode the server keeps its
// events in memory and /api/e2e/analytics hands them over.

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createAdminClient, createTestUser, deleteTestUser } from "../fixtures/supabase";
import { makeGame, makePlayers, makeTeam } from "../fixtures/factories";
import { gotoStable, waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

// No service worker. Once the PWA's worker controls a page, WebKit
// sends that page's requests past context.route (Playwright routes a
// worker's traffic in Chromium only), so /ingest would go uncaught, and
// on to PostHog, after the first client-side navigation.
const NO_SERVICE_WORKER = { serviceWorkers: "block" } as const;
test.use(NO_SERVICE_WORKER);

const POSTHOG_TEST_COOKIE = "siren-e2e-posthog";

type SentEvent = { event: string; properties?: Record<string, unknown> } & Record<string, unknown>;

interface Capture {
  events: SentEvent[];
  /** Every request body, verbatim: the strongest "never sent" check. */
  raw: string[];
}

/** The events in a request body; none if it isn't an event upload. */
function decode(body: string): SentEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    const data = new URLSearchParams(body).get("data");
    if (!data) return [];
    parsed = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
  }
  const list = Array.isArray(parsed) ? parsed : ((parsed as { batch?: unknown[] }).batch ?? [parsed]);
  return (list as SentEvent[]).filter((e) => typeof e?.event === "string");
}

// What PostHog's remote-config endpoint answers: autocapture on,
// everything else off. Autocapture only starts once it has this.
const REMOTE_CONFIG = {
  supportedCompression: [],
  autocapture_opt_out: false,
  sessionRecording: false,
  heatmaps: false,
  surveys: false,
  hasFeatureFlags: false,
  siteApps: [],
};

/** Turn PostHog on for this context and catch everything it sends. */
async function capturePostHog(context: BrowserContext, baseURL: string | undefined): Promise<Capture> {
  await context.addCookies([
    { name: POSTHOG_TEST_COOKIE, value: "1", url: baseURL ?? "http://localhost:3000" },
  ]);
  const capture: Capture = { events: [], raw: [] };
  await context.route("**/ingest/**", async (route) => {
    const req = route.request();
    // PostHog posts a Blob, which postData() doesn't read; the buffer works.
    const body = req.postDataBuffer()?.toString("utf8");
    if (body) {
      capture.raw.push(body);
      capture.events.push(...decode(body));
    }
    const { pathname } = new URL(req.url());
    const token = pathname.match(/\/array\/([^/]+)\/config/)?.[1];
    if (token && pathname.endsWith(".js")) {
      const script = `(window._POSTHOG_REMOTE_CONFIG = window._POSTHOG_REMOTE_CONFIG || {})[${JSON.stringify(token)}] = ${JSON.stringify({ config: REMOTE_CONFIG, siteApps: [] })};`;
      await route.fulfill({ status: 200, contentType: "application/javascript", body: script });
    } else if (token) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(REMOTE_CONFIG) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
  });
  return capture;
}

function named(capture: Capture, event: string): SentEvent[] {
  return capture.events.filter((e) => e.event === event);
}

async function superAdminId(): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

/** Wait until a $pageview for `pathEnd` has been sent. */
async function expectPageview(capture: Capture, pathEnd: string) {
  await expect
    .poll(() => named(capture, "$pageview").map((e) => String(e.properties?.$current_url ?? "")), {
      timeout: 10_000,
    })
    .toContainEqual(expect.stringMatching(new RegExp(`${pathEnd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)));
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("PostHog stays off without the e2e switch (prod-only)", async ({ page }) => {
    const sent: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/ingest")) sent.push(r.url());
    });
    await page.goto("/help");
    await page.waitForLoadState("networkidle");
    expect(sent).toEqual([]);
  });

  test("a page view is sent with the page and platform", async ({ page, context, baseURL }) => {
    const capture = await capturePostHog(context, baseURL);
    await page.goto("/help");
    await expectPageview(capture, "/help");
    expect(named(capture, "$pageview")[0].properties).toMatchObject({ platform: "web" });
  });

  test("a runner link's token never reaches PostHog", async ({ page, context, baseURL }) => {
    const capture = await capturePostHog(context, baseURL);
    const admin = createAdminClient();
    const ownerId = await superAdminId();
    const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
    await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
    const game = await makeGame(admin, { teamId: team.id, ownerId });

    await page.goto(`/run/${game.share_token}`);
    await expectPageview(capture, "/run/:token");
    expect(capture.raw.join("\n")).not.toContain(game.share_token);
  });

  test("an invite in ?next= is scrubbed", async ({ page, context, baseURL }) => {
    const capture = await capturePostHog(context, baseURL);
    await page.goto(`/login?next=${encodeURIComponent("/join/secret-invite-token")}`);
    await expectPageview(capture, "/login");
    const sent = capture.raw.join("\n");
    expect(sent).not.toContain("secret-invite-token");
    expect(sent).not.toContain("next=");
  });
});

test.describe("signed in", () => {
  test("taps never send a player's name", async ({ page, context, baseURL }) => {
    const capture = await capturePostHog(context, baseURL);
    const admin = createAdminClient();
    const ownerId = await superAdminId();
    // U12: AFL zones have ended, so each player row has a "Role for
    // <name>" button. Its aria-label holds the child's name.
    const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "afl" });
    const [player] = await makePlayers(admin, { teamId: team.id, ownerId, ageGroup: "U12" });
    const name = `Zebedee Quillfeather ${Date.now()}`;
    await admin.from("players").update({ full_name: name }).eq("id", player.id);

    await page.goto(`/teams/${team.id}/squad`);
    await expectPageview(capture, `/teams/${team.id}/squad`);
    await page.getByRole("button", { name: `Role for ${name}` }).click();

    // The tap was captured (so this isn't passing vacuously)...
    await expect.poll(() => named(capture, "$autocapture").length, { timeout: 10_000 }).toBeGreaterThan(0);
    // ...and nothing sent carries the name, not even part of it.
    expect(capture.raw.join("\n")).not.toContain("Quillfeather");
  });

  test("signed-in users are known by their id, never their email", async ({ page, context, baseURL }) => {
    const capture = await capturePostHog(context, baseURL);
    const userId = await superAdminId();

    await page.goto("/dashboard");
    await expect
      .poll(() => named(capture, "$identify").some((e) => JSON.stringify(e).includes(userId)), {
        timeout: 10_000,
      })
      .toBe(true);
    expect(capture.raw.join("\n")).not.toContain(process.env.TEST_SUPER_ADMIN_EMAIL!);
  });

  test("switching off usage data on My account stops capture", async ({ page, context, baseURL }) => {
    const capture = await capturePostHog(context, baseURL);
    await page.goto("/account");
    await expectPageview(capture, "/account");

    const toggle = page.getByRole("switch", { name: "Share usage data" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    capture.events.length = 0;
    capture.raw.length = 0;
    await page.goto("/help");
    await page.getByRole("link", { name: /faq/i }).first().click();
    await page.waitForURL(/\/help\/faq$/);
    // Debug mode sends each event at once, so a short settle is enough
    // to be sure nothing is on its way.
    await page.waitForTimeout(1500);
    expect(capture.events).toEqual([]);
  });
});

// ─── Phase 2: the event catalogue ────────────────────────────

interface ServerSink {
  events: { distinct_id: string | null; event: string; properties: Record<string, unknown> }[];
  /** Coaches whose PostHog person the server would have deleted. */
  forgotten: string[];
}

/** What the server "sent" in debug mode (src/app/api/e2e/analytics). */
async function serverSink(page: Page): Promise<ServerSink> {
  const res = await page.request.get("/api/e2e/analytics");
  expect(res.ok()).toBe(true);
  return (await res.json()) as ServerSink;
}

/** Wait for a server event for this team, and return it. */
async function serverEvent(page: Page, event: string, teamId: string) {
  let found: ServerSink["events"][number] | undefined;
  await expect
    .poll(
      async () => {
        found = (await serverSink(page)).events.find((e) => e.event === event && e.properties.team_id === teamId);
        return Boolean(found);
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return found!;
}

/** Wait for a client event matching `props`, and return it. */
async function clientEvent(capture: Capture, event: string, props: Record<string, unknown>) {
  await expect
    .poll(() => named(capture, event).map((e) => e.properties), { timeout: 10_000 })
    .toContainEqual(expect.objectContaining(props));
  return named(capture, event).find((e) => Object.entries(props).every(([k, v]) => e.properties?.[k] === v))!;
}

/** track() logs "[analytics] …" when a property breaks the catalogue. */
function catalogueProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && m.text().includes("[analytics]")) problems.push(m.text());
  });
  return problems;
}

// Every kid in these squads shares a surname nothing else on screen
// has, so any leak of a name, even part of one, shows up.
const SURNAME = "Quillfeather";

test.describe("Phase 2 events", () => {
  test("game day: start, score, undo and an injury are tracked with the sport and role, never a name", async ({
    page,
    context,
    baseURL,
  }) => {
    const capture = await capturePostHog(context, baseURL);
    const problems = catalogueProblems(page);
    const admin = createAdminClient();
    const ownerId = await superAdminId();
    const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
    await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
    for (const p of players) {
      await admin
        .from("players")
        .update({ full_name: `${p.full_name.split(" ")[0]} ${SURNAME}` })
        .eq("id", p.id);
    }
    const game = await makeGame(admin, { teamId: team.id, ownerId });
    await admin.from("game_availability").insert(
      players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })),
    );

    // Kick off through the lineup picker, as a coach does.
    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    await page.getByRole("button", { name: /^start q1$/i }).click({ timeout: 10_000 });
    await page.getByRole("button", { name: /^start [qh]\d+ now$/i }).click();
    await expect(page.getByRole("button", { name: /^clock — q1, running$/i })).toBeVisible({ timeout: 15_000 });

    // game_started comes from the server action, for the coach, with
    // no plan saved before the day.
    const started = await serverEvent(page, "game_started", team.id);
    expect(started.distinct_id).toBe(ownerId);
    expect(started.properties).toEqual({ team_id: team.id, sport: "afl", has_lineup_draft: false });

    // Who's on the field, from the lineup the start wrote.
    const { data: lineupEvent } = await admin
      .from("game_events")
      .select("metadata")
      .eq("game_id", game.id)
      .eq("type", "lineup_set")
      .single();
    const lineup = (lineupEvent!.metadata as { lineup: Record<string, string[]> }).lineup;
    const [scorerId, injuredId] = ["fwd", "mid", "back", "hfwd", "hback"].flatMap((z) => lineup[z] ?? []);

    // A goal from the dock.
    await page.getByTestId(`player-tile-${scorerId}`).click();
    await page.getByRole("button", { name: /\+ goal/i }).click();
    const goal = await clientEvent(capture, "score_recorded", { kind: "goal", via: "dock", side: "own" });
    // The team's sport and the coach's role ride on every event.
    expect(goal.properties).toMatchObject({ sport: "afl", team_role: "admin" });

    // Undo it.
    await page.getByRole("button", { name: /^undo$/i }).first().click();
    await clientEvent(capture, "undo_used", { sport: "afl", what: "score" });

    // Player actions, Mark injured, then the suggested replacement.
    await page.getByTestId(`player-tile-${injuredId}`).click();
    await page.getByRole("button", { name: /^player actions/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: /mark injured/i }).click();
    await clientEvent(capture, "lock_action", { sport: "afl", action: "injure" });
    const injuryDialog = page.getByRole("dialog", { name: /who comes on at/i });
    await injuryDialog.getByRole("button", { name: /suggested/i }).click();
    await clientEvent(capture, "injury_replacement", {
      sport: "afl",
      action: "replaced",
      reason: "injured",
      picked_suggested: true,
    });

    // Nothing sent, by the browser or the server, names a kid.
    expect(capture.raw.join("\n")).not.toContain(SURNAME);
    expect(JSON.stringify(await serverSink(page))).not.toContain(SURNAME);
    expect(problems).toEqual([]);
  });

  test("building a squad and adding a game are tracked from the server", async ({ page, context, baseURL }) => {
    await capturePostHog(context, baseURL);
    const admin = createAdminClient();
    const ownerId = await superAdminId();
    // AFL U8 plays 6 a side: the sixth kid completes the squad.
    const team = await makeTeam(admin, { ownerId, ageGroup: "U8", sport: "afl" });

    await page.goto(`/teams/${team.id}/squad`);
    await waitForHydration(page);
    await page.getByRole("button", { name: /^paste a list$/i }).click();
    await page
      .getByLabel(/paste your squad/i)
      .fill(["Ava", "Ben", "Cara", "Dev", "Eli", "Fay"].map((n) => `${n} ${SURNAME}`).join("\n"));
    await page.getByRole("button", { name: /^add 6 players$/i }).click();
    await expect(page.getByRole("status").filter({ hasText: /added 6 players/i })).toBeVisible({ timeout: 10_000 });

    const squad = await serverEvent(page, "squad_built", team.id);
    expect(squad.distinct_id).toBe(ownerId);
    expect(squad.properties).toEqual({ team_id: team.id, sport: "afl", player_count: 6 });

    await gotoStable(page, `/teams/${team.id}/games`);
    await page.getByRole("button", { name: /create manually/i }).click();
    await page.getByLabel(/opponent/i).fill(`Opp ${Date.now()}`);
    const inAWeek = new Date(Date.now() + 7 * 86_400_000);
    const local = new Date(inAWeek.getTime() - inAWeek.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    await page.getByLabel(/date.*time/i).fill(local);
    await page.getByRole("button", { name: /^create game$/i }).click();
    await page.waitForURL(/\/teams\/.+\/games\/.+/, { timeout: 10_000 });

    const created = await serverEvent(page, "game_created", team.id);
    expect(created.properties).toEqual({ team_id: team.id, sport: "afl", days_until_game: 7, source: "manual" });
    expect(JSON.stringify(await serverSink(page))).not.toContain(SURNAME);
  });

  test("switching off usage data also stops the server's events from this device", async ({
    page,
    context,
    baseURL,
  }) => {
    await capturePostHog(context, baseURL);
    const admin = createAdminClient();
    const ownerId = await superAdminId();
    const team = await makeTeam(admin, { ownerId, ageGroup: "U8", sport: "afl" });

    await page.goto("/account");
    const toggle = page.getByRole("switch", { name: "Share usage data" });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    await page.goto(`/teams/${team.id}/squad`);
    await waitForHydration(page);
    await page.getByRole("button", { name: /^paste a list$/i }).click();
    await page.getByLabel(/paste your squad/i).fill("Ava\nBen\nCara\nDev\nEli\nFay");
    await page.getByRole("button", { name: /^add 6 players$/i }).click();
    await expect(page.getByRole("status").filter({ hasText: /added 6 players/i })).toBeVisible({ timeout: 10_000 });

    // Debug mode keeps a server event the moment its props are worked
    // out, so a short settle is enough to be sure none is coming.
    await page.waitForTimeout(2_000);
    const sink = await serverSink(page);
    expect(sink.events.filter((e) => e.properties.team_id === team.id)).toEqual([]);
  });

  test("a new coach's team is tracked, and deleting the account deletes their PostHog person", async ({
    browser,
    baseURL,
  }) => {
    const admin = createAdminClient();
    const stamp = Date.now();
    const user = await createTestUser(admin, {
      email: `posthog-forget-${stamp}@siren.test`,
      password: "posthog-forget-pw-1234",
    });
    const context = await browser.newContext({ ...NO_SERVICE_WORKER, storageState: { cookies: [], origins: [] } });
    try {
      await capturePostHog(context, baseURL);
      const page = await context.newPage();
      await page.goto("/login");
      await waitForHydration(page);
      await page.getByTestId("login-mode-toggle").click();
      await page.getByTestId("login-email").fill(user.email);
      await page.getByTestId("login-password").fill(user.password);
      await page.getByTestId("login-submit").click();
      await page.waitForURL(/\/(dashboard|teams\/new|welcome)/, { timeout: 15_000 });
      await waitForHydration(page);

      if (!page.url().includes("/teams/new")) {
        await gotoStable(page, "/teams/new");
        await waitForHydration(page);
      }
      await page.getByLabel(/team name/i).fill(`${SURNAME} Comets ${stamp}`);
      await page.getByLabel(/age group/i).selectOption("U10");
      await page.getByRole("button", { name: /continue/i }).click();
      await page.waitForURL(/\/teams\/[0-9a-f-]+/, { timeout: 10_000 });
      const teamId = page.url().match(/\/teams\/([0-9a-f-]+)/)![1];

      const created = await serverEvent(page, "team_created", teamId);
      expect(created.distinct_id).toBe(user.id);
      expect(created.properties).toEqual({ team_id: teamId, sport: "afl", age_group: "U10" });
      // The team's name never leaves.
      expect(JSON.stringify(await serverSink(page))).not.toContain(SURNAME);

      await page.goto("/account");
      await page.getByTestId("open-delete-account-modal").click();
      const modal = page.getByRole("dialog", { name: /delete your account/i });
      await modal.getByLabel(/type delete to confirm/i).fill("delete");
      await modal.getByRole("button", { name: /schedule deletion/i }).click();
      await expect(modal).toBeHidden({ timeout: 10_000 });

      await expect.poll(async () => (await serverSink(page)).forgotten, { timeout: 10_000 }).toContain(user.id);
    } finally {
      await context.close();
      await deleteTestUser(admin, user.id);
    }
  });
});
