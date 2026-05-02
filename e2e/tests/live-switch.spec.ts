// Covers the long-press → "Switch player" affordance for AFL.
// Long-press a tile, tap "Switch player" in the LockModal, then tap
// another player to complete the swap. The Switch button hooks into
// the existing tap-tap selection flow (selectField / selectBench)
// rather than introducing a parallel swap path, so this test also
// indirectly verifies that hookup.
//
// Netball Switch coverage lives in netball-live-flow.spec.ts because
// that's the single-spec convention for the netball live shell.
//
// Covers:
//   - src/components/live/LockModal.tsx onSwitch button
//   - src/components/live/LiveGame.tsx onSwitch wiring (selectField /
//     selectBench based on actual lineup placement, not lockModal.zone
//     which falls back to lastStintZone)

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("AFL: long-press → Switch → tap teammate in different zone records a field_zone_swap", async ({
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

  // 12 on-field (4-4-4 across back/mid/fwd), 3 bench.
  const onField = players.slice(0, game.on_field_size);
  const bench = players.slice(game.on_field_size);
  const third = Math.floor(game.on_field_size / 3);
  const backIds = onField.slice(0, third).map((p) => p.id);
  const midIds = onField.slice(third, third * 2).map((p) => p.id);
  const fwdIds = onField.slice(third * 2).map((p) => p.id);
  const lineup = {
    back: backIds,
    hback: [],
    mid: midIds,
    hfwd: [],
    fwd: fwdIds,
    bench: bench.map((p) => p.id),
  };

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

  // Source player: first back; target: first fwd (different zone, so
  // applyFieldZoneSwap fires when the second tap lands).
  const source = onField[0];
  const target = onField[third * 2];

  // Long-press the source. PlayerTile fires onLongPress after a
  // 500ms pointer-hold; click({ delay: 600 }) holds long enough.
  await page.getByTestId(`player-tile-${source.id}`).click({ delay: 600 });

  // LockModal renders "Switch player" as the top action.
  await expect(
    page.getByRole("button", { name: /^switch player\b/i }),
  ).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /^switch player\b/i }).click();

  // Tap the target — a regular tap on a field tile in a different
  // zone triggers applyFieldZoneSwap, which writes a
  // field_zone_swap event server-side.
  await page.getByTestId(`player-tile-${target.id}`).click();

  // Server should record the field_zone_swap event with both player
  // ids and the original zones.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, metadata")
          .eq("game_id", game.id)
          .eq("type", "field_zone_swap");
        return (data ?? []).filter((e) => {
          const m = e.metadata as
            | {
                player_a_id?: string;
                player_b_id?: string;
                zone_a?: string;
                zone_b?: string;
              }
            | null;
          return (
            m?.player_a_id === source.id &&
            m?.player_b_id === target.id &&
            m?.zone_a === "back" &&
            m?.zone_b === "fwd"
          );
        }).length;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(1);
});

test("AFL: long-press a bench player → Switch → tap a field player opens the swap-confirm dialog", async ({
  page,
}) => {
  // Bench-initiated path: Switch puts the bench player into a "bench"
  // selection; the next tap on a field tile opens
  // SwapConfirmDialog, which writes a `swap` event when confirmed.
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

  const benchPlayer = bench[0];
  const fieldTarget = onField[0]; // a back player

  // Long-press the bench player.
  await page.getByTestId(`player-tile-${benchPlayer.id}`).click({ delay: 600 });

  // Switch button is visible — bench players also get the Switch
  // affordance (the LockModal copy adapts: "Tap a field player to
  // bring them on" instead of the field-player wording).
  await page.getByRole("button", { name: /^switch player\b/i }).click();

  // Tap a field tile — opens SwapConfirmDialog. The dialog's
  // confirm CTA is a "Confirm" button (per SwapConfirmDialog.tsx).
  await page.getByTestId(`player-tile-${fieldTarget.id}`).click();
  await expect(
    page.getByRole("button", { name: /^confirm$/i }),
  ).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /^confirm$/i }).click();

  // Server records a `swap` event with the bench-on / field-off pair.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, metadata")
          .eq("game_id", game.id)
          .eq("type", "swap");
        return (data ?? []).filter((e) => {
          const m = e.metadata as
            | { off_player_id?: string; on_player_id?: string; zone?: string }
            | null;
          return (
            m?.on_player_id === benchPlayer.id &&
            m?.off_player_id === fieldTarget.id &&
            m?.zone === "back"
          );
        }).length;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(1);
});
