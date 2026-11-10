// Covers the pre-kickoff lineup picker:
//   - Server-suggested lineup renders with all positions filled
//   - Manual swap before kickoff re-assigns a player between zones
//
// Covers: src/lib/ageGroupFlow.ts:suggestStartingLineup rendering path,
//         manual pre-kickoff drag/tap interactions.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("pre-kickoff lineup renders a full field of players", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  const players = await makePlayers(admin, {
    teamId: team.id,
    ownerId,
    count: 15,
  });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  // The /live page short-circuits to "No players marked available" when
  // there are no `status='available'` rows in `game_availability` for
  // this game — see the live page's `availablePlayers.length === 0`
  // branch. Seed availability explicitly so the LineupPicker renders
  // instead of the empty-state hint.
  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available" as const,
      updated_by: ownerId,
    })),
  );

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // Wait for the LineupPicker to actually render before asserting on
  // its contents. The pre-kickoff CTA in LineupPicker.tsx is "Ready"
  // (live v3): it sets the lineup, and "Start Q1" only appears AFTER,
  // on the live screen's bar (LiveGame.tsx).
  await expect(
    page.getByRole("button", { name: /^ready$/i }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^start q1$/i })).toHaveCount(0);

  // PlayerTile renders single-word names verbatim (the factory uses
  // distinct first names — see e2e/fixtures/factories.ts). Each
  // active player should appear in at least one tile.
  for (let i = 0; i < Math.min(players.length, 12); i++) {
    await expect(
      page.getByText(players[i].full_name, { exact: true }),
    ).toHaveCount(1, { timeout: 5_000 });
  }

  // Season time-in-zone breakdown (Steve 2026-07-07, revised 2026-07-08
  // UX review #8): on a brand-new team NOBODY has zone history, so the
  // picker collapses the per-player %s + key to ONE squad-level note
  // instead of repeating "No season time yet" under all 15 rows.
  // Live v3: the same single note, now under the bench; once there's
  // season time it's said in words under each kid.
  await expect(
    page.getByText(/season time shows under each player after your first game/i),
  ).toBeVisible();
  await expect(page.getByText(/season time in zone/i)).toHaveCount(0);
});

// UX plan 1.7 / H4: the AFL picker showed zone LISTS while the live
// game showed a FIELD, so the coach re-learnt the layout at kickoff.
// The picker now draws the same field + bench tiles; tap-tap swaps.
test("the AFL lineup picker uses the live field and swaps by tap-tap", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available" as const,
      updated_by: ownerId,
    })),
  );
  await page.addInitScript(() => {
    try { localStorage.setItem("gm-walkthrough-seen", "1"); } catch {}
  });

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  const lineup = page.getByRole("region", { name: /starting lineup/i });
  // 12 on the field + 2 on the bench, all as live-game tiles.
  await expect(lineup.locator('[data-testid^="player-tile-"]')).toHaveCount(14, {
    timeout: 10_000,
  });

  // Find one bench player and one field player, then swap them.
  // Live v3: the bench is a KidBench ("BENCH 2" in the margin), a named
  // group; it was a "Bench (2)" card.
  const bench = lineup.getByRole("group", { name: "Bench", exact: true });
  await expect(bench).toContainText("Bench 2");
  const benchTile = bench.locator('[data-testid^="player-tile-"]').first();
  const benchId = (await benchTile.getAttribute("data-testid"))!.replace("player-tile-", "");
  // The field renders before the bench, so the first tile is on it.
  const fieldTile = lineup.locator('[data-testid^="player-tile-"]').first();
  const fieldId = (await fieldTile.getAttribute("data-testid"))!.replace("player-tile-", "");
  expect(fieldId).not.toBe(benchId);

  await fieldTile.click();
  await benchTile.click();

  await expect(bench.getByTestId(`player-tile-${fieldId}`)).toBeVisible();
  await expect(bench.getByTestId(`player-tile-${benchId}`)).toHaveCount(0);
});
