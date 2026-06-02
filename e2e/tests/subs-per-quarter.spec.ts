// ─── Subs per quarter (issue 2) ───────────────────────────────────
// Migration 0048 adds games.subs_per_quarter; the live timer spreads
// that many sub reminders evenly across the period. This spec exercises
// the new column end-to-end through the UI (per CLAUDE.md: a schema
// migration must be driven through the UI, not just the DB):
//
//   1. Seed an AFL game in_progress mid-Q1.
//   2. Open Game settings, change "Subs per quarter", Save.
//   3. Assert games.subs_per_quarter persisted the new value.
//
// The cadence maths (3 → 3/6/9 min) is pinned by the pure unit spec
// (src/lib/live/__tests__/subDistribution.test.ts); this proves the
// column + setter + settings UI are wired through.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { ALL_ZONES, zoneCapsFor } from "../../src/lib/fairness";
import { positionsFor } from "../../src/lib/ageGroups";
import type { Lineup } from "../../src/lib/types";

test("issue 2: changing subs-per-quarter in Game settings persists", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 15,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  // Fresh games default to 3 (migration default).
  const { data: before } = await admin
    .from("games")
    .select("subs_per_quarter")
    .eq("id", game.id)
    .single();
  expect(before?.subs_per_quarter).toBe(3);

  // Seed a mid-Q1 live state so the Game-settings affordance is present.
  const positionModel = positionsFor(team.ageGroup);
  const zoneCaps = zoneCapsFor(game.on_field_size, positionModel);
  const lineup: Lineup = { back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [] };
  let cursor = 0;
  for (const z of ALL_ZONES) {
    for (let i = 0; i < zoneCaps[z]; i++) lineup[z].push(players[cursor++].id);
  }
  lineup.bench = players.slice(cursor).map((p) => p.id);
  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available" as const,
      updated_by: ownerId,
    })),
  );
  await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByTestId(`player-tile-${players[0].id}`)).toBeVisible({
    timeout: 10_000,
  });

  // Open Game settings, bump subs-per-quarter to 4, save.
  await page.getByRole("button", { name: /game settings/i }).click();
  const input = page.locator("#live-subs-per-quarter");
  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.fill("4");
  await page.getByRole("button", { name: /^save$/i }).click();

  // The new value persisted to the row.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("games")
          .select("subs_per_quarter")
          .eq("id", game.id)
          .single();
        return data?.subs_per_quarter;
      },
      { timeout: 7_000, intervals: [200, 300, 500, 1000] },
    )
    .toBe(4);
});
