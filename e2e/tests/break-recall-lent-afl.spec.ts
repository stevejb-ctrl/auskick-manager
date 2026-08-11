// ─── Regression: recall a pre-game-lent player at the AFL break ───
//
// Bug from real games: a player lent to the opposition BEFORE kickoff was
// missing from the quarter-break lineup picker — the coach had to actually
// start the quarter to get them back. Two fixes make this work:
//   1. replayGame now records a player_loan even when it lands before the
//      first lineup_set, so loanedIds knows the player is lent.
//   2. The AFL QuarterBreak shows an always-visible "Lent" recall strip
//      (sourced from the whole squad) whose "Bring back" drops the player
//      onto the staged bench.
//
// Pre-fix this FAILS: the pre-kickoff loan is dropped by replayGame, so the
// recall strip never renders for the lent player.

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

test("AFL: a player lent before kickoff can be recalled at the quarter break", async ({
  page,
}) => {
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

  // The player lent to the opposition before kickoff — NOT placed in the
  // lineup (lending removes them). We field the other 14.
  const lent = players[players.length - 1];
  const fielded = players.filter((p) => p.id !== lent.id);

  const onField = fielded.slice(0, game.on_field_size);
  const bench = fielded.slice(game.on_field_size);
  const third = Math.floor(game.on_field_size / 3);
  const lineup = {
    back: onField.slice(0, third).map((p) => p.id),
    hback: [],
    mid: onField.slice(third, third * 2).map((p) => p.id),
    hfwd: [],
    fwd: onField.slice(third * 2).map((p) => p.id),
    bench: bench.map((p) => p.id),
  };

  // The pre-game loan lands BEFORE lineup_set (14 min ago vs 13). This is the
  // exact ordering that the old replay guard dropped.
  const loanAt = new Date(Date.now() - 14 * 60_000).toISOString();
  const aMomentAgo = new Date(Date.now() - 13 * 60_000).toISOString();
  await admin.from("game_events").insert([
    {
      game_id: game.id,
      type: "player_loan",
      player_id: lent.id,
      metadata: { loaned: true, quarter: 1, elapsed_ms: 0 },
      created_by: ownerId,
      created_at: loanAt,
    },
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: { lineup },
      created_by: ownerId,
      created_at: aMomentAgo,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 1 },
      created_by: ownerId,
      created_at: aMomentAgo,
    },
    {
      game_id: game.id,
      type: "quarter_end",
      metadata: { quarter: 1, elapsed_ms: 12 * 60_000 },
      created_by: ownerId,
      created_at: new Date(Date.now() - 60_000).toISOString(),
    },
  ]);
  await admin.from("game_availability").upsert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available",
      updated_by: ownerId,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "game_id,player_id" },
  );
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  const selectTeamBtn = page.getByRole("button", {
    name: /select team for q2/i,
  });
  if (await selectTeamBtn.isVisible().catch(() => false)) {
    await selectTeamBtn.click({ timeout: 10_000 });
  }
  await expect(
    page.getByRole("button", { name: /^ready for q2$/i }),
  ).toBeVisible({ timeout: 15_000 });

  // The lent player is visible in the always-on recall strip (pre-fix: absent).
  const recall = page.getByTestId(`qb-recall-lent-${lent.id}`);
  await expect(recall).toBeVisible({ timeout: 10_000 });

  // Bring them back.
  await recall.click();

  // A recall event (player_loan, loaned:false) lands...
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

  // ...and the recall chip disappears (they're no longer lent).
  await expect(recall).toBeHidden({ timeout: 10_000 });
});
