// Stagehand round 8 (29 Oct 2026): confused parents and rushed coaches,
// all ten sports. .planning/USABILITY-STAGEHAND-2026-10-ROUND8.md has
// the findings; each test here names its number.

import { test, expect, type Browser, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

type Admin = ReturnType<typeof createAdminClient>;

async function ownerOf(admin: Admin) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

const uniq = () => `${Date.now() % 100000}${Math.random().toString(36).slice(2, 5)}`;

type Sport = "afl" | "soccer" | "netball";
const LINEUPS: Record<Sport, { age: string; count: number; lineup: (ids: string[]) => Record<string, unknown> }> = {
  afl: { age: "U10", count: 15, lineup: (ids) => ({ back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) }) },
  soccer: { age: "U12", count: 12, lineup: (ids) => ({ keeper: ids[0], lines: { def: ids.slice(1, 4), mid: ids.slice(4, 7), att: ids.slice(7, 9), field: [] }, bench: ids.slice(9) }) },
  netball: { age: "11u", count: 9, lineup: (ids) => ({ positions: Object.fromEntries(["gs", "ga", "wa", "c", "wd", "gd", "gk"].map((k, i) => [k, [ids[i]]])), bench: ids.slice(7) }) },
};

/** A game in its first period, scoring on: the team, game, kids and its share token. */
async function inFirstPeriod(sport: Sport) {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const cfg = LINEUPS[sport];
  const team = await makeTeam(admin, { ownerId, sport, ageGroup: cfg.age, name: `R8 ${sport} ${uniq()}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: cfg.count });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Sharks" });
  const ids = players.map((p) => p.id);
  const at = (s: number) => new Date(Date.now() - 60_000 + s * 1000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup: cfg.lineup(ids), sport }, created_by: ownerId, created_at: at(0) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1, sport }, created_by: ownerId, created_at: at(1) },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
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

const countOf = async (admin: Admin, gameId: string, type: string) =>
  (await admin.from("game_events").select("id").eq("game_id", gameId).eq("type", type)).data?.length ?? 0;

for (const sport of ["soccer", "afl"] as const) {
  test(`#1 ${sport}: a double tap on the other team's score is one score`, async ({ browser }) => {
    const { admin, game } = await inFirstPeriod(sport);
    const { context, page } = await parentPhone(browser);
    await openLive(page, `/run/${game.share_token}`);
    await page.getByRole("button", { name: "Add goal, Sharks" }).dblclick();
    await page.waitForTimeout(2500);
    expect(await countOf(admin, game.id, "opponent_goal")).toBe(1);
    // A second goal a moment later still counts.
    await page.getByRole("button", { name: "Add goal, Sharks" }).click();
    await expect.poll(() => countOf(admin, game.id, "opponent_goal"), { timeout: 10_000 }).toBe(2);
    await context.close();
  });
}

test("#2 a phone held sideways fills the screen: no desktop phone frame", async ({ browser }) => {
  const { game } = await inFirstPeriod("soccer");
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 915, height: 412 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await openLive(page, `/run/${game.share_token}`);
  const main = await page.locator("main").boundingBox();
  expect(main!.width).toBeGreaterThan(800);
  const theirs = await page.getByRole("button", { name: "Add goal, Sharks" }).boundingBox();
  expect(theirs!.x + theirs!.width).toBeLessThanOrEqual(915);
  await context.close();
});

for (const sport of ["afl", "soccer"] as const) {
  test(`#3 ${sport}: a goal being picked when the other phone ends the period says it wasn't saved`, async ({ browser }) => {
    const { admin, ownerId, game } = await inFirstPeriod(sport);
    const { context, page } = await parentPhone(browser);
    await openLive(page, `/run/${game.share_token}`);
    await page.getByRole("button", { name: /^Add goal, R8/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // The other phone ends the first period.
    await admin.from("game_events").insert({ game_id: game.id, type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 60_000, sport }, created_by: ownerId });
    await expect(page.getByTestId("lost-score-notice")).toContainText("wasn't saved", { timeout: 20_000 });
    await context.close();
  });
}

test("#5 Exit on a finished game's link leads back to the result", async ({ browser }) => {
  const { admin, ownerId, game } = await inFirstPeriod("afl");
  await admin.from("game_events").insert([
    { game_id: game.id, type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 600_000 }, created_by: ownerId },
    { game_id: game.id, type: "game_finalised", metadata: { quarter: 1 }, created_by: ownerId },
  ]);
  await admin.from("games").update({ status: "completed" }).eq("id", game.id);
  const { context, page } = await parentPhone(browser);
  await page.goto(`/run/${game.share_token}/left`);
  await page.getByRole("link", { name: "See the result" }).click();
  await expect(page).toHaveURL(new RegExp(`/run/${game.share_token}$`));
  await context.close();
});

test("#7 the game-day link says whose team it is and what sport", async ({ browser }) => {
  const { team, game } = await inFirstPeriod("netball");
  const { context, page } = await parentPhone(browser);
  await page.goto(`/run/${game.share_token}`);
  const whose = page.getByTestId("run-whose");
  await expect(whose).toContainText(`You're scoring for ${team.name} v Sharks`);
  await expect(whose).toContainText("Netball");
  await context.close();
});
