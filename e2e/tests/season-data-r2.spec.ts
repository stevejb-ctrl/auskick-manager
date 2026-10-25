// Season data a coach reads across games (UX round 2, 24 Oct 2026: one
// coach, three teams, two games each, Settings changed mid-season).
//
// 1. Changing the period length rewrote past games: after 12- to
//    10-minute quarters, Stats clipped game 1 to 40 minutes.
// 2. Players on the field skipped games already scheduled (period length
//    reached them), so the lineup said 12 after Settings said 11, and the
//    sub-interval explainer used the age group's 48 minutes.
// 3. A kid added mid-season was silently Out for every scheduled game.
// 4. After game 1, AFL's lineup showed a "Season time in zone" key over
//    tiles with no bars.
// 5. The scorers card left out a goal nobody was named for.
//
// Covers: src/lib/games/pinPlayedPeriodLength.ts (+ setQuarterLengthSeconds),
//         setTeamOnFieldSize + OnFieldSizeInput, AFL's lineup size and
//         explainer (live/page.tsx), seedAvailabilityForNewPlayers (+ squad
//         actions), GameDayAvailabilityPanel's "Not marked", LineupPicker's
//         season bars, the game page's No scorer row.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeGame, makePlayers, makeTeam } from "../fixtures/factories";
import { finishedGame, fullTime, playPeriod } from "../helpers/finished-game";
import { gotoStable, waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

async function ownerId(): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

/** Everyone in the squad marked In, as a game's creation does. */
async function allIn(gameId: string, playerIds: string[], by: string) {
  const { error } = await createAdminClient()
    .from("game_availability")
    .insert(playerIds.map((id) => ({ game_id: gameId, player_id: id, status: "available" as const, updated_by: by })));
  if (error) throw new Error(error.message);
}

async function openLineup(page: Page, teamId: string, gameId: string) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await gotoStable(page, `/teams/${teamId}/games/${gameId}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^start q1$/i })).toBeVisible({ timeout: 15_000 });
}

/** A card on the Season settings page, by its field's label. */
const cardOf = (page: Page, label: RegExp | string) =>
  page.getByLabel(label).locator("xpath=ancestor::div[contains(@class, 'rounded-lg')][1]");

test("a played game keeps its quarter length when Settings changes the team's", async ({ page }) => {
  // Leo is on the field for all four 12-minute quarters.
  const { admin, team, game, players } = await finishedGame("afl", 2, ([leo, ben]) => [
    { type: "lineup_set", metadata: { lineup: { back: [], hback: [], mid: [], hfwd: [], fwd: [leo], bench: [ben] } } },
    ...playPeriod(1, [], 720_000),
    ...playPeriod(2, [], 720_000),
    ...playPeriod(3, [], 720_000),
    ...playPeriod(4, [], 720_000),
    fullTime,
  ]);
  const leo = players[0];

  await gotoStable(page, `/teams/${team.id}/settings`);
  await waitForHydration(page);
  const length = page.getByLabel(/quarter length/i);
  await expect(length).toHaveValue("12");
  await length.fill("10");
  await cardOf(page, /quarter length/i).getByRole("button", { name: /^save$/i }).click();
  await expect
    .poll(async () => (await admin.from("teams").select("quarter_length_seconds").eq("id", team.id).single()).data)
    .toEqual({ quarter_length_seconds: 600 });
  // The game it was played with stays on 12.
  const { data: played } = await admin.from("games").select("quarter_length_seconds").eq("id", game.id).single();
  expect(played).toEqual({ quarter_length_seconds: 720 });

  // Stats still give Leo his 48 minutes, not 40.
  await gotoStable(page, `/teams/${team.id}/stats`);
  const card = page
    .locator("div.rounded-lg")
    .filter({ has: page.getByText(leo.full_name, { exact: true }) })
    .filter({ hasText: "total min" });
  await expect(card).toContainText("48total min", { timeout: 15_000 });
  await expect(card).toContainText("100%");
});

test("players on the field reaches the games already scheduled, and the lineup starts from it", async ({ page }) => {
  const by = await ownerId();
  const admin = createAdminClient();
  const team = await makeTeam(admin, { ownerId: by, sport: "afl", ageGroup: "U10", name: `R2 size ${Date.now()}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId: by, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId: by });
  expect(game.on_field_size).toBe(12);
  await allIn(game.id, players.map((p) => p.id), by);

  await gotoStable(page, `/teams/${team.id}/settings`);
  await waitForHydration(page);
  const size = cardOf(page, "Players on the field");
  // The card says so before the coach saves.
  await expect(size).toContainText("Saving also changes the game already scheduled.");
  await page.getByLabel("Players on the field").selectOption("11");
  await size.getByRole("button", { name: /^save$/i }).click();
  await expect(size.getByText("Saved. New games start with 11 on the field, and so does the game already scheduled.")).toBeVisible({
    timeout: 10_000,
  });
  await expect
    .poll(async () => (await admin.from("games").select("on_field_size").eq("id", game.id).single()).data)
    .toEqual({ on_field_size: 11 });

  // 10-minute quarters too: the game follows the team's length.
  await page.getByLabel(/quarter length/i).fill("10");
  await cardOf(page, /quarter length/i).getByRole("button", { name: /^save$/i }).click();
  await expect
    .poll(async () => (await admin.from("teams").select("quarter_length_seconds").eq("id", team.id).single()).data)
    .toEqual({ quarter_length_seconds: 600 });

  await openLineup(page, team.id, game.id);
  await page.getByRole("button", { name: /game settings/i }).click();
  await expect(page.locator("#on-field-size")).toHaveValue("11");
  await expect(page.locator("#on-field-size option:checked")).toHaveText("11 on field — recommended");
  await expect(page.getByText(/each over 40 min\./)).toBeVisible();
});

