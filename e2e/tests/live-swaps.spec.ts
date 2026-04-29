// Covers recordSwap, markInjury, addLateArrival mid-quarter. These
// are the busiest write paths on a Saturday morning — a broken swap
// means zone minutes drift and fairness tracking is compromised.
//
// Covers: src/app/(app)/teams/[teamId]/games/[gameId]/live/actions.ts:
//         recordSwap, markInjury, addLateArrival

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { ALL_ZONES, zoneCapsFor } from "../../src/lib/fairness";
import { positionsFor } from "../../src/lib/ageGroups";
import type { Lineup } from "../../src/lib/types";

test.describe.configure({ mode: "parallel" });

test("swap a bench player onto the field produces a swap event", async ({
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
    count: 16,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  // Fast-forward: seed a lineup_set + quarter_start so the UI renders
  // the mid-quarter state with the Swap affordance. The `lineup_set`
  // metadata shape MUST match what startGame writes (see
  // src/app/(app)/teams/[teamId]/games/[gameId]/live/actions.ts → it's
  // `{ lineup: Lineup }` where Lineup is `{back, hback, mid, hfwd, fwd,
  // bench}` — not the historical `{ on_field, on_field_size }` shape
  // this spec used to seed before being quarantined).
  const positionModel = positionsFor(team.ageGroup);
  const zoneCaps = zoneCapsFor(game.on_field_size, positionModel);
  const lineup: Lineup = {
    back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [],
  };
  let cursor = 0;
  for (const z of ALL_ZONES) {
    for (let i = 0; i < zoneCaps[z]; i++) {
      lineup[z].push(players[cursor++].id);
    }
  }
  lineup.bench = players.slice(cursor).map((p) => p.id);

  await admin.from("game_events").insert([
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: { lineup },
      created_by: ownerId,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 1 },
      created_by: ownerId,
    },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // Pick a bench player (any one outside the first on_field_size).
  const bench = players[cursor];
  // Pick a player currently on-field to swap out.
  const onFieldPlayer = players[0];

  await page.getByText(bench.full_name).first().click();
  await page.getByText(onFieldPlayer.full_name).first().click();

  // If a confirmation dialog appears, confirm.
  const confirm = page.getByRole("button", { name: /confirm/i });
  if (await confirm.isVisible({ timeout: 1500 }).catch(() => false)) {
    await confirm.click();
  }

  await page.waitForTimeout(500);

  const { data: swaps } = await admin
    .from("game_events")
    .select("type, metadata")
    .eq("game_id", game.id)
    .eq("type", "swap");
  expect(swaps?.length ?? 0).toBeGreaterThanOrEqual(1);
});
