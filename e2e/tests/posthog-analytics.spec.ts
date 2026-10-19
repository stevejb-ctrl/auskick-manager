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
// src/lib/analytics/{sanitize,posthog-config}.ts.

import { test, expect, type BrowserContext } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeGame, makePlayers, makeTeam } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

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
});