test("a kid added mid-season is In for the next game; one missed before is 'Not marked', not Out", async ({ page }) => {
  const by = await ownerId();
  const admin = createAdminClient();
  const team = await makeTeam(admin, { ownerId: by, sport: "afl", ageGroup: "U10", name: `R2 newcomer ${Date.now()}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId: by, count: 13 });
  const game = await makeGame(admin, { teamId: team.id, ownerId: by });
  await allIn(game.id, players.map((p) => p.id), by);

  // Added from the squad page: In for the game already made.
  await gotoStable(page, `/teams/${team.id}/squad`);
  await waitForHydration(page);
  await page.getByLabel(/player name/i).fill("Noah Newcomer");
  await page.getByLabel(/jersey/i).fill("40");
  await page.getByRole("button", { name: /^add player$/i }).click();
  await expect(page.getByText("Noah Newcomer")).toBeVisible();
  const { data: noah } = await admin.from("players").select("id").eq("team_id", team.id).eq("full_name", "Noah Newcomer").single();

  // Added before this fix (no row for the game): "Not marked", with a way in.
  const { data: ollie } = await admin
    .from("players")
    .insert({ team_id: team.id, full_name: "Ollie Earlier", jersey_number: 41, created_by: by })
    .select("id")
    .single();

  await openLineup(page, team.id, game.id);
  await expect(page.getByTestId(`player-tile-${noah!.id}`)).toBeVisible();
  const whosHere = page.getByRole("button", { name: /who's here/i });
  await expect(whosHere).toContainText("14 of 15 in · Not marked: Ollie");
  await expect(whosHere).not.toContainText("Out:");
  await page.getByRole("button", { name: "Mark Ollie in" }).click();
  await expect(whosHere).toContainText("15 of 15 in", { timeout: 10_000 });
  await expect(page.getByTestId(`player-tile-${ollie!.id}`)).toBeVisible();
});

test("after game 1, AFL's lineup tiles draw the season time in zone its key describes", async ({ page }) => {
  const { admin, team, players } = await finishedGame("afl", 4, ([a, b, c, d]) => [
    { type: "lineup_set", metadata: { lineup: { back: [a], hback: [], mid: [b], hfwd: [], fwd: [c], bench: [d] } } },
    ...playPeriod(1, [], 720_000),
    fullTime,
  ]);
  const by = await ownerId();
  const next = await makeGame(admin, { teamId: team.id, ownerId: by });
  await allIn(next.id, players.map((p) => p.id), by);

  await openLineup(page, team.id, next.id);
  await expect(page.getByText("Season time in zone")).toBeVisible();
  // The kid who played forward in game 1 has a bar, and his season total.
  const tile = page.getByTestId(`player-tile-${players[2].id}`);
  await expect(tile.locator('[aria-label^="Fwd 12:00"]')).toBeVisible();
  await expect(tile).toContainText("12:00");
});

test("futsal: the scorers card counts a goal nobody was named for", async ({ page }) => {
  const { team, game, players } = await finishedGame("futsal", 3, (ids) => [
    ...playPeriod(1, [
      { type: "goal", player_id: ids[0], metadata: { quarter: 1, elapsed_ms: 60_000 } },
      { type: "goal", metadata: { quarter: 1, elapsed_ms: 120_000 } },
    ]),
    fullTime,
  ]);
  await page.goto(`/teams/${team.id}/games/${game.id}`);
  await expect(page.getByText(players[0].full_name, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("no-scorer-row")).toContainText("No scorer");
  await expect(page.getByTestId("no-scorer-row")).toContainText("1 goal");
  await expect(page.locator("#summary")).toContainText("+1 goal (no scorer)");
});
