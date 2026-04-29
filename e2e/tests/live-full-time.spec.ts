// Covers the Q4 endQuarter → game finalised → GameSummaryCard path.
// This is the emotional moment at the end of a Saturday game — the
// pulsing siren, the final score, the MVP banner. If this breaks
// nobody notices until the last 30 seconds of the game, which is
// the worst possible time.
//
// Covers: src/app/(app)/teams/[teamId]/games/[gameId]/live/actions.ts:
//         endQuarter (quarter === 4 branch) → game_finalised event

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { ALL_ZONES, zoneCapsFor } from "../../src/lib/fairness";
import { positionsFor } from "../../src/lib/ageGroups";
import type { Lineup } from "../../src/lib/types";

test.describe.configure({ mode: "parallel" });

test("ending Q4 completes the game and renders the summary card", async ({
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

  // Build the same `Lineup` shape startGame writes — `{back, hback, mid,
  // hfwd, fwd, bench}` — keyed off the team's age-group position model.
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

  // Q1–Q3 ran 13 mins each (so each was past the 12-min hooter at
  // the time it ended), then Q4 has been running for 13 mins now.
  // Backdating like this means LiveGame's maybeTrigger effect sees
  // Q4 elapsed >= QUARTER_MS on mount and auto-opens the
  // QuarterEndModal. There's no manual "End Q4" button — the hooter
  // fires the flow, and for the final quarter the modal CTA reads
  // "End game".
  const now = Date.now();
  const QUARTER_DURATION = 13 * 60_000; // > QUARTER_MS so each quarter ran past the hooter
  const events: Array<Record<string, unknown>> = [
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: { lineup },
      created_by: ownerId,
      created_at: new Date(now - 5 * QUARTER_DURATION).toISOString(),
    },
  ];
  for (let q = 1; q <= 4; q++) {
    events.push({
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: q },
      created_by: ownerId,
      created_at: new Date(now - (5 - q) * QUARTER_DURATION).toISOString(),
    });
    if (q < 4) {
      events.push({
        game_id: game.id,
        type: "quarter_end",
        metadata: { quarter: q, elapsed_ms: QUARTER_DURATION },
        created_by: ownerId,
        created_at: new Date(now - (4 - q) * QUARTER_DURATION).toISOString(),
      });
    }
  }
  await admin.from("game_events").insert(events);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // QuarterEndModal auto-opens (Q4 is past hooter). For the final
  // quarter the modal's CTA reads "End game".
  await page.getByRole("button", { name: /^end game$/i }).click();

  // Summary card content — "final score" / "MVP" / similar.
  await expect(
    page.getByText(/full time|final score|game summary/i).first()
  ).toBeVisible({ timeout: 10_000 });

  // handleEndQuarter for Q4 flips the store synchronously (which is
  // why the summary card already renders) but the server action that
  // writes game_finalised + flips status="completed" runs in
  // startTransition. Poll until the DB catches up rather than
  // hard-coding a sleep.
  await expect
    .poll(
      async () => {
        const { data: updated } = await admin
          .from("games")
          .select("status")
          .eq("id", game.id)
          .single();
        return updated?.status;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe("completed");

  const { data: finalised } = await admin
    .from("game_events")
    .select("type")
    .eq("game_id", game.id)
    .eq("type", "game_finalised");
  expect(finalised?.length ?? 0).toBeGreaterThanOrEqual(1);
});
