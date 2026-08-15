// ─── Regression: recall a pre-game-lent player (rugby league) ───
//
// Same bug as AFL: a player lent to the opposition before kickoff was never
// placed in the lineup, so the rugby-league live screen showed no tile for
// them and the coach couldn't bring them back without restarting a period.
// The league view now shows an always-visible "Lent" recall strip sourced
// from the whole squad; "Bring back" un-loans them and the replay lands them
// on the bench.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

async function suppressWalkthrough(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
}

test("rugby league: a player lent before kickoff can be recalled during the game", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    sport: "rugby_league",
    name: `RL-RECALL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 12,
    ageGroup: "U10",
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });

  // Lent before kickoff → NOT in the lineup.
  const lent = players[players.length - 1];
  const fielded = players.filter((p) => p.id !== lent.id);
  const onFieldCount = 8;
  const fieldIds = fielded.slice(0, onFieldCount).map((p) => p.id);
  const forwardIds = fieldIds.slice(0, 4);
  const backIds = fieldIds.slice(4);
  const benchIds = fielded.slice(onFieldCount).map((p) => p.id);

  const loanAt = new Date(Date.now() - 14 * 60_000).toISOString();
  const startAt = new Date(Date.now() - 13 * 60_000).toISOString();
  await admin.from("game_events").insert([
    {
      game_id: game.id,
      type: "player_loan",
      player_id: lent.id,
      metadata: { loaned: true, quarter: 1, elapsed_ms: 0, sport: "rugby_league" },
      created_by: ownerId,
      created_at: loanAt,
    },
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: {
        lineup: { forwards: forwardIds, backs: backIds, bench: benchIds },
        sport: "rugby_league",
      },
      created_by: ownerId,
      created_at: startAt,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 1, sport: "rugby_league" },
      created_by: ownerId,
      created_at: startAt,
    },
  ]);
  await admin
    .from("games")
    .update({ status: "in_progress", on_field_size: onFieldCount })
    .eq("id", game.id);

  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  const recall = page.getByTestId(`league-recall-lent-${lent.id}`);
  await expect(recall).toBeVisible({ timeout: 15_000 });

  await recall.click();

  // A recall event (player_loan, loaned:false) lands.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, player_id, metadata")
          .eq("game_id", game.id)
          .eq("type", "player_loan")
          .eq("player_id", lent.id);
        return (data ?? []).some(
          (e) => (e.metadata as { loaned?: boolean })?.loaned === false,
        );
      },
      { timeout: 10_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(true);

  await expect(recall).toBeHidden({ timeout: 10_000 });
});
