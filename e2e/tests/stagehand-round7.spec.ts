// Stagehand round 7 (28 Oct 2026), all ten sports: the fixes, end to end.
// .planning/USABILITY-STAGEHAND-2026-10-ROUND7.md has the findings.
//
//   1. The Games list counted switched-off kids ("16/15").
//   2. A kid marked out read as injured, and there was no "Went home"
//      during play.
//   3. The season picker counted next week's fixture.
//   4. "Keepers" with nobody named said "Your named keepers take turns".
//   6. AFL: lending a kid off the field left the spot empty, unasked.
//   7. The summary didn't say who was hurt or went home.
//   8. Basketball's game page showed no fouls.
//  10. A game-day link was titled with the host's brand.
//  11. A game-day link could only undo the latest score.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import { finishedGame, playPeriod, fullTime } from "../helpers/finished-game";

test.describe.configure({ mode: "parallel" });

async function ownerOf(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

const uniq = () => `${Date.now() % 100000}${Math.random().toString(36).slice(2, 5)}`;

/** An AFL U10 game in Q1: 12 on, 3 on the bench. */
async function aflInQ1(opts: { scoring?: boolean; goals?: string[] } = {}) {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl", name: `R7 AFL ${uniq()}` });
  if (opts.scoring) await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Sharks" });
  const ids = players.map((p) => p.id);
  const lineup = { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
  const at = (s: number) => new Date(Date.now() - 120_000 + s * 1000).toISOString();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId, created_at: at(0) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId, created_at: at(1) },
    ...(opts.goals ?? []).map((pid, i) => ({
      game_id: game.id,
      type: "goal",
      player_id: pid === "them" ? null : pid,
      metadata: { quarter: 1, elapsed_ms: 10_000 * (i + 1) },
      created_by: ownerId,
      created_at: at(2 + i),
    })),
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  return { admin, ownerId, team, game, players, ids };
}

async function openLive(page: Page, url: string) {
  await page.goto(url);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — /i })).toBeVisible({ timeout: 15_000 });
}

test("the Games list counts only kids still in the squad (not 16/15)", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl", name: `R7 List ${uniq()}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 4 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Hawks", scheduledAt: new Date(Date.now() + 2 * 86_400_000).toISOString() });
  await admin.from("game_availability").insert(players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available", updated_by: ownerId })));
  // One kid leaves the club: switched off, their rows kept.
  await admin.from("players").update({ is_active: false }).eq("id", players[0].id);

  await page.goto(`/teams/${team.id}/games`);
  const row = page.getByRole("link", { name: /Hawks/ }).first();
  await expect(row).toContainText("3/3");
  await expect(row).not.toContainText("4/3");
});

test("the season picker counts games played, not the next fixture", async ({ page }) => {
  const { admin, team } = await finishedGame("afl", 12, (ids) => [
    { type: "lineup_set", metadata: { lineup: { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: [] } } },
    ...playPeriod(1, []),
    fullTime,
  ]);
  const { data: owner } = await admin.from("teams").select("created_by").eq("id", team.id).single();
  await makeGame(admin, { teamId: team.id, ownerId: owner!.created_by as string, opponent: "Next week", scheduledAt: new Date(Date.now() + 86_400_000).toISOString() });
  await page.goto(`/teams/${team.id}/stats`);
  const year = new Date().getFullYear();
  await expect(page.locator("#season-select option", { hasText: `${year} (` })).toHaveText(`${year} (1 game)`);
});

test("AFL: Went home takes a kid off with a replacement, and the bench says HOME", async ({ page }) => {
  const { admin, team, game, players } = await aflInQ1();
  await openLive(page, `/teams/${team.id}/games/${game.id}/live`);
  const leaving = players[4];
  await page.getByTestId(`player-tile-${leaving.id}`).click({ delay: 600 });
  await page.getByTestId("lock-modal-went-home").click();
  const dialog = page.getByRole("dialog", { name: /who comes on at/i });
  await expect(dialog).toContainText("is going home");
  await dialog.getByRole("button", { name: new RegExp(players[12].full_name, "i") }).click();

  await expect(page.getByRole("group", { name: /bench/i }).getByLabel("Went home")).toBeVisible();
  await expect
    .poll(async () => {
      const { data } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "injury").eq("player_id", leaving.id);
      return (data ?? []).map((e) => (e.metadata as { reason?: string }).reason);
    })
    .toEqual(["out"]);
});

