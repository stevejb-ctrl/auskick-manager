// ─── One Scores sheet, for everyone running the game ─────────
// Live v3 (Steve, 8 Nov 2026): the Q-by-Q table and Fix scores are one
// sheet, "Scores and fixes", and a game manager gets it as the team's
// admin and the game-day link do. The server always let a manager fix
// a game's scores (loadScoreFix / fixFinishedScore); only the team
// admin saw the button. A fix mid-game moves the score on the live
// screen, not just in the sheet.

import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { coachId, newPerson, signedInPhone } from "../helpers/people";
import { gotoStable, waitForHydration } from "../helpers/navigation";
import { ALL_ZONES, zoneCapsFor } from "../../src/lib/fairness";
import { aflPositionModel, getAgeGroupConfig } from "../../src/lib/sports";
import type { Lineup } from "../../src/lib/types";
import { openScoresFromHeader } from "../helpers/liveShell";

test.describe.configure({ mode: "parallel" });

async function withManager(admin: SupabaseClient, teamId: string) {
  const manager = await newPerson(admin, "scores-gm", "Gina Manager");
  const { error } = await admin.from("team_memberships").insert({ team_id: teamId, user_id: manager.id, role: "game_manager" });
  if (error) throw new Error(`membership: ${error.message}`);
  return manager;
}

async function skipTours(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const k of ["gm-walkthrough-seen", "nb-walkthrough-seen", "league-walkthrough-seen", "rl-walkthrough-seen"]) localStorage.setItem(k, "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  });
}

/** Our side of the live scorebug: the total, then the tally where the sport has one. */
const ourTotal = (page: Page) => page.getByTestId("scorebug-team-name").first().locator("xpath=following-sibling::p[1]");

test("AFL: a game manager takes off a wrong goal mid-quarter and the score on the live screen drops", async ({ browser }) => {
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kew Comets" });
  const caps = zoneCapsFor(game.on_field_size, aflPositionModel(getAgeGroupConfig("afl", team.ageGroup)));
  const lineup: Lineup = { back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [] };
  let cursor = 0;
  for (const z of ALL_ZONES) for (let i = 0; i < caps[z]; i++) lineup[z].push(players[cursor++].id);
  lineup.bench = players.slice(cursor).map((p) => p.id);
  const [wrong, right] = players;
  const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
  const { data: goals, error } = await admin
    .from("game_events")
    .insert([
      { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId, created_at: at(90_000) },
      { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId, created_at: at(80_000) },
      { game_id: game.id, type: "goal", player_id: wrong.id, metadata: { quarter: 1, elapsed_ms: 20_000 }, created_by: ownerId, created_at: at(60_000) },
      { game_id: game.id, type: "goal", player_id: right.id, metadata: { quarter: 1, elapsed_ms: 40_000 }, created_by: ownerId, created_at: at(40_000) },
    ])
    .select("id, type, player_id");
  if (error) throw new Error(`seed: ${error.message}`);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  const manager = await withManager(admin, team.id);

  const { context, page } = await signedInPhone(browser, manager);
  try {
    await skipTours(page);
    // WebKit may still be following sign-in's redirect: gotoStable retries.
    await gotoStable(page, `/teams/${team.id}/games/${game.id}/live`);
    await waitForHydration(page);
    await expect(ourTotal(page)).toHaveText("122·0", { timeout: 15_000 });

    // AFL's live v3 header: tap the score for Scores and fixes.
    await openScoresFromHeader(page);
    const sheet = page.getByRole("dialog", { name: "Scores and fixes" });
    // Q-by-Q first: two goals in the quarter in play.
    await expect(sheet.getByRole("table")).toContainText("2.0");
    await expect(sheet.getByTestId("fix-scores-total")).toHaveText(/12 – 0/, { timeout: 15_000 });
    await sheet.getByRole("button", { name: new RegExp(`^Take off ${wrong.full_name}'s goal in Q1`) }).click();
    await page.getByRole("dialog", { name: "Take off this score?" }).getByRole("button", { name: "Take it off" }).click();
    await expect(sheet.getByTestId("fix-scores-total")).toHaveText(/6 – 0/, { timeout: 15_000 });
    await expect(sheet.getByRole("table")).toContainText("1.0");
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(sheet).toHaveCount(0);

    // The live screen's score moved too, and the earlier goal came off.
    await expect(ourTotal(page)).toHaveText("61·0", { timeout: 15_000 });
    const { data: undos } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "score_undo");
    expect(undos?.map((u) => (u.metadata as { target_event_id?: string }).target_event_id)).toEqual([
      goals!.find((g) => g.player_id === wrong.id)!.id,
    ]);
  } finally {
    await context.close();
  }
});

test("soccer: a game manager adds a missed goal mid-half and the score on the live screen goes up", async ({ browser }) => {
  const admin = createAdminClient();
  const ownerId = await coachId(admin);
  const team = await makeTeam(admin, { ownerId, sport: "soccer", ageGroup: "U8" });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 8 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Kew Comets" });
  const ids = players.map((p) => p.id);
  const lineup = {
    keeper: ids[0],
    lines: { def: [ids[1], ids[2]], mid: [ids[3], ids[4], ids[5]], att: [ids[6]], field: [] },
    bench: [ids[7]],
  };
  const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
  const { error } = await admin.from("game_events").insert(
    [
      { type: "lineup_set", metadata: { lineup, sport: "soccer" }, created_at: at(62_000) },
      { type: "quarter_start", metadata: { quarter: 1, sport: "soccer" }, created_at: at(60_000) },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  if (error) throw new Error(`seed: ${error.message}`);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  const manager = await withManager(admin, team.id);

  const { context, page } = await signedInPhone(browser, manager);
  try {
    await skipTours(page);
    // WebKit may still be following sign-in's redirect: gotoStable retries.
    await gotoStable(page, `/teams/${team.id}/games/${game.id}/live`);
    await waitForHydration(page);
    await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible({ timeout: 15_000 });
    await expect(ourTotal(page)).toHaveText("0");

    await page.getByTestId("live-fix-scores").click({ timeout: 15_000 });
    const sheet = page.getByRole("dialog", { name: "Scores and fixes" });
    await expect(sheet.getByTestId("fix-scores-total")).toHaveText(/0 – 0/, { timeout: 15_000 });
    await sheet.getByRole("button", { name: "+ Add a missed score" }).click();
    await sheet.getByRole("combobox", { name: "Who scored" }).selectOption({ label: players[6].full_name });
    await sheet.getByRole("button", { name: "Add", exact: true }).click();
    await expect(sheet.getByTestId("fix-scores-total")).toHaveText(/1 – 0/, { timeout: 15_000 });
    await sheet.getByRole("button", { name: "Done" }).click();

    await expect(ourTotal(page)).toHaveText("1", { timeout: 15_000 });
  } finally {
    await context.close();
  }
});
