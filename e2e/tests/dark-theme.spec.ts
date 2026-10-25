// ─── The dark theme ─────────────────────────────────────────────────
// Round 3's accessibility pass opted the app out of forced dark mode
// (`color-scheme: only light`) because there was no dark palette, and
// Chrome's auto-dark sank the dark sub card into an inverted page. The
// app now has a real dark theme (src/lib/theme/palette.ts) that follows
// the phone's setting, with a System / Light / Dark choice on Account.
//
// Each test opens a screen with the phone in dark mode and reads what's
// painted: the page must be dark, the root's color-scheme must say dark
// (so form controls and scrollbars follow), and every visible word must
// clear its WCAG contrast minimum against what's behind it. Screenshots
// land in playwright/dark-theme/<project>/ for a human look.

import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { finishedGame, fullTime, playPeriod } from "../helpers/finished-game";
import { netballGame, ownerOf, skipHints } from "../helpers/a11y";
import { waitForHydration } from "../helpers/navigation";
import { expectDarkAndReadable, readTheme } from "../helpers/theme";
import type { SportId } from "../../src/lib/sports";

test.describe.configure({ mode: "parallel" });
test.use({ colorScheme: "dark" });

const tag = () => `${Date.now() % 100000}${Math.random().toString(36).slice(2, 5)}`;

type LiveSport = "afl" | "rugby_league" | "rugby_union" | "soccer" | "basketball";

/**
 * A game in its first period, `secondsIn` seconds in (game time is 6×
 * that). `subIntervalSec` 30 puts a sub due straight away; the default
 * keeps the sub card quiet.
 */
async function liveGame(sport: LiveSport, opts: { subIntervalSec?: number; secondsIn?: number; ended?: boolean } = {}) {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const ageGroup = { afl: "U10", rugby_league: "U13", rugby_union: "U12", soccer: "U9", basketball: "U12" }[sport];
  const count = { afl: 15, rugby_league: 15, rugby_union: 17, soccer: 9, basketball: 7 }[sport];
  const team = await makeTeam(admin, { ownerId, sport, ageGroup, name: `DARK ${sport} ${tag()}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count, ageGroup: sport === "rugby_league" ? "U10" : ageGroup });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Hawks" });
  await admin
    .from("games")
    .update({ clock_multiplier: opts.subIntervalSec ? 6 : 1, sub_interval_seconds: opts.subIntervalSec ?? 900, status: "in_progress" })
    .eq("id", game.id);
  await admin
    .from("game_availability")
    .insert(players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })));
  const ids = players.map((p) => p.id);
  const lineup = {
    afl: { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) },
    rugby_league: { forwards: ids.slice(0, 6), backs: ids.slice(6, 13), bench: ids.slice(13) },
    rugby_union: { forwards: ids.slice(0, 8), backs: ids.slice(8, 15), bench: ids.slice(15) },
    soccer: { keeper: ids[0], lines: { def: ids.slice(1, 3), mid: ids.slice(3, 6), att: ids.slice(6, 7), field: [] }, bench: ids.slice(7) },
    basketball: { lines: { guard: ids.slice(0, 2), forward: ids.slice(2, 5), court: [] }, bench: ids.slice(5) },
  }[sport];
  const secondsIn = opts.secondsIn ?? 20;
  const t = (secAgo: number) => new Date(Date.now() - secAgo * 1000).toISOString();
  const rows = [
    { type: "lineup_set", metadata: { lineup, sport }, created_at: t(secondsIn + 1) },
    { type: "quarter_start", metadata: { quarter: 1, sport }, created_at: t(secondsIn) },
    // A score each way, so the scorebug and chips have numbers in them.
    ...(sport === "afl"
      ? [
          { type: "goal", player_id: ids[8], metadata: { quarter: 1, sport }, created_at: t(secondsIn - 2) },
          { type: "opponent_behind", metadata: { quarter: 1, sport }, created_at: t(secondsIn - 3) },
        ]
      : []),
    ...(opts.ended ? [{ type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 720_000, sport }, created_at: t(1) }] : []),
  ];
  const { error } = await admin.from("game_events").insert(rows.map((e) => ({ ...e, game_id: game.id, created_by: ownerId })));
  if (error) throw new Error(error.message);
  return { admin, team, game, players, url: `/teams/${team.id}/games/${game.id}/live` };
}

/** A team with a game not yet started: the lineup picker. */
async function lineupGame(sport: SportId) {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport, name: `DARK ${sport} ${tag()}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 16 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Hawks" });
  await admin
    .from("game_availability")
    .insert(players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available" as const, updated_by: ownerId })));
  return { admin, team, game };
}

async function open(page: Page, url: string) {
  await page.goto(url);
  await waitForHydration(page);
}

const clockPill = (page: Page) => page.getByRole("button", { name: /^clock — /i }).first();

test.beforeEach(async ({ page }) => {
  await skipHints(page);
  // Reduce motion (the app's own switch): pulses and sheet entrances
  // land on their final frame, so colours are read at rest.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("siren-motion-pref-v1", "reduce");
    } catch {}
  });
});

