// Covers recordGoal, recordBehind, recordOpponentScore, undoLastScore.
//
// This spec fast-forwards the game state via DB inserts (lineup_set +
// quarter_start events) so that the UI renders the "in quarter" phase
// where scoring buttons are reachable. Writing goals through the UI
// and asserting both DOM state and DB event rows gives us confidence
// the server action + optimistic update + event log are consistent.
//
// Covers: src/app/(app)/teams/[teamId]/games/[gameId]/live/actions.ts:
//         recordGoal, recordBehind, recordOpponentScore, undoLastScore

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { ALL_ZONES, zoneCapsFor } from "../../src/lib/fairness";
import { aflPositionModel, getAgeGroupConfig } from "../../src/lib/sports";
import type { Lineup } from "../../src/lib/types";

test.describe.configure({ mode: "parallel" });

// NOTE: Because the live-game UI requires a `lineup_set` event + an
// in-progress status before scoring buttons render, these tests have
// a larger setup surface than other specs. If this fixture becomes
// duplicated across more live-* specs, extract a `startLiveGame()`
// helper into fixtures/factories.

async function startGameInDb(opts: {
  admin: import("@supabase/supabase-js").SupabaseClient;
  gameId: string;
  playerIds: string[];
  onFieldSize: number;
  ageGroup: string;
  createdBy: string;
}) {
  const { admin, gameId, playerIds, onFieldSize, ageGroup, createdBy } = opts;

  // Build the same `Lineup` shape startGame writes — `{back, hback, mid,
  // hfwd, fwd, bench}`. Zone caps come from the team's age group
  // position model so the seed matches whatever the live page expects.
  const positionModel = aflPositionModel(getAgeGroupConfig("afl", ageGroup));
  const zoneCaps = zoneCapsFor(onFieldSize, positionModel);
  const lineup: Lineup = {
    back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [],
  };
  let cursor = 0;
  for (const z of ALL_ZONES) {
    for (let i = 0; i < zoneCaps[z]; i++) {
      lineup[z].push(playerIds[cursor++]);
    }
  }
  lineup.bench = playerIds.slice(cursor);

  await admin.from("game_events").insert([
    {
      game_id: gameId,
      type: "lineup_set",
      metadata: { lineup },
      created_by: createdBy,
    },
    {
      game_id: gameId,
      type: "quarter_start",
      metadata: { quarter: 1 },
      created_by: createdBy,
    },
  ]);

  await admin
    .from("games")
    .update({ status: "in_progress" })
    .eq("id", gameId);
}

