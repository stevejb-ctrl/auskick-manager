// Design review (Oct 2026): the changes that would most raise the bar.
// The review itself is an Artifact; each test names the change it guards.

import { test, expect, type Browser, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

type Admin = ReturnType<typeof createAdminClient>;
const uniq = () => `${Date.now() % 100000}${Math.random().toString(36).slice(2, 5)}`;

async function ownerOf(admin: Admin) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

const aflLineup = (ids: string[]) => ({ back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) });

/** An AFL U10 game in Q1, scoring on. */
async function aflInFirstQuarter() {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `DR live ${uniq()}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Sharks" });
  const at = (s: number) => new Date(Date.now() - 60_000 + s * 1000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup: aflLineup(players.map((p) => p.id)) }, created_by: ownerId, created_at: at(0) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId, created_at: at(1) },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  return { admin, ownerId, team, game, players };
}

/** An AFL team with one finished game: we kicked a goal, they kicked a behind. */
async function aflWithResult() {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `DR result ${uniq()}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Magpies" });
  const ids = players.map((p) => p.id);
  const at = (m: number) => new Date(Date.now() - (60 - m) * 60_000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup: aflLineup(ids) }, created_by: ownerId, created_at: at(0) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId, created_at: at(1) },
    { game_id: game.id, type: "goal", player_id: ids[8], metadata: { quarter: 1 }, created_by: ownerId, created_at: at(3) },
    { game_id: game.id, type: "opponent_behind", metadata: { quarter: 1 }, created_by: ownerId, created_at: at(4) },
    { game_id: game.id, type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 600_000 }, created_by: ownerId, created_at: at(11) },
    { game_id: game.id, type: "game_finalised", metadata: { quarter: 1 }, created_by: ownerId, created_at: at(12) },
  ]);
  await admin.from("games").update({ status: "completed" }).eq("id", game.id);
  return { admin, team, game };
}

async function parentPhone(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });
  return { context, page: await context.newPage() };
}

async function openLive(page: Page, url: string) {
  await page.goto(url);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — /i })).toBeVisible({ timeout: 15_000 });
}

test("04: our score buttons are filled and theirs outlined", async ({ browser }) => {
  const { game } = await aflInFirstQuarter();
  const { context, page } = await parentPhone(browser);
  await openLive(page, `/run/${game.share_token}`);
  const bg = (name: string) =>
    page.getByRole("button", { name }).evaluate((el) => getComputedStyle(el).backgroundColor);
  const ours = await bg(`Add goal, ${(await page.getByTestId("scorebug-team-name").first().textContent())!.trim()}`);
  const theirs = await bg("Add goal, Sharks");
  expect(ours).not.toBe(theirs);
  // Theirs is the surface white; ours is the brand fill.
  expect(theirs).toBe("rgb(255, 255, 255)");
  await expect(page.getByRole("button", { name: "Show quarter-by-quarter scores" })).toContainText("Quarters");
  await context.close();
});

test("02: at 200% text the live screen fits the phone's width", async ({ browser }) => {
  const { game } = await aflInFirstQuarter();
  const { context, page } = await parentPhone(browser);
  // The reader's own text size (what a media query's em follows).
  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32, fixed: 26 } });
  await openLive(page, `/run/${game.share_token}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  // Both teams' goal buttons are on screen.
  for (const b of await page.getByRole("button", { name: /^Add goal, / }).all()) {
    const box = (await b.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(391);
  }
  await context.close();
});

test("05: a finished game shows its result on the Games list and its page", async ({ page }) => {
  const { team, game } = await aflWithResult();
  await page.goto(`/teams/${team.id}/games`);
  await waitForHydration(page);
  const row = page.locator(`a[href="/teams/${team.id}/games/${game.id}"]`);
  await expect(row.getByRole("img", { name: "Won" }).first()).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText("6–1");
  await page.goto(`/teams/${team.id}/games/${game.id}`);
  await expect(page.getByTestId("game-result")).toContainText("6–1");
  await expect(page.getByTestId("game-result")).toContainText("1.0 – 0.1");
});

test("06: Stats opens with the season-balance verdict, above the player table", async ({ page }) => {
  const { team } = await aflWithResult();
  await page.goto(`/teams/${team.id}/stats`);
  await waitForHydration(page);
  const verdict = page.getByTestId("season-balance-verdict");
  await expect(verdict).toBeVisible({ timeout: 15_000 });
  const players = page.getByRole("heading", { name: "Player statistics" });
  expect((await verdict.boundingBox())!.y).toBeLessThan((await players.boundingBox())!.y);
});

test("07: the team name's Save shows only for a change", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `DR save ${uniq()}` });
  await page.goto(`/teams/${team.id}/settings`);
  await waitForHydration(page);
  const name = page.getByLabel("Team name");
  await expect(name).toBeVisible({ timeout: 15_000 });
  const card = page.locator("section").filter({ has: name });
  await expect(card.getByRole("button", { name: /^save$/i })).toHaveCount(0);
  await name.fill(`${team.name} 2`);
  await expect(card.getByRole("button", { name: /^save$/i })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Team settings sections" }).getByRole("link", { name: "People" })).toHaveAttribute("href", "#people");
});

test("quick wins: feedback floats on Today, not on Games, and is in the account menu", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `DR fab ${uniq()}` });
  await page.goto(`/teams/${team.id}/games`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: "Games", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("feedback-fab-feedback")).toHaveCount(0);
  await page.getByTestId("user-menu-trigger").click();
  await page.getByRole("menuitem", { name: "Send feedback" }).click();
  await expect(page.getByLabel(/^message$/i)).toBeVisible();
});
