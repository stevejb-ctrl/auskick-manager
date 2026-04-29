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
  // U10's defaultOnFieldSize is 12 (per src/lib/ageGroups.ts) — so for
  // a non-empty bench we need >12 players. 15 = 12 on field + 3 bench.
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 15,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  // Build a starting lineup: first on_field_size (12) players to the
  // field (4-4-4 across back/mid/fwd for U10's zones3 model), the
  // rest on the bench.
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

  // Pick a mid-zone player to injure.
  const injured = onField[third]; // first player in mid
  // The replacement we'll pick — first bench player.
  const replacement = bench[0];

  // Tap the on-field PlayerTile by its testid. Avoids colliding
  // with SwapCard's pair-row buttons, which also expose role of
  // "button" with the player name in their accessible text.
  await page.getByTestId(`player-tile-${injured.id}`).click();
  // LockModal renders "Mark injured" as a button.
  await page.getByRole("button", { name: /mark injured/i }).click();

  // InjuryReplacementModal should now be visible (title: "Who comes
  // on at MID?"), with the first bench candidate flagged "Suggested".
  await expect(page.getByText(/who comes on at/i)).toBeVisible();
  await expect(page.getByText("Suggested")).toBeVisible();

  // Pick the replacement by name. The modal's button accessible name
  // includes the player name + "Suggested" + "Played 0:00 this game".
  await page
    .getByRole("button", { name: new RegExp(replacement.full_name, "i") })
    .click();

  // Both server actions (markInjury + recordSwap) run in parallel
  // inside startTransition; poll until both events have landed.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type, player_id, metadata")
          .eq("game_id", game.id)
          .in("type", ["injury", "swap"]);
        const inj = (data ?? []).find(
          (e) =>
            e.type === "injury" &&
            e.player_id === injured.id &&
            (e.metadata as { injured?: boolean })?.injured === true,
        );
        const sw = (data ?? []).find(
          (e) =>
            e.type === "swap" &&
            (e.metadata as { off_player_id?: string })?.off_player_id ===
              injured.id &&
            (e.metadata as { on_player_id?: string })?.on_player_id ===
              replacement.id &&
            (e.metadata as { zone?: string })?.zone === "mid",
        );
        return Boolean(inj) && Boolean(sw);
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(true);
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
  // Exactly on_field_size (12 for U10) players → no bench candidates.
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 12,
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
  await page.getByTestId(`player-tile-${injured.id}`).click();
  await page.getByRole("button", { name: /mark injured/i }).click();

  // Picker should NOT appear — the gate in LiveGame.tsx skips it when
  // the bench has no eligible candidate. The injury fires straight
  // through and the LockModal closes.
  await expect(page.getByText(/who comes on at/i)).not.toBeVisible({
    timeout: 1500,
  });

  // Injury event should have landed, no swap event.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("game_events")
          .select("type")
          .eq("game_id", game.id)
          .eq("type", "injury")
          .eq("player_id", injured.id);
        return data?.length ?? 0;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBeGreaterThanOrEqual(1);
  const { data: swapEvents } = await admin
    .from("game_events")
    .select("type")
    .eq("game_id", game.id)
    .eq("type", "swap");
  expect(swapEvents?.length ?? 0).toBe(0);
});
