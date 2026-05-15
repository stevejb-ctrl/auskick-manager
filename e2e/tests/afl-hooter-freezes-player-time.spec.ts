// Regression for Steve's 2026-05-15 report: "At the end of a
// quarter the player time continues to accrue, rather than pausing
// with the clock" — observed on AFL/Footy, NOT netball.
//
// The LiveGame.tsx auto-hooter calls pauseClock() (line ~1171) and
// my static analysis says player time SHOULD freeze: clockElapsedMs
// returns `accumulatedMs` constant after pauseClock, displayNowMs
// caps at quarterMs, and zoneMsByPlayer is computed from that
// frozen value. But Steve sees the time still ticking, so the
// theory is wrong somewhere.
//
// This test exercises the path end-to-end at 60× demo speed:
//   1. Kick off Q1 via the LineupPicker → modal flow.
//   2. Wait for the auto-hooter (~12s wall = 12min game time).
//   3. Read a player tile's displayed time at the hooter moment.
//   4. Wait an additional 2 wall-seconds.
//   5. Read the same player tile's time again.
//   6. Assert: equal. If they're not, the bug reproduces.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("AFL: player tile time freezes at the auto-hooter", async ({ page }) => {
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

  // 60× demo speed so the 12-minute Q1 fires the hooter in ~12s
  // wall-clock. Same trick as full-game-playthrough.spec.ts.
  await admin
    .from("games")
    .update({ clock_multiplier: 60 })
    .eq("id", game.id);

  // Seed availability for every player.
  await admin.from("game_availability").insert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available" as const,
      updated_by: ownerId,
    })),
  );

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  // Kick off Q1 via the new (post-2026-05-13) flow.
  await page
    .getByRole("button", { name: /^ready for q1$/i })
    .click({ timeout: 10_000 });
  await page
    .getByRole("button", { name: /^start q1$/i })
    .click({ timeout: 3_000 });

  // Wait for the QuarterEndModal to appear (the hooter fires +
  // modal opens automatically). 25s buffer for CI slop on top of
  // the ~12s real-time hooter window.
  await expect(
    page.getByRole("button", { name: /select team for q2/i }),
  ).toBeVisible({ timeout: 25_000 });

  // Read a player tile's displayed time. The first PlayerTile in
  // the DOM is the one at the top of the FWD zone — picked
  // deterministically rather than by name.
  const tile = page.locator(`[data-testid^="player-tile-"]`).first();
  await expect(tile).toBeVisible();
  const timeAtHooter = await tile.textContent();
  expect(timeAtHooter, "PlayerTile should render some time text after hooter")
    .toMatch(/\d+:\d{2}/);

  // Wait 2 wall-seconds. In demo mode that would be 2 game-
  // minutes if the clock kept running. After pauseClock the
  // displayed time MUST stay constant.
  await page.waitForTimeout(2_000);

  const timeAfterWait = await tile.textContent();
  expect(timeAfterWait).toBe(timeAtHooter);
});