// ── Signed out ─────────────────────────────────────────────────────

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login", async ({ page }, testInfo) => {
    await open(page, "/login");
    await expect(page.getByRole("button", { name: /continue|sign in|send/i }).first()).toBeVisible();
    await expectDarkAndReadable(page, testInfo, "login");
  });

  test("the marketing site keeps its light brand page", async ({ page }, testInfo) => {
    await open(page, "/");
    const shell = page.locator(".theme-light").first();
    await expect(shell).toHaveCSS("color-scheme", "light");
    // The heading is still dark ink on the light brand gradient.
    await expect(page.locator("h1").first()).toHaveCSS("color", "rgb(26, 30, 26)");
    await page.screenshot({ path: `playwright/dark-theme/${testInfo.project.name}/marketing.png` });
  });
});

// ── Around the team ────────────────────────────────────────────────

test("dashboard", async ({ page }, testInfo) => {
  const { team } = await lineupGame("afl");
  await open(page, "/dashboard");
  await expect(page.getByText(team.name).first()).toBeVisible({ timeout: 15_000 });
  await expectDarkAndReadable(page, testInfo, "dashboard");
});

test("team home", async ({ page }, testInfo) => {
  const { team } = await lineupGame("afl");
  await open(page, `/teams/${team.id}`);
  await expect(page.getByText(/hawks/i).first()).toBeVisible({ timeout: 15_000 });
  await expectDarkAndReadable(page, testInfo, "team-home");
});

test("account, with the theme choice", async ({ page }, testInfo) => {
  await open(page, "/account");
  await expect(page.getByRole("radiogroup", { name: /theme/i })).toBeVisible({ timeout: 15_000 });
  await expectDarkAndReadable(page, testInfo, "account");
});

// ── Every sport's lineup picker ────────────────────────────────────

const ALL_SPORTS: SportId[] = ["afl", "netball", "rugby_league", "rugby_union", "soccer", "futsal", "hockey", "basketball", "touch", "oztag"];

for (const sport of ALL_SPORTS) {
  test(`lineup: ${sport}`, async ({ page }, testInfo) => {
    const { team, game } = await lineupGame(sport);
    await open(page, `/teams/${team.id}/games/${game.id}/live`);
    await expect(page.getByRole("button", { name: /^start /i }).first()).toBeVisible({ timeout: 20_000 });
    await expectDarkAndReadable(page, testInfo, `lineup-${sport}`);
  });
}

// ── The live screen ────────────────────────────────────────────────

test("live AFL: running", async ({ page }, testInfo) => {
  const { url } = await liveGame("afl");
  await open(page, url);
  await expect(clockPill(page)).toBeVisible({ timeout: 15_000 });
  await expectDarkAndReadable(page, testInfo, "live-afl-running");
});

test("live AFL: the sub card", async ({ page }, testInfo) => {
  const { url } = await liveGame("afl", { subIntervalSec: 30, secondsIn: 10 });
  await open(page, url);
  await expect(page.getByTestId("swapcard-apply-all").or(page.getByRole("button", { name: /^make (all \d+ swaps|this swap)$/i })).first()).toBeVisible({
    timeout: 20_000,
  });
  await expectDarkAndReadable(page, testInfo, "live-afl-sub-card");
});

