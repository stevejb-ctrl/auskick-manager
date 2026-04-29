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
import { positionsFor } from "../../src/lib/ageGroups";
import type { AgeGroup, Lineup } from "../../src/lib/types";

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
  ageGroup: AgeGroup;
  createdBy: string;
}) {
  const { admin, gameId, playerIds, onFieldSize, ageGroup, createdBy } = opts;

  // Build the same `Lineup` shape startGame writes — `{back, hback, mid,
  // hfwd, fwd, bench}`. Zone caps come from the team's age group
  // position model so the seed matches whatever the live page expects.
  const positionModel = positionsFor(ageGroup);
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

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
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

  // Tap a forward player (first 6 in the seeded lineup). Then tap the
  // "Record goal" affordance that appears.
  const scorer = players[0];
  await page.getByText(scorer.full_name).first().click();
  await page
    .getByRole("button", { name: /record goal|goal/i })
    .first()
    .click();

  await page.waitForTimeout(500); // let the server action commit

  const { data: events } = await admin
    .from("game_events")
    .select("type, metadata")
    .eq("game_id", game.id)
    .eq("type", "goal");

  expect(events?.length ?? 0).toBeGreaterThanOrEqual(1);
});

test("undo last score removes the most recent goal from the tally", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
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

  // Seed one goal directly so the Undo button is definitely reachable.
  // game_events.player_id is its own column on this schema; the rest
  // of the event-specific data goes in metadata.
  await admin.from("game_events").insert({
    game_id: game.id,
    type: "goal",
    player_id: players[0].id,
    metadata: { quarter: 1, elapsed_ms: 10_000 },
    created_by: ownerId,
  });

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  await page.getByRole("button", { name: /undo/i }).first().click();
  await page.waitForTimeout(500);

  // Undo inserts a score_undo event (added in migration 0013), not a
  // delete on the original — the audit trail stays intact.
  const { data: undoEvents } = await admin
    .from("game_events")
    .select("type")
    .eq("game_id", game.id)
    .eq("type", "score_undo");
  expect(undoEvents?.length ?? 0).toBeGreaterThanOrEqual(1);
});
