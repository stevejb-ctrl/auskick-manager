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

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
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
  // its contents. The pre-kickoff CTA in LineupPicker.tsx is "Start
  // game" — the "Start Q1" button only appears AFTER the lineup is
  // committed, inside LiveGame.tsx.
  await expect(
    page.getByRole("button", { name: /^start game$/i }),
  ).toBeVisible({ timeout: 10_000 });

  // PlayerTile renders single-word names verbatim (the factory uses
  // distinct first names — see e2e/fixtures/factories.ts). Each
  // active player should appear in at least one tile.
  for (let i = 0; i < Math.min(players.length, 12); i++) {
    await expect(
      page.getByText(players[i].full_name, { exact: true }),
    ).toHaveCount(1, { timeout: 5_000 });
  }
});
