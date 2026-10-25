// Edge cases from round-3 testing (UX round 3, 24 Oct 2026).
//
// 1. Futsal at 3 on court: the clock ran but the game stayed "Upcoming"
//    (the 4–18 games_on_field_size_check refused the status write, and
//    kick-off never checked it). Migration 0074 allows 3.
// 2. A futsal team set to 3 on court couldn't make a game; the only
//    explanation was the constraint's name.
// 3. AFL's live field drew empty slots up to the age group's 12 for a
//    team whose competition plays fewer.
// 4. Stats opened on the newest year with any game (a mistyped 9999
//    fixture), hiding the season just played.
// 5. Deactivating a kid mid-game dropped them off the field with no
//    warning.
//
// Covers: supabase/migrations/0074_on_field_size_min_three.sql,
//         startSoccerGame + gameWriteError, createGame, LiveGame's full
//         side (live/page.tsx), defaultSeasonYear (stats), deactivatePlayer
//         + PlayerRow, activeOrInGameFilter (live/page.tsx).

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

async function allIn(gameId: string, playerIds: string[], by: string) {
  const { error } = await createAdminClient()
    .from("game_availability")
    .insert(playerIds.map((id) => ({ game_id: gameId, player_id: id, status: "available" as const, updated_by: by })));
  if (error) throw new Error(error.message);
}

const statusOf = async (gameId: string) =>
  (await createAdminClient().from("games").select("status, on_field_size").eq("id", gameId).single()).data;

async function skipWalkthroughs(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
}

test("futsal: kicking off 3 a side puts the game in progress", async ({ page }) => {
  const by = await ownerId();
  const admin = createAdminClient();
  const team = await makeTeam(admin, { ownerId: by, sport: "futsal", ageGroup: "U10", name: `R3 futsal 3 ${Date.now()}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId: by, count: 3 });
  const game = await makeGame(admin, { teamId: team.id, ownerId: by });
  await allIn(game.id, players.map((p) => p.id), by);

  await skipWalkthroughs(page);
  await gotoStable(page, `/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^start h1$/i })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /game settings/i }).click();
  await page.locator("#soccer-on-field-size").selectOption("3");
  await page.getByRole("button", { name: /^start h1$/i }).click();
  await page.getByRole("button", { name: /^start h1 now$/i }).click({ timeout: 10_000 });

  await expect.poll(() => statusOf(game.id), { timeout: 15_000 }).toEqual({ status: "in_progress", on_field_size: 3 });
});

test("futsal: a team that plays 3 on court can make a game, and never reads a constraint's name", async ({ page }) => {
  const by = await ownerId();
  const admin = createAdminClient();
  const team = await makeTeam(admin, { ownerId: by, sport: "futsal", ageGroup: "U10", name: `R3 futsal team 3 ${Date.now()}` });
  await admin.from("teams").update({ on_field_size: 3 }).eq("id", team.id);

  await gotoStable(page, `/teams/${team.id}/games`);
  await waitForHydration(page);
  await page.getByRole("button", { name: /create manually/i }).click();
  const opponent = `Three a side ${Date.now()}`;
  await page.getByLabel(/opponent/i).fill(opponent);
  await page.getByLabel(/date.*time/i).fill(new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: /^create game$/i }).click();
  await expect(page.getByText(/games_on_field_size_check|violates check constraint/)).toHaveCount(0);
  await page.waitForURL(/\/teams\/.+\/games\/[0-9a-f-]{36}/, { timeout: 15_000 });
  const { data } = await admin.from("games").select("on_field_size").eq("team_id", team.id).eq("opponent", opponent);
  expect(data).toEqual([{ on_field_size: 3 }]);
});