test("record a goal via the live UI and see it in game_events", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  // Score buttons render only when canScore is true, which requires
  // team.track_scoring (see src/components/live/LiveGame.tsx ~ line
  // 848). makeTeam doesn't enable it; flip it explicitly here.
  await admin
    .from("teams")
    .update({ track_scoring: true })
    .eq("id", team.id);
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 15,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  await startGameInDb({
    admin,
    gameId: game.id,
    playerIds: players.map((p) => p.id),
    onFieldSize: game.on_field_size,
    ageGroup: team.ageGroup,
    createdBy: ownerId,
  });

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // Tap a player on the field by their PlayerTile testid. Avoids
  // colliding with SwapCard's pair-row buttons, which also expose a
  // role of "button" with the player name in their accessible text.
  const scorer = players[0];
  await page.getByTestId(`player-tile-${scorer.id}`).click();

  // The "Record score for X" panel surfaces a "+ Goal" button.
  await page.getByRole("button", { name: /\+ goal/i }).click();

  await expect
    .poll(
      async () => {
        const { data: events } = await admin
          .from("game_events")
          .select("type")
          .eq("game_id", game.id)
          .eq("type", "goal");
        return events?.length ?? 0;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBeGreaterThanOrEqual(1);
});

// UX review #5 (Steve 2026-07-08): a coach who saw the ball sail
// through but missed the kicker previously had only Cancel — which
// silently lost the goal. The +G picker now has a "Didn't see who"
// escape that records a team goal with no scorer (the rushed-behind
// mechanism applied to goals).
test("record an unattributed goal via 'Didn't see who'", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 15,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  await startGameInDb({
    admin,
    gameId: game.id,
    playerIds: players.map((p) => p.id),
    onFieldSize: game.on_field_size,
    ageGroup: team.ageGroup,
    createdBy: ownerId,
  });

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // Our team's +G chip on the scorebug (first of the two) opens the
  // who-scored picker.
  await page.getByRole("button", { name: /^add goal, /i }).first().click();
  // Round 5 (afl-u13, afl-u14): the picker labelled centre kids "MID"
  // while their tiles say "CEN". Same short labels as the field.
  const centreKid = page
    .getByRole("dialog", { name: /who scored/i })
    .getByRole("button", { name: new RegExp(players[4].full_name) });
  await expect(centreKid).toContainText("CEN");
  await expect(centreKid).not.toContainText("MID");
  await page
    .getByRole("button", { name: /didn't see who/i })
    .click();

  await expect
    .poll(
      async () => {
        const { data: events } = await admin
          .from("game_events")
          .select("player_id, metadata")
          .eq("game_id", game.id)
          .eq("type", "goal");
        const ev = events?.[0] as
          | { player_id: string | null; metadata: { unattributed?: boolean } }
          | undefined;
        return ev ? `${ev.player_id}|${ev.metadata?.unattributed}` : "none";
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe("null|true");
});

test("undo last score removes the most recent goal from the tally", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  // Required for canScore — see comment on the goal test above.
  await admin
    .from("teams")
    .update({ track_scoring: true })
    .eq("id", team.id);
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 15,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  await startGameInDb({
    admin,
    gameId: game.id,
    playerIds: players.map((p) => p.id),
    onFieldSize: game.on_field_size,
    ageGroup: team.ageGroup,
    createdBy: ownerId,
  });

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // The Undo affordance only appears in the post-score toast (auto-
  // dismisses after 8s — see startUndoToast in LiveGame.tsx). Seeding
  // a goal event directly in the DB does NOT trigger the toast: the
  // toast is client-state, set when handleScore fires. So drive the
  // full flow through the UI.
  const scorer = players[0];
  await page.getByTestId(`player-tile-${scorer.id}`).click();
  await page.getByRole("button", { name: /\+ goal/i }).click();

  // Toast renders an Undo button. Click it before the 8s timer
  // dismisses it.
  await page
    .getByRole("button", { name: /^undo$/i })
    .click({ timeout: 7_000 });

  // Undo inserts a score_undo event (added in migration 0013), not a
  // delete on the original — the audit trail stays intact.
  await expect
    .poll(
      async () => {
        const { data: undoEvents } = await admin
          .from("game_events")
          .select("type")
          .eq("game_id", game.id)
          .eq("type", "score_undo");
        return undoEvents?.length ?? 0;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBeGreaterThanOrEqual(1);
});

// Round 5 (runner-parent-scoring, score-reconciler): the Q-by-Q row for
// the quarter in play showed dashes while the scoreboard already counted
// its goals — so a score fixed in that quarter looked like it did
// nothing. The row shows the quarter so far, still tagged "in play".
test("Q-by-Q shows the score of the quarter in play", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await startGameInDb({
    admin,
    gameId: game.id,
    playerIds: players.map((p) => p.id),
    onFieldSize: game.on_field_size,
    ageGroup: team.ageGroup,
    createdBy: ownerId,
  });
  await admin.from("game_events").insert(
    [
      { type: "goal", player_id: players[8].id },
      { type: "behind", player_id: players[8].id },
      { type: "opponent_goal", player_id: null },
    ].map((e) => ({ ...e, game_id: game.id, metadata: { quarter: 1 }, created_by: ownerId })),
  );

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await page.getByRole("button", { name: /show quarter-by-quarter scores/i }).click();
  const q1 = page.getByRole("row").filter({ hasText: /Q1/ });
  await expect(q1).toContainText(/in play/i);
  await expect(q1).toContainText("1.1");
  await expect(q1).toContainText("1.0");
});

// Usability pass, 26 Oct 2026: AFL's Undo held only the score this phone
// last tapped, so after a reload (or one undo, or the other phone's
// score) a wrong score stayed until the break. Undo now goes back through
// every standing score, one per tap, as the other sports' does.
test("undo steps back through the game's scores, even after a reload", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Undo Eagles" });
  await startGameInDb({
    admin,
    gameId: game.id,
    playerIds: players.map((p) => p.id),
    onFieldSize: game.on_field_size,
    ageGroup: team.ageGroup,
    createdBy: ownerId,
  });
  // Two scores already saved (another phone, or before a reload).
  const scorer = players[0];
  const { data: scores } = await admin
    .from("game_events")
    .insert([
      { game_id: game.id, type: "goal", player_id: scorer.id, metadata: { quarter: 1, elapsed_ms: 60_000 }, created_by: ownerId, created_at: new Date(Date.now() - 20_000).toISOString() },
      { game_id: game.id, type: "opponent_behind", metadata: { quarter: 1, elapsed_ms: 90_000 }, created_by: ownerId, created_at: new Date(Date.now() - 10_000).toISOString() },
    ])
    .select("id, type");
  const undoTargets = async () =>
    ((await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "score_undo")).data ?? []).map(
      (e) => (e.metadata as { target_event_id?: string }).target_event_id,
    );

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  const strip = page.getByTestId("undo-strip");
  await expect(strip).toContainText("Undo Eagles behind", { timeout: 15_000 });
  await strip.getByRole("button", { name: /^undo$/i }).click();
  await expect(strip).toContainText(`goal — ${scorer.full_name.split(" ")[0]}`);
  await expect.poll(undoTargets, { timeout: 15_000 }).toEqual([scores!.find((s) => s.type === "opponent_behind")!.id]);
  await strip.getByRole("button", { name: /^undo$/i }).click();
  await expect(strip).toHaveCount(0);
  await expect
    .poll(async () => (await undoTargets()).sort(), { timeout: 15_000 })
    .toEqual(scores!.map((s) => s.id).sort());
});

// Usability pass, 26 Oct 2026: Undo takes back the latest score only, so
// a wrong one from earlier in the quarter stayed until the break. The
// live screen has Fix scores now, as the game page does after full time.
test("Fix scores takes off an earlier score mid-quarter", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await startGameInDb({
    admin,
    gameId: game.id,
    playerIds: players.map((p) => p.id),
    onFieldSize: game.on_field_size,
    ageGroup: team.ageGroup,
    createdBy: ownerId,
  });
  const [wrong, right] = players;
  const { data: goals } = await admin
    .from("game_events")
    .insert([
      { game_id: game.id, type: "goal", player_id: wrong.id, metadata: { quarter: 1, elapsed_ms: 60_000 }, created_by: ownerId, created_at: new Date(Date.now() - 20_000).toISOString() },
      { game_id: game.id, type: "goal", player_id: right.id, metadata: { quarter: 1, elapsed_ms: 90_000 }, created_by: ownerId, created_at: new Date(Date.now() - 10_000).toISOString() },
    ])
    .select("id, player_id");

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await page.getByTestId("live-fix-scores").click({ timeout: 15_000 });
  const dialog = page.getByRole("dialog", { name: "Fix scores" });
  await expect(dialog.getByTestId("fix-scores-total")).toHaveText(/12 – 0/, { timeout: 15_000 });
  await dialog.getByRole("button", { name: new RegExp(`^Take off ${wrong.full_name}'s goal in Q1`) }).click();
  await page.getByRole("dialog", { name: "Take off this score?" }).getByRole("button", { name: "Take it off" }).click();
  await expect(dialog.getByTestId("fix-scores-total")).toHaveText(/6 – 0/, { timeout: 15_000 });
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(new RegExp(`/games/${game.id}/live`));

  // The earlier goal came off (not the latest), and it's a live fix, not
  // one after full time.
  const { data: undos } = await admin.from("game_events").select("metadata").eq("game_id", game.id).eq("type", "score_undo");
  expect(undos?.map((u) => (u.metadata as { target_event_id?: string }).target_event_id)).toEqual([
    goals!.find((g) => g.player_id === wrong.id)!.id,
  ]);
  expect((undos?.[0].metadata as { fixed_after_finish?: boolean }).fixed_after_finish).toBeUndefined();
});
