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
    count: 15,
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

  // Use getByRole("button") rather than getByText to dodge the
  // SwapCard's suggestion summary <p> at the top of the page —
  // that paragraph matches a player name first in DOM order, but
  // it isn't interactive, so a getByText click hit nothing and the
  // pendingSwap state never armed.
  await page.getByRole("button", { name: new RegExp(bench.full_name) }).click();
  await page
    .getByRole("button", { name: new RegExp(onFieldPlayer.full_name) })
    .click();

  // SwapConfirmDialog opens reliably once both clicks land — its
  // CTA is "Confirm" (per src/components/live/SwapConfirmDialog.tsx).
  await page.getByRole("button", { name: /^confirm$/i }).click();

  // recordSwap runs in startTransition; poll the DB until the swap
  // event lands.
  await expect
    .poll(
      async () => {
        const { data: swaps } = await admin
          .from("game_events")
          .select("type")
          .eq("game_id", game.id)
          .eq("type", "swap");
        return swaps?.length ?? 0;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBeGreaterThanOrEqual(1);
});