test("AFL: a team that plays 10 a side has no empty slots on the live field", async ({ page }) => {
  const by = await ownerId();
  const admin = createAdminClient();
  const team = await makeTeam(admin, { ownerId: by, sport: "afl", ageGroup: "U10", name: `R3 AFL 10 ${Date.now()}` });
  await admin.from("teams").update({ on_field_size: 10 }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId: by, count: 13 });
  const game = await makeGame(admin, { teamId: team.id, ownerId: by });
  expect(game.on_field_size).toBe(10);
  await allIn(game.id, players.map((p) => p.id), by);

  await skipWalkthroughs(page);
  await gotoStable(page, `/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^start q1$/i })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /game settings/i }).click();
  await page.locator("#on-field-size").selectOption("10");
  await page.getByRole("button", { name: /^start q1$/i }).click();
  await page.getByRole("button", { name: /^start [qh]\d+ now$/i }).click({ timeout: 10_000 });

  // Ten on, three resting, and not two empty dashed spots for an age group's 12.
  await expect(page.getByRole("group", { name: "Bench", exact: true }).locator('[data-testid^="player-tile-"]')).toHaveCount(3, {
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: /^Empty .* spot$/ })).toHaveCount(0);
});

test("Stats opens on the season just played, not a far-off fixture's", async ({ page }) => {
  const { admin, team, players } = await finishedGame("afl", 2, ([a, b]) => [
    { type: "lineup_set", metadata: { lineup: { back: [], hback: [], mid: [], hfwd: [], fwd: [a], bench: [b] } } },
    ...playPeriod(1, [], 720_000),
    fullTime,
  ]);
  await makeGame(admin, { teamId: team.id, ownerId: await ownerId(), scheduledAt: "9999-12-31T12:59:00Z" });

  await gotoStable(page, `/teams/${team.id}/stats`);
  await expect(page.locator("#season-select")).toHaveValue(String(new Date().getFullYear()), { timeout: 15_000 });
  await expect(page.getByText(players[0].full_name, { exact: true }).first()).toBeVisible();
});

test("deactivating a kid who's on the field now asks first, and they stay in that game", async ({ page }) => {
  const by = await ownerId();
  const admin = createAdminClient();
  const team = await makeTeam(admin, { ownerId: by, sport: "afl", ageGroup: "U10", name: `R3 deactivate ${Date.now()}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId: by, count: 13 });
  const game = await makeGame(admin, { teamId: team.id, ownerId: by, opponent: "Eagles" });
  await allIn(game.id, players.map((p) => p.id), by);
  const [leo, ...rest] = players;
  const lineup = {
    back: rest.slice(0, 4).map((p) => p.id),
    hback: [],
    mid: rest.slice(4, 8).map((p) => p.id),
    hfwd: [],
    fwd: [leo.id, ...rest.slice(8, 11).map((p) => p.id)],
    bench: rest.slice(11).map((p) => p.id),
  };
  const at = (s: number) => new Date(Date.now() - 300_000 + s * 1000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup, sport: "afl" }, created_by: by, created_at: at(1) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1, sport: "afl" }, created_by: by, created_at: at(2) },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await gotoStable(page, `/teams/${team.id}/squad`);
  await waitForHydration(page);
  const row = page.getByTestId(`player-row-${leo.id}`);
  await row.getByRole("switch", { name: /^deactivate /i }).click();
  await expect(row.getByRole("alert")).toContainText(`${leo.full_name} is in the game against Eagles that's on now.`);
  const active = async () => (await admin.from("players").select("is_active").eq("id", leo.id).single()).data;
  expect(await active()).toEqual({ is_active: true });
  await row.getByRole("button", { name: "Deactivate anyway" }).click();
  await expect.poll(active, { timeout: 10_000 }).toEqual({ is_active: false });

  // Still on the field in the game that's on.
  await skipWalkthroughs(page);
  await gotoStable(page, `/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByTestId(`player-tile-${leo.id}`)).toBeVisible({ timeout: 15_000 });
});

test("a game played with scoring off stays 'Scores not kept' after the team turns scoring on", async ({ page }) => {
  // UX round 3, 24 Oct 2026: it read "0 drew with 0", and Head-to-head
  // counted it as a draw.
  const by = await ownerId();
  const admin = createAdminClient();
  const team = await makeTeam(admin, { ownerId: by, sport: "afl", ageGroup: "U10", name: `R3 no scores ${Date.now()}` });
  await admin.from("teams").update({ track_scoring: false }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId: by, count: 13 });
  const game = await makeGame(admin, { teamId: team.id, ownerId: by, opponent: "Crocs" });
  await admin.from("games").update({ scheduled_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("id", game.id);
  await allIn(game.id, players.map((p) => p.id), by);

  // Kicked off with scoring off.
  await skipWalkthroughs(page);
  await gotoStable(page, `/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await page.getByRole("button", { name: /^start q1$/i }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: /^start [qh]\d+ now$/i }).click({ timeout: 10_000 });
  await expect.poll(async () => (await statusOf(game.id))?.status, { timeout: 15_000 }).toBe("in_progress");

  // Played out, then the team turns scoring on.
  const at = (s: number) => new Date(Date.now() + s * 1000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 720_000, sport: "afl" }, created_by: by, created_at: at(1) },
    { game_id: game.id, type: "game_finalised", metadata: { sport: "afl" }, created_by: by, created_at: at(2) },
  ]);
  await admin.from("games").update({ status: "completed" }).eq("id", game.id);
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);

  await gotoStable(page, `/teams/${team.id}/games/${game.id}`);
  await expect(page.getByTestId("scores-not-kept")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#summary")).not.toContainText("drew with");

  await gotoStable(page, `/teams/${team.id}`);
  await expect(page.getByRole("region", { name: /last result/i })).toContainText("Scores not kept", { timeout: 15_000 });

  await gotoStable(page, `/teams/${team.id}/stats`);
  await expect(page.getByText("Scores not kept")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/^\s*1D\s*$/)).toHaveCount(0);
});
