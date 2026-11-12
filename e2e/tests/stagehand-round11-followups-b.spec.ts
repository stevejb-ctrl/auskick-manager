// Stagehand round 11 follow-ups (12 Nov 2026): six of the friction
// points in .planning/USABILITY-STAGEHAND-2026-11-ROUND11.md that Steve
// decided on. Each test names its friction number there.
//
//   #4  The loader after Start game day (and on the game-day link),
//       not a blank screen.
//   #2/#3  The break says when it re-planned the lineup, and the score
//       margin says what it is ("Up by 1").
//   #5  The sub interval reads one way everywhere ("Sub every 10 min").
//   #6  A mixed team's cap is on How we play.
//   #11 The game page says how long the periods are.
//   #12 The Game plan names the rotation that made it.

import { test, expect, type Locator, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel", timeout: 120_000 });

type Admin = ReturnType<typeof createAdminClient>;

async function ownerOf(admin: Admin) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

const uniq = () => `${Date.now() % 100000}${Math.random().toString(36).slice(2, 5)}`;

async function quiet(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const k of ["gm-walkthrough-seen", "nb-walkthrough-seen", "league-walkthrough-seen", "rl-walkthrough-seen"]) {
        localStorage.setItem(k, "1");
      }
    } catch {}
  });
}

async function available(admin: Admin, gameId: string, ownerId: string, ids: string[]) {
  await admin
    .from("game_availability")
    .upsert(ids.map((id) => ({ game_id: gameId, player_id: id, status: "available" as const, updated_by: ownerId })), {
      onConflict: "game_id,player_id",
    });
}

/**
 * Hold the server's answer for a page (its RSC payload) for a few
 * seconds, so what shows while it loads can be seen. The link's
 * prefetch goes straight through: it carries the loading state, which
 * the router shows on the tap, as on a phone that's been on the page a
 * moment.
 */
async function slowRoute(page: Page, path: RegExp, ms = 4000) {
  await page.route(
    (url) => path.test(url.pathname),
    async (route) => {
      const h = route.request().headers();
      if (h["rsc"] && !h["next-router-prefetch"]) await new Promise((r) => setTimeout(r, ms));
      await route.continue();
    },
  );
}

/** The router's prefetch of a page (its loading state), on hover. */
async function prefetched(page: Page, link: Locator, path: RegExp) {
  const done = page
    .waitForResponse((r) => path.test(new URL(r.url()).pathname) && !!r.request().headers()["next-router-prefetch"], { timeout: 15_000 })
    .catch(() => null);
  await link.hover();
  await done;
}

// ─── #4 The loader, not a blank screen ──────────────────────────
// live/loading.tsx rendered nothing (so an in-route refresh doesn't
// flash), and the first way in after Start game day was blank for as
// long as the server took.