test("live AFL: the long-press sheet", async ({ page }, testInfo) => {
  const { url, players } = await liveGame("afl");
  await open(page, url);
  await page.getByTestId(`player-tile-${players[0].id}`).click({ delay: 600 });
  await expect(page.getByRole("button", { name: /lend to opposition/i })).toBeVisible();
  await expectDarkAndReadable(page, testInfo, "live-afl-long-press", "[role=dialog]");
});

test("live AFL: the scorer sheet", async ({ page }, testInfo) => {
  const { url, players } = await liveGame("afl");
  await open(page, url);
  await page.getByTestId(`player-tile-${players[9].id}`).click();
  await expect(page.getByRole("button", { name: /\+ goal/i })).toBeVisible();
  // The dock's words; the field behind it is dimmed on purpose.
  await page
    .getByText(/^Record score for/)
    .locator("xpath=ancestor::div[contains(@class, 'shadow-modal')][1]")
    .evaluate((el) => el.setAttribute("data-e2e-sample", ""));
  await expectDarkAndReadable(page, testInfo, "live-afl-scorer", "[data-e2e-sample]");
});

for (const sport of ["rugby_league", "rugby_union", "soccer", "basketball"] as const) {
  test(`live ${sport}: running, with the sub card`, async ({ page }, testInfo) => {
    const { url } = await liveGame(sport, { subIntervalSec: 30, secondsIn: 10 });
    await open(page, url);
    await expect(clockPill(page)).toBeVisible({ timeout: 15_000 });
    await expectDarkAndReadable(page, testInfo, `live-${sport}`);
  });
}

test("live netball: running and the scorer dock", async ({ page }, testInfo) => {
  const { team, game } = await netballGame({ name: "DARK-NB" });
  await open(page, `/teams/${team.id}/games/${game.id}/live`);
  await expect(clockPill(page)).toBeVisible({ timeout: 15_000 });
  await expectDarkAndReadable(page, testInfo, "live-netball");
  await page.getByRole("button", { name: /^goal shooter, /i }).click();
  await expect(page.getByText(/^Record goal for/)).toBeVisible();
  await expectDarkAndReadable(page, testInfo, "live-netball-scorer");
});

// ── The break, full time and after ─────────────────────────────────

test("the break (AFL)", async ({ page }, testInfo) => {
  const { url } = await liveGame("afl", { ended: true });
  await open(page, url);
  await expect(page.getByRole("button", { name: /^start q2/i })).toBeVisible({ timeout: 20_000 });
  await expectDarkAndReadable(page, testInfo, "break-afl");
});

test("the break (rugby union)", async ({ page }, testInfo) => {
  const { url } = await liveGame("rugby_union", { ended: true });
  await open(page, url);
  await expect(page.getByRole("button", { name: /^start (h2|2nd half)/i })).toBeVisible({ timeout: 20_000 });
  await expectDarkAndReadable(page, testInfo, "break-union");
});

async function aflAtQ4Hooter(admin: SupabaseClient) {
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl", name: `DARK FT ${tag()}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Hawks" });
  const ids = players.map((p) => p.id);
  const lineup = { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
  const Q = 13 * 60_000;
  const now = Date.now();
  const at = (ms: number) => new Date(now - ms).toISOString();
  const rows: Record<string, unknown>[] = [{ type: "lineup_set", metadata: { lineup }, created_at: at(5 * Q) }];
  for (let q = 1; q <= 4; q++) {
    rows.push({ type: "quarter_start", metadata: { quarter: q }, created_at: at((5 - q) * Q) });
    rows.push({ type: "goal", player_id: ids[8 + q - 1], metadata: { quarter: q }, created_at: at((5 - q) * Q - 60_000) });
    if (q < 4) rows.push({ type: "quarter_end", metadata: { quarter: q, elapsed_ms: Q }, created_at: at((4 - q) * Q) });
  }
  rows.push({ type: "opponent_goal", metadata: { quarter: 2 }, created_at: at(3 * Q - 90_000) });
  await admin.from("game_events").insert(rows.map((r) => ({ ...r, game_id: game.id, created_by: ownerId })));
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  return { team, game };
}

