// Covers the injury-replacement picker (InjuryReplacementModal).
// Marking a player injured on the field used to leave a hole; now the
// coach is prompted to pick a bench replacement, sorted by least game
// time first. The picker fires both an injury event and a swap event
// atomically so zone minutes stay correct.
//
// Covers:
//   - src/components/live/InjuryReplacementModal.tsx
//   - src/lib/stores/liveGameStore.ts → applyInjurySwap
//   - src/components/live/LiveGame.tsx → handleInjuryReplacement
//   - server actions: markInjury + recordSwap (parallel write)

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("injuring an on-field player prompts for a bench replacement and persists both events", async ({
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
    count: 12, // U10 plays 9 — leaves 3 on the bench, plenty for a replacement
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  // Build a starting lineup: first on_field_size players to the field
  // (split evenly across back/mid/fwd), the rest on the bench.
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

  // Seed lineup_set + quarter_start so the live page renders a running
  // mid-quarter, with the on-field tiles tappable.
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

  // Pick a mid-zone player to injure (they always exist for U10's 9-on-field).
  const injured = onField[third]; // first player in mid
  // The replacement we'll pick — first bench player. They start with 0 minutes
  // played, so they should appear at the top of the modal as "Suggested".
  const replacement = bench[0];

  // Tap the on-field player to open the player-actions sheet (LockModal).
  await page.getByText(injured.full_name).first().click();
  // Tap "Mark injured".
  await page.getByRole("button", { name: /mark injured/i }).click();

  // The InjuryReplacementModal should now be visible — title contains "comes on".
  await expect(page.getByText(/who comes on at/i)).toBeVisible();
  // The bench replacement row should be visible with the "Suggested" badge
  // (least game time → top of the list).
  await expect(page.getByText("Suggested")).toBeVisible();

  // Pick the replacement. The button's accessible label is the player's name.
  await page.getByRole("button", { name: new RegExp(replacement.full_name, "i") }).click();

  // Server-action round-trip — wait briefly for both events to land.
  await page.waitForTimeout(750);

  // Assert the injury event recorded the right player.
  const { data: injuryEvents } = await admin
    .from("game_events")
    .select("type, player_id, metadata")
    .eq("game_id", game.id)
    .eq("type", "injury");
  expect(injuryEvents?.length ?? 0).toBeGreaterThanOrEqual(1);
  const inj = injuryEvents!.find((e) => e.player_id === injured.id);
  expect(inj).toBeTruthy();
  expect((inj!.metadata as { injured: boolean }).injured).toBe(true);

  // Assert the swap event recorded off=injured, on=replacement.
  const { data: swapEvents } = await admin
    .from("game_events")
    .select("type, player_id, metadata")
    .eq("game_id", game.id)
    .eq("type", "swap");
  expect(swapEvents?.length ?? 0).toBeGreaterThanOrEqual(1);
  const sw = swapEvents!.find(
    (e) =>
      (e.metadata as { off_player_id?: string }).off_player_id === injured.id &&
      (e.metadata as { on_player_id?: string }).on_player_id === replacement.id
  );
  expect(sw).toBeTruthy();
  expect((sw!.metadata as { zone: string }).zone).toBe("mid");
});

test("injuring an on-field player when the bench is empty falls through to the original direct-injury path (no picker shown)", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  // Exactly on_field_size players → no bench candidates.
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 9,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  const third = Math.floor(game.on_field_size / 3);
  const lineup = {
    back: players.slice(0, third).map((p) => p.id),
    hback: [],
    mid: players.slice(third, third * 2).map((p) => p.id),
    hfwd: [],
    fwd: players.slice(third * 2).map((p) => p.id),
    bench: [] as string[],
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

  const injured = players[third];
  await page.getByText(injured.full_name).first().click();
  await page.getByRole("button", { name: /mark injured/i }).click();

  // Picker should NOT appear — the gate in LiveGame.tsx skips it when the
  // bench has no eligible candidate. The injury fires straight through.
  await expect(page.getByText(/who comes on at/i)).not.toBeVisible({ timeout: 1500 });

  await page.waitForTimeout(500);

  const { data: injuryEvents } = await admin
    .from("game_events")
    .select("type, player_id, metadata")
    .eq("game_id", game.id)
    .eq("type", "injury")
    .eq("player_id", injured.id);
  expect(injuryEvents?.length ?? 0).toBeGreaterThanOrEqual(1);

  // No swap event should have fired in this branch.
  const { data: swapEvents } = await admin
    .from("game_events")
    .select("type")
    .eq("game_id", game.id)
    .eq("type", "swap");
  expect(swapEvents?.length ?? 0).toBe(0);
});