test("#4 Start game day shows the loader while the game-day screen loads", async ({ page }) => {
  await quiet(page);
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `R11B load ${uniq()}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Eagles", scheduledAt: new Date(Date.now() + 3600_000).toISOString() });
  await available(admin, game.id, ownerId, players.map((p) => p.id));

  await slowRoute(page, /\/live$/);
  await page.goto(`/teams/${team.id}/games/${game.id}`);
  await waitForHydration(page);
  const start = page.getByRole("link", { name: /^start game day/i });
  await prefetched(page, start, /\/live$/);
  await start.click();
  const loader = page.getByTestId("game-day-loading");
  await expect(loader).toBeVisible({ timeout: 3500 });
  await expect(loader.getByRole("status", { name: "Loading the game" })).toBeAttached();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath("r11b-loader-live.png") });
  await expect(page.getByRole("button", { name: /^ready$/i })).toBeVisible({ timeout: 30_000 });
  await expect(loader).toHaveCount(0);
});

test("#4 the game-day link streams the loader first, while its screen loads", async ({ page }) => {
  await quiet(page);
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "netball", ageGroup: "11u", name: `R11B run ${uniq()}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 9 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Swifts" });
  await available(admin, game.id, ownerId, players.map((p) => p.id));

  // A parent opening the link: the page streams the loader, then the
  // screen in its place (the link had no loading state: nothing showed
  // until the whole screen was ready).
  const html = await (await page.request.get(`/run/${game.share_token}`)).text();
  const loaderAt = html.indexOf(`data-testid="game-day-loading"`);
  expect(loaderAt, "the loader is in the streamed page").toBeGreaterThan(-1);
  expect(html.indexOf("Who&#x27;s here today?") === -1 || html.indexOf("Who&#x27;s here today?") > loaderAt).toBe(true);

  // What the parent sees while it streams: the page up to the screen.
  const cut = html.indexOf(`<div hidden id="S:`);
  await page.route(`**/run/${game.share_token}`, (route) =>
    route.request().resourceType() === "document"
      ? route.fulfill({ status: 200, contentType: "text/html", body: cut > 0 ? html.slice(0, cut) : html })
      : route.continue(),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/run/${game.share_token}`);
  await expect(page.getByTestId("game-day-loading")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("r11b-loader-run.png") });
});

// ─── #2 and #3 The break says what changed ──────────────────────
// Bring back a lent kid (or any change to who can play) and the break's
// suggestion re-planned silently; the "+1" beside the score said nothing.

async function seedBreak(
  admin: Admin,
  ownerId: string,
  gameId: string,
  sport: string,
  lineup: unknown,
  periodMs: number,
  extra: { type: string; player_id?: string; metadata: Record<string, unknown> }[] = [],
) {
  const start = Date.now() - periodMs - 120_000;
  const at = (ms: number) => new Date(start + ms).toISOString();
  const meta = (m: Record<string, unknown>) => ({ ...m, sport });
  await admin.from("game_events").insert([
    { game_id: gameId, type: "lineup_set", metadata: meta({ lineup }), created_by: ownerId, created_at: at(0) },
    { game_id: gameId, type: "quarter_start", metadata: meta({ quarter: 1 }), created_by: ownerId, created_at: at(1000) },
    ...extra.map((e, i) => ({
      game_id: gameId,
      type: e.type,
      player_id: e.player_id ?? null,
      metadata: meta(e.metadata),
      created_by: ownerId,
      created_at: at(2000 + i * 1000),
    })),
    { game_id: gameId, type: "quarter_end", metadata: meta({ quarter: 1, elapsed_ms: periodMs }), created_by: ownerId, created_at: at(periodMs + 1000) },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", gameId);
}

async function openBreak(page: Page, teamId: string, gameId: string, title: RegExp) {
  await page.goto(`/teams/${teamId}/games/${gameId}/live`);
  await waitForHydration(page);
  const selectTeam = page.getByRole("button", { name: /select team for/i });
  await expect(page.getByRole("heading", { name: title }).or(selectTeam)).toBeVisible({ timeout: 20_000 });
  if (await selectTeam.isVisible()) await selectTeam.click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 20_000 });
}

test("#2 #3 soccer: the margin says Up by 1, and bringing a lent kid back says the lineup was re-planned", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await quiet(page);
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "soccer", ageGroup: "U10", name: `R11B soc ${uniq()}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Rovers" });
  const k = players.map((p) => p.id);
  await available(admin, game.id, ownerId, k);
  // 9 a side; k[11] lent to the other side from kickoff.
  const lineup = { keeper: k[0], lines: { def: k.slice(1, 4), mid: k.slice(4, 7), att: k.slice(7, 9), field: [] }, bench: k.slice(9) };
  await seedBreak(admin, ownerId, game.id, "soccer", lineup, 25 * 60_000, [
    { type: "player_loan", player_id: k[11], metadata: { loaned: true, quarter: 1, elapsed_ms: 0 } },
    { type: "goal", player_id: k[7], metadata: { quarter: 1, elapsed_ms: 60_000 } },
    { type: "opponent_goal", metadata: { quarter: 1, elapsed_ms: 90_000 } },
    { type: "goal", player_id: k[8], metadata: { quarter: 1, elapsed_ms: 120_000 } },
  ]);

  await openBreak(page, team.id, game.id, /^2nd half lineup$/);
  const score = page.getByRole("button", { name: /review and update scores/i });
  await expect(score).toContainText("2 – 1");
  await expect(score.getByTestId("break-margin")).toHaveText("Up by 1");
  await expect(score).toHaveAccessibleName(/up by 1/i);
  await expect(page.getByTestId("break-replanned")).toHaveCount(0);

  await page.getByTestId(`break-bring-back-${k[11]}`).click();
  const note = page.getByTestId("break-replanned");
  await expect(note).toBeVisible({ timeout: 15_000 });
  await expect(note).toHaveText(/^Lineup re-planned: \d+ kids? moved\.$/);
  await expect(note).toHaveAttribute("role", "status");
  await page.screenshot({ path: test.info().outputPath("r11b-break-soccer.png") });

  // The coach's own change says nothing more: the line goes.
  await page.getByRole("radiogroup", { name: "How the next lineup is built" }).getByRole("radio", { name: "Repeat" }).click();
  await expect(note).toHaveCount(0);
});

test("#2 #3 rugby league: Down by 4 beside the score, and a re-plan said in the break", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await quiet(page);
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "rugby_league", ageGroup: "U10", name: `R11B rl ${uniq()}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Sharks" });
  const size = game.on_field_size as number;
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: size + 3 });
  const k = players.map((p) => p.id);
  await available(admin, game.id, ownerId, k);
  const fwd = Math.floor(size / 2);
  const lent = k[size + 2];
  const lineup = { forwards: k.slice(0, fwd), backs: k.slice(fwd, size), bench: k.slice(size, size + 2) };
  await seedBreak(admin, ownerId, game.id, "rugby_league", lineup, 20 * 60_000, [
    { type: "player_loan", player_id: lent, metadata: { loaned: true, quarter: 1, elapsed_ms: 0 } },
    { type: "opponent_try", metadata: { quarter: 1, elapsed_ms: 60_000 } },
  ]);

  await openBreak(page, team.id, game.id, /lineup$/);
  const score = page.getByRole("button", { name: /review and update scores/i });
  await expect(score.getByTestId("break-margin")).toHaveText("Down by 4");
  await page.getByTestId(`break-bring-back-${lent}`).click();
  await expect(page.getByTestId("break-replanned")).toHaveText(/^Lineup re-planned: \d+ kids? moved\.$/, { timeout: 15_000 });
  await page.screenshot({ path: test.info().outputPath("r11b-break-league.png") });
});

// ─── #5 The sub interval, one way ───────────────────────────────

test("#5 the sub interval reads Sub every … in AFL's and league's Game settings", async ({ page }) => {
  await quiet(page);
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  for (const sport of ["afl", "rugby_league"] as const) {
    const team = await makeTeam(admin, { ownerId, sport, ageGroup: "U10", name: `R11B sub ${sport} ${uniq()}` });
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
    const game = await makeGame(admin, { teamId: team.id, ownerId });
    await available(admin, game.id, ownerId, players.map((p) => p.id));
    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    await waitForHydration(page);
    await expect(page.getByRole("button", { name: /^ready$/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /game settings/i }).click();
    const box = page.locator(sport === "afl" ? "#sub-minutes" : "#sub-interval");
    await box.fill("6");
    await box.blur();
    await expect(page.getByText(/\bSub every 6 min\b/), sport).toBeVisible();
    await expect(page.getByText(/Sub every 6m\b|\b6 min subs|Subs every/), sport).toHaveCount(0);
  }
});

// ─── #6 A mixed team's cap is on How we play ────────────────────

test("#6 a touch team's mixed rule is under How we play, not Season", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "touch", ageGroup: "U11", name: `R11B mix ${uniq()}` });
  await admin.from("teams").update({ mixed_max_boys: 3, mixed_min_girls: 1, mixed_min_boys: 1 }).eq("id", team.id);

  await page.goto(`/teams/${team.id}/settings`);
  await waitForHydration(page);
  const howWePlay = page.locator("section#how-we-play");
  const card = howWePlay.getByTestId("mixed-rule-settings");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText("At most 3 boys on the field, at least 1 girl and 1 boy.");
  await expect(page.locator("section#season").getByTestId("mixed-rule-settings")).toHaveCount(0);
  await expect(page.getByTestId("mixed-rule-settings")).toHaveCount(1);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("r11b-how-we-play-mixed.png") });

  // It still saves (the same server check).
  await card.getByLabel("Most boys").selectOption("2");
  await card.getByRole("button", { name: "Save rule" }).click();
  await expect
    .poll(async () => (await admin.from("teams").select("mixed_max_boys").eq("id", team.id).single()).data?.mixed_max_boys, { timeout: 15_000 })
    .toBe(2);

  // The wizard's How we play step has it too.
  await page.goto(`/teams/${team.id}/setup?step=config`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: "How we play" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("mixed-rule-settings")).toContainText("At most 2 boys on the field");
});

// ─── #11 The game page says how long the periods are ────────────

test("#11 the game page shows the periods and their length, with the team's own length", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const afl = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `R11B len ${uniq()}` });
  const aflGame = await makeGame(admin, { teamId: afl.id, ownerId, opponent: "Eagles" });
  await page.goto(`/teams/${afl.id}/games/${aflGame.id}`);
  await expect(page.getByTestId("game-period-format")).toHaveText("4 × 12 min quarters", { timeout: 15_000 });

  // The team's own length (Settings) reaches today's game.
  await admin.from("teams").update({ quarter_length_seconds: 600 }).eq("id", afl.id);
  await page.reload();
  await expect(page.getByTestId("game-period-format")).toHaveText("4 × 10 min quarters", { timeout: 15_000 });
  await page.screenshot({ path: test.info().outputPath("r11b-game-page-length.png") });

  const soccer = await makeTeam(admin, { ownerId, sport: "soccer", ageGroup: "U10", name: `R11B len s ${uniq()}` });
  const soccerGame = await makeGame(admin, { teamId: soccer.id, ownerId, opponent: "Rovers" });
  await page.goto(`/teams/${soccer.id}/games/${soccerGame.id}`);
  await expect(page.getByTestId("game-period-format")).toHaveText(/^2 × \d+ min halves$/, { timeout: 15_000 });
});

// ─── #12 The Game plan names its rotation ───────────────────────

test("#12 the Game plan says which rotation made it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const afl = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `R11B plan ${uniq()}` });
  await makePlayers(admin, { teamId: afl.id, ownerId, count: 15 });
  const aflGame = await makeGame(admin, { teamId: afl.id, ownerId, opponent: "Eagles" });
  await page.goto(`/teams/${afl.id}/games/${aflGame.id}`);
  await page.getByRole("button", { name: /^game plan$/i }).click({ timeout: 15_000 });
  await expect(page.getByTestId("game-plan-rotation")).toHaveText("Rotation: Suggested", { timeout: 10_000 });
  await page.screenshot({ path: test.info().outputPath("r11b-game-plan-rotation.png") });

  // A netball team on Position cycle says so.
  const nb = await makeTeam(admin, { ownerId, sport: "netball", ageGroup: "11u", name: `R11B plan nb ${uniq()}` });
  await admin.from("team_playbooks").upsert({ team_id: nb.id, strategy: "position-cycle" }, { onConflict: "team_id" });
  await makePlayers(admin, { teamId: nb.id, ownerId, count: 9 });
  const nbGame = await makeGame(admin, { teamId: nb.id, ownerId, opponent: "Swifts" });
  await page.goto(`/teams/${nb.id}/games/${nbGame.id}`);
  await page.getByRole("button", { name: /^game plan$/i }).click({ timeout: 15_000 });
  await expect(page.getByTestId("game-plan-rotation")).toHaveText("Rotation: Position cycle", { timeout: 10_000 });
});
