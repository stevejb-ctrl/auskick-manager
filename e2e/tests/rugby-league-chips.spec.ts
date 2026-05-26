// Rugby-league cohort-chip wiring + position-aware lineup —
// covers two layers of the position-chip feature shipped via
// migration 0039:
//
//   1. The shared CohortChipsSettings + squad PlayerRow surfaces
//      still work for an RL team. A coach can rename a chip and
//      assign it to a player just like AFL / netball. This proves
//      no surface accidentally gated on `sport === 'afl'`.
//   2. RL teams are seeded with "Forward" / "Back" labels and
//      "group" modes by migration 0039 (UPDATE for existing teams
//      + INSERT trigger for new ones). The chip key convention
//      (chip A = forward, chip B = back) is enforced in
//      src/lib/sports/rugby_league/positions.ts and feeds the
//      chip-aware lineup suggester.
//
// Live-game tile rendering is NOT exercised here — that would
// require standing up a full RL game with availability + a
// started match. The LeaguePlayerTile chip dot follows the same
// `player.chip` contract as AFL's PlayerTile, so the squad-page
// assertion is sufficient.
//
// Covers:
//   - src/components/team/CohortChipsSettings.tsx (label save)
//   - src/components/squad/PlayerRow.tsx        (chip edit/save)
//   - src/components/squad/ChipPicker.tsx       (swatch selection)
//   - supabase/migrations/0039_rugby_league_position_chips.sql
//     (Forward/Back labels + group mode auto-seeded on RL teams)

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("RL team: chip labels save from settings + chip assignment persists from squad", async ({
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
    name: `RL-chips-${Date.now()}`,
  });

  try {
    const players = await makePlayers(admin, {
      teamId: team.id,
      ownerId,
      ageGroup: "U10",
      count: 3,
    });
    const target = players[0];

    // ── Step 1: edit chip A label from team settings ──────────
    await page.goto(`/teams/${team.id}/settings`);

    // CohortChipsSettings renders three chip slots labelled "Chip A",
    // "Chip B", "Chip C" via <Label htmlFor="chip-{k}-label">. The
    // mode radiogroup next to each input also carries an aria-label
    // ("Chip A mode"), so use exact match to bind to the <input>,
    // not the radiogroup.
    const chipALabelInput = page.getByLabel("Chip A", { exact: true });
    // The Save button only becomes enabled once the `dirty` flag flips
    // true (label state differs from `initialLabels`). Under parallel
    // workers the dev server can be slow to first-paint the form, so
    // wait for the input to be present + interactable before filling
    // and the Save button to be enabled before clicking.
    await expect(chipALabelInput).toBeEditable({ timeout: 5_000 });
    await chipALabelInput.fill("Older");

    // The card's Save button reads "Save chip settings" (SFButton text).
    // Scoping to text is fine — there's no other save button with that
    // wording on the settings page.
    const saveChipBtn = page.getByRole("button", { name: /save chip settings/i });
    await expect(saveChipBtn).toBeEnabled({ timeout: 5_000 });
    await saveChipBtn.click();

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("teams")
            .select("chip_a_label")
            .eq("id", team.id)
            .single();
          return data?.chip_a_label;
        },
        { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
      )
      .toBe("Older");

    // ── Step 2: assign chip A to a player from the squad page ──
    await page.goto(`/teams/${team.id}/squad`);

    // PlayerRow exposes `data-testid="player-row-${id}"`. Scope all
    // edit / save / chip-picker interactions to that single row to
    // avoid matching another player's Edit button.
    const row = page.getByTestId(`player-row-${target.id}`);

    // The Edit button is admin-gated and renders only after the
    // client-side membership query resolves (same hydration race as
    // settings + squad activate/deactivate — see
    // e2e/helpers/admin-hydration.ts for the rationale). Wait for
    // enabled before clicking.
    const editBtn = row.getByRole("button", { name: /^edit$/i });
    await expect(editBtn).toBeEnabled({ timeout: 5_000 });
    await editBtn.click();

    // ChipPicker renders one button per labelled chip. We just set
    // chip A's label to "Older", so the swatch reads "Older".
    await row.getByRole("button", { name: "Older" }).click();
    await row.getByRole("button", { name: /^save$/i }).click();

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("players")
            .select("chip")
            .eq("id", target.id)
            .single();
          return data?.chip;
        },
        { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
      )
      .toBe("a");

    // ── Step 3: clear the chip via "Any" ─────────────────────
    // Round-trips the "remove a tag" path, which writes chip=null.
    // ChipPicker renames the clear button from "Unset" → "Any"
    // (src/components/squad/ChipPicker.tsx line 44) so the user-
    // facing copy reads as "no specific chip" rather than the more
    // technical "unset". Test follows the rename.
    await expect(editBtn).toBeEnabled({ timeout: 5_000 });
    await editBtn.click();
    await row.getByRole("button", { name: /^any$/i }).click();
    await row.getByRole("button", { name: /^save$/i }).click();

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("players")
            .select("chip")
            .eq("id", target.id)
            .single();
          return data?.chip;
        },
        { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
      )
      .toBeNull();
  } finally {
    // Cascade-deletes players via FK ON DELETE CASCADE from 0001.
    await admin.from("teams").delete().eq("id", team.id);
  }
});

test("RL team: 0039 trigger auto-seeds Forward/Back labels + group mode on team creation", async () => {
  // The `seed_rugby_league_position_chips` trigger fires BEFORE
  // INSERT on every team row. RL teams created without explicit
  // chip labels should land with chip_a_label="Forward",
  // chip_b_label="Back", and both modes flipped to "group" so the
  // chip-aware lineup suggester pools forwards-with-forwards and
  // backs-with-backs out of the box.
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    sport: "rugby_league",
    name: `RL-seed-${Date.now()}`,
  });

  try {
    const { data: row } = await admin
      .from("teams")
      .select("chip_a_label, chip_b_label, chip_a_mode, chip_b_mode")
      .eq("id", team.id)
      .single();
    expect(row?.chip_a_label).toBe("Forward");
    expect(row?.chip_b_label).toBe("Back");
    expect(row?.chip_a_mode).toBe("group");
    expect(row?.chip_b_mode).toBe("group");
  } finally {
    await admin.from("teams").delete().eq("id", team.id);
  }
});

test("non-RL team: 0039 trigger leaves AFL chip slots untouched", async () => {
  // The trigger gates on `NEW.sport = 'rugby_league'` so AFL +
  // netball teams should still ship with null chip labels (the
  // CohortChipsSettings card prompts the coach to fill them in
  // themselves — chips on AFL are coach-defined like "older /
  // younger / new"). Without this gate the trigger would silently
  // rename every team's chips to "Forward / Back", breaking the
  // AFL contract.
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    sport: "afl",
    name: `AFL-chip-seed-check-${Date.now()}`,
  });

  try {
    const { data: row } = await admin
      .from("teams")
      .select("chip_a_label, chip_b_label, chip_a_mode, chip_b_mode")
      .eq("id", team.id)
      .single();
    expect(row?.chip_a_label).toBeNull();
    expect(row?.chip_b_label).toBeNull();
    // Modes default to "split" per migration 0031 — the trigger
    // only touches RL teams, so this stays at the column default.
    expect(row?.chip_a_mode).toBe("split");
    expect(row?.chip_b_mode).toBe("split");
  } finally {
    await admin.from("teams").delete().eq("id", team.id);
  }
});