test("full time (AFL)", async ({ page }, testInfo) => {
  const { team, game } = await aflAtQ4Hooter(createAdminClient());
  await open(page, `/teams/${team.id}/games/${game.id}/live`);
  // Past the Q4 hooter the screen offers End game, or (WebKit, a slower
  // load) has already moved on to the full-time review.
  const endGame = page.getByRole("button", { name: /^end game$/i });
  const finish = page.getByRole("button", { name: /finish game/i });
  await expect(endGame.or(finish).first()).toBeVisible({ timeout: 20_000 });
  if (await endGame.isVisible()) await endGame.click();
  await expect(finish).toBeVisible({ timeout: 10_000 });
  await expectDarkAndReadable(page, testInfo, "full-time-review");
  await page.getByRole("button", { name: /finish game/i }).click();
  await expect(page.getByText(/full time|final score|game summary/i).first()).toBeVisible({ timeout: 15_000 });
  await expectDarkAndReadable(page, testInfo, "full-time-summary");
});

test("game summary and stats (AFL)", async ({ page }, testInfo) => {
  const { team, game } = await finishedGame("afl", 15, (ids) => {
    const lineup = { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
    return [
      { type: "lineup_set", metadata: { lineup } },
      ...playPeriod(1, [{ type: "goal", player_id: ids[8], metadata: { quarter: 1 } }, { type: "opponent_behind", metadata: { quarter: 1 } }], 720_000),
      ...playPeriod(2, [{ type: "behind", player_id: ids[9], metadata: { quarter: 2 } }, { type: "opponent_goal", metadata: { quarter: 2 } }], 720_000),
      fullTime,
    ];
  });
  await open(page, `/teams/${team.id}/games/${game.id}`);
  await expect(page.getByText(/final|full time|won|lost|drew/i).first()).toBeVisible({ timeout: 15_000 });
  await expectDarkAndReadable(page, testInfo, "game-summary");
  await open(page, `/teams/${team.id}/stats`);
  await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
  await expectDarkAndReadable(page, testInfo, "stats");
});

// ── The choice on Account, and no flash ────────────────────────────

test("Light on Account wins over a dark phone, from the first paint", async ({ page }) => {
  await open(page, "/account");
  await page.getByRole("radio", { name: /^light/i }).check();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
  expect((await readTheme(page)).bodyLum).toBeGreaterThan(0.5);
  // On the next load the theme is on <html> before any app code runs:
  // the body's colour at DOMContentLoaded is already light.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      (window as unknown as { __firstBg: string }).__firstBg = getComputedStyle(document.body).backgroundColor;
    });
  });
  await page.goto("/dashboard");
  const first = await page.evaluate(() => (window as unknown as { __firstBg: string }).__firstBg);
  expect(first).toBe("rgb(247, 245, 241)");
  // Back to System: the dark phone's setting again.
  await open(page, "/account");
  await page.getByRole("radio", { name: /^system/i }).check();
  await expect.poll(async () => (await readTheme(page)).bodyLum).toBeLessThan(0.03);
});

test.describe("a light phone", () => {
  test.use({ colorScheme: "light" });

  test("Dark on Account wins over a light phone, from the first paint", async ({ page }) => {
    await open(page, "/account");
    expect((await readTheme(page)).bodyLum, "light by default").toBeGreaterThan(0.5);
    await page.getByRole("radio", { name: /^dark/i }).check();
    await expect.poll(async () => (await readTheme(page)).bodyLum).toBeLessThan(0.03);
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        (window as unknown as { __firstBg: string }).__firstBg = getComputedStyle(document.body).backgroundColor;
      });
    });
    await page.goto("/dashboard");
    const first = await page.evaluate(() => (window as unknown as { __firstBg: string }).__firstBg);
    expect(first).toBe("rgb(15, 19, 17)");
    await page.evaluate(() => localStorage.removeItem("siren-theme-v1"));
  });
});
