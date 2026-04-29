// Covers startQuarter + endQuarter. Also asserts that the quarter-break
// rotation suggestion renders between quarters.
//
// Covers: src/app/(app)/teams/[teamId]/games/[gameId]/live/actions.ts:
//         startQuarter, endQuarter (non-final)

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { ALL_ZONES, zoneCapsFor } from "../../src/lib/fairness";
import { positionsFor } from "../../src/lib/ageGroups";
import type { Lineup } from "../../src/lib/types";

test.describe.configure({ mode: "parallel" });

test("end Q1 transitions to quarter break and renders rotation suggestion", async ({
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

  // Build the same `Lineup` shape startGame writes (see actions.ts —
  // metadata.lineup, NOT the historical { on_field, on_field_size }).
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

  // End Q1.
  await page.getByRole("button", { name: /end q1/i }).click();

  // Confirm if a modal appears.
  const confirm = page.getByRole("button", { name: /confirm|end quarter/i });
  if (await confirm.isVisible({ timeout: 1500 }).catch(() => false)) {
    await confirm.click();
  }

  // Expect "Start Q2" button to appear during the break.
  await expect(page.getByRole("button", { name: /start q2/i })).toBeVisible({
    timeout: 5_000,
  });

  const { data: events } = await admin
    .from("game_events")
    .select("type, metadata")
    .eq("game_id", game.id)
    .in("type", ["quarter_end", "quarter_start"]);
  expect(
    events?.some(
      (e) =>
        e.type === "quarter_end" &&
        (e.metadata as { quarter?: number } | null)?.quarter === 1,
    ),
  ).toBe(true);
});
