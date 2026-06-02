// F3 (Phase 12) — long-press player insight summary.
//
// Long-pressing a player opens the host action modal (AFL/RL: LockModal;
// netball: NetballPlayerActions). All three embed the SHARED
// PlayerInsightSummary via the `insight` slot, so the same three
// sections render regardless of sport:
//   - player-insight-ingame  (this game: time on + per-zone time)
//   - player-insight-periods (per-period zone breakdown)
//   - player-insight-season  (season per-zone PERCENTAGES, D-04)
//
// This AFL case seeds a completed Q1 + an in-progress Q2 so the replay
// produces per-period zone-ms (playedZoneMsByPeriod) and the "By period"
// section has real data to render. Netball + league cases are added in
// plan 12-02.
//
// Covers:
//   - src/lib/player-insight.ts buildPlayerInsight
//   - src/components/live/PlayerInsightSummary.tsx
//   - src/components/live/LockModal.tsx insight slot
//   - src/components/live/LiveGame.tsx insight wiring
//   - src/lib/fairness.ts playedZoneMsByPeriod

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("AFL: long-press a player shows in-game, per-period and season insight sections", async ({
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

  const onField = players.slice(0, game.on_field_size);
  const bench = players.slice(game.on_field_size);
  const third = Math.floor(game.on_field_size / 3);
  const lineup = {
    back: onField.slice(0, third).map((p) => p.id),
    hback: [],
    mid: onField.slice(third, third * 2).map((p) => p.id),
    hfwd: [],
    fwd: onField.slice(third * 2).map((p) => p.id),
    bench: bench.map((p) => p.id),
  };

  // A completed Q1 (full quarter played) then Q2 in progress. The
  // quarter_end's elapsed_ms credits every on-field player a full
  // quarter in their zone, so replayGame populates playedZoneMsByPeriod
  // for period 1 — giving the "By period" section real data to show.
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
    {
      game_id: game.id,
      type: "quarter_end",
      metadata: { quarter: 1, elapsed_ms: 600_000 },
      created_by: ownerId,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 2 },
      created_by: ownerId,
    },
  ]);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // A player who was on the field for the whole of Q1.
  const source = onField[0];

  // Long-press (PlayerTile fires onLongPress after a 500ms hold).
  await page.getByTestId(`player-tile-${source.id}`).click({ delay: 600 });

  // The shared PlayerInsightSummary renders its three sections inside
  // the LockModal, between the player's name and the action buttons.
  await expect(page.getByTestId("player-insight-ingame")).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByTestId("player-insight-periods")).toBeVisible();
  await expect(page.getByTestId("player-insight-season")).toBeVisible();

  // The per-period section lists Q1 (the completed quarter).
  await expect(
    page.getByTestId("player-insight-periods").getByText("Q1"),
  ).toBeVisible();

  // The action buttons still render below the summary — the slot is
  // additive, not a replacement.
  await expect(
    page.getByRole("button", { name: /^switch player\b/i }),
  ).toBeVisible();
});