test("AFL: lending a kid off the field asks who comes on", async ({ page }) => {
  const { admin, team, game, players } = await aflInQ1();
  await openLive(page, `/teams/${team.id}/games/${game.id}/live`);
  const lent = players[0];
  await page.getByTestId(`player-tile-${lent.id}`).click({ delay: 600 });
  await page.getByRole("button", { name: /lend to opposition/i }).click();
  const dialog = page.getByRole("dialog", { name: /who comes on at/i });
  await expect(dialog).toContainText(/Lending .* to the opposition/);
  await dialog.getByRole("button", { name: new RegExp(players[13].full_name, "i") }).click();

  await expect
    .poll(async () => {
      const { data } = await admin.from("game_events").select("type, player_id, metadata").eq("game_id", game.id).in("type", ["player_loan", "swap"]).order("created_at");
      return (data ?? []).map((e) => (e.type === "swap" ? `swap on ${(e.metadata as { on_player_id: string }).on_player_id}` : `loan ${e.player_id}`));
    })
    .toEqual([`loan ${lent.id}`, `swap on ${players[13].id}`]);
});

test("the finished summary says who was hurt and who went home; basketball lists fouls", async ({ page }) => {
  const { team, game, players } = await finishedGame("basketball", 7, (ids) => [
    { type: "lineup_set", metadata: { lineup: { lines: { guard: ids.slice(0, 2), forward: ids.slice(2, 5), court: [] }, bench: ids.slice(5) } } },
    ...playPeriod(
      1,
      [
        { type: "foul", player_id: ids[2], metadata: { quarter: 1, elapsed_ms: 30_000 } },
        { type: "foul", player_id: ids[2], metadata: { quarter: 1, elapsed_ms: 40_000 } },
        { type: "foul", player_id: ids[3], metadata: { quarter: 1, elapsed_ms: 50_000 } },
        { type: "injury", player_id: ids[0], metadata: { injured: true, quarter: 1, elapsed_ms: 60_000, reason: "out" } },
        { type: "injury", player_id: ids[1], metadata: { injured: true, quarter: 1, elapsed_ms: 90_000 } },
      ],
      600_000,
    ),
    fullTime,
  ]);
  await page.goto(`/teams/${team.id}/games/${game.id}`);
  const summary = page.locator("#basketball-game-summary-text");
  await expect(summary).toContainText("· went home");
  await expect(summary).toContainText("· injured");
  const fouls = page.locator("#fouls");
  await expect(fouls).toContainText("Who picked up fouls");
  await expect(fouls.getByRole("listitem").first()).toContainText("2 fouls");
  await expect(fouls).toContainText(players[3].full_name);
});

test("a football lineup with no keepers named says the keeper stays", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U13", sport: "soccer", name: `R7 Keep ${uniq()}` });
  await makePlayers(admin, { teamId: team.id, ownerId, count: 12 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Knights" });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  // The keeper card shows once kids are in.
  await page.getByRole("button", { name: /^Mark all \d+ in$/ }).click();
  await expect(page.getByText(/No keepers named yet, so your keeper stays in goal/)).toBeVisible({ timeout: 15_000 });
});

test("a game-day link is titled with the game, and can fix scores while it's on", async ({ browser }) => {
  const { admin, game, players } = await aflInQ1({ scoring: true, goals: [] });
  // Two goals: the first to the wrong kid.
  const { data: owner } = await admin.from("games").select("created_by, share_token").eq("id", game.id).single();
  await admin.from("game_events").insert([
    { game_id: game.id, type: "goal", player_id: players[8].id, metadata: { quarter: 1, elapsed_ms: 20_000 }, created_by: owner!.created_by },
    { game_id: game.id, type: "goal", player_id: players[9].id, metadata: { quarter: 1, elapsed_ms: 30_000 }, created_by: owner!.created_by },
  ]);
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await openLive(page, `/run/${owner!.share_token}`);
  await expect(page).toHaveTitle(/ v Sharks · Siren$/);

  await page.getByTestId("live-fix-scores").click();
  const dialog = page.getByRole("dialog", { name: "Fix scores" });
  await expect(dialog.getByTestId("fix-scores-total")).toContainText("12 – 0");
  await context.close();
});

test("a finished game's link can't fix scores", async ({ browser }) => {
  const { admin, ownerId, game } = await aflInQ1({ scoring: true });
  await admin.from("game_events").insert([
    { game_id: game.id, type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 600_000 }, created_by: ownerId },
    { game_id: game.id, type: "game_finalised", metadata: { quarter: 1 }, created_by: ownerId },
  ]);
  await admin.from("games").update({ status: "completed" }).eq("id", game.id);
  const { data } = await admin.from("games").select("share_token").eq("id", game.id).single();
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto(`/run/${data!.share_token}`);
  await waitForHydration(page);
  await expect(page.getByTestId("live-fix-scores")).toHaveCount(0);
  await context.close();
});
