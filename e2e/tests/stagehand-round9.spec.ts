// Stagehand round 9 (29 Oct 2026): the front door, a coach's season,
// each sport's rules, desktop and keyboard, and round 8's fixes from a
// parent's side. .planning/USABILITY-STAGEHAND-2026-10-ROUND9.md has the
// findings; each test here names its number. #1 (a game manager's game
// never leaving "Upcoming") is game-manager-runs-game.spec.

import { test, expect, type Browser, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import { contrastOf, skipHints } from "../helpers/a11y";

test.describe.configure({ mode: "parallel" });

type Admin = ReturnType<typeof createAdminClient>;

async function ownerOf(admin: Admin) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

const uniq = () => `${Date.now() % 100000}${Math.random().toString(36).slice(2, 5)}`;

type Sport = "afl" | "soccer" | "netball" | "rugby_league";
const LINEUPS: Record<Sport, { age: string; count: number; lineup: (ids: string[]) => Record<string, unknown> }> = {
  afl: { age: "U10", count: 15, lineup: (ids) => ({ back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) }) },
  soccer: { age: "U12", count: 12, lineup: (ids) => ({ keeper: ids[0], lines: { def: ids.slice(1, 4), mid: ids.slice(4, 7), att: ids.slice(7, 9), field: [] }, bench: ids.slice(9) }) },
  netball: { age: "11u", count: 9, lineup: (ids) => ({ positions: Object.fromEntries(["gs", "ga", "wa", "c", "wd", "gd", "gk"].map((k, i) => [k, [ids[i]]])), bench: ids.slice(7) }) },
  rugby_league: { age: "U8", count: 11, lineup: (ids) => ({ forwards: ids.slice(0, 3), backs: ids.slice(3, 8), bench: ids.slice(8) }) },
};

/** A game `secs` into its first period: the team, game, kids and its share token. */
async function inFirstPeriod(sport: Sport, opts: { secs?: number; subIntervalSeconds?: number } = {}) {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const cfg = LINEUPS[sport];
  const team = await makeTeam(admin, { ownerId, sport, ageGroup: cfg.age, name: `R9 ${sport} ${uniq()}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: cfg.count });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Sharks" });
  const ids = players.map((p) => p.id);
  const at = (s: number) => new Date(Date.now() - (opts.secs ?? 60) * 1000 + s * 1000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup: cfg.lineup(ids), sport }, created_by: ownerId, created_at: at(0) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1, sport }, created_by: ownerId, created_at: at(1) },
  ]);
  await admin
    .from("games")
    .update({ status: "in_progress", ...(opts.subIntervalSeconds ? { sub_interval_seconds: opts.subIntervalSeconds } : {}) })
    .eq("id", game.id);
  return { admin, ownerId, team, game, players, ids };
}

/** A phone with nobody signed in: a parent opening the link. */
async function parentPhone(browser: Browser, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport });
  return { context, page: await context.newPage() };
}

async function openLive(page: Page, url: string) {
  await page.goto(url);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — /i })).toBeVisible({ timeout: 15_000 });
}

// ─── #2 Contrast ─────────────────────────────────────────────────

test("#2 a live game's badge and Back to live game button, and the stats notice, read at AA", async ({ page }) => {
  const { team } = await inFirstPeriod("afl");
  await page.goto(`/teams/${team.id}`);
  await waitForHydration(page);
  const back = page.getByRole("link", { name: /back to live game/i });
  await expect(back).toBeVisible({ timeout: 15_000 });
  expect(await contrastOf(back)).toBeGreaterThanOrEqual(4.5);

  await page.goto(`/teams/${team.id}/games`);
  await waitForHydration(page);
  const live = page.locator('span[aria-label="Live"]').first();
  await expect(live).toBeVisible({ timeout: 15_000 });
  expect(await contrastOf(live)).toBeGreaterThanOrEqual(4.5);

  await page.goto(`/teams/${team.id}/stats`);
  await waitForHydration(page);
  const notice = page.getByTestId("stats-unfinished-games").locator("p").first();
  await expect(notice).toBeVisible({ timeout: 15_000 });
  expect(await contrastOf(notice)).toBeGreaterThanOrEqual(4.5);
  expect(await contrastOf(page.getByTestId("stats-unfinished-games").getByRole("link").first())).toBeGreaterThanOrEqual(4.5);
});

test("#2 league: the next-sub card's position labels read at AA on the dark card", async ({ browser }) => {
  const { game } = await inFirstPeriod("rugby_league", { secs: 120, subIntervalSeconds: 60 });
  const { context, page } = await parentPhone(browser);
  await openLive(page, `/run/${game.share_token}`);
  const label = page.getByTestId("league-swap-pair-0").locator("span").first();
  await expect(label).toBeVisible({ timeout: 15_000 });
  expect(await contrastOf(label)).toBeGreaterThanOrEqual(4.5);
  await context.close();
});

// ─── #3 Escape closes info dialogs ───────────────────────────────

test("#3 Escape closes the quarter-by-quarter scores and Game settings", async ({ page }) => {
  const { team, game } = await inFirstPeriod("afl");
  await skipHints(page);
  await openLive(page, `/teams/${team.id}/games/${game.id}/live`);
  const dialog = page.getByRole("dialog");

  await page.getByRole("button", { name: "Show quarter-by-quarter scores" }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: /^game settings$/i }).click();
  await expect(dialog.getByRole("heading", { name: "Game settings" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
