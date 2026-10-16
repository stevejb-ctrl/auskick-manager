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

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
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
    .getByRole("button", { name: /^start q1$/i })
    .click({ timeout: 10_000 });
  await page
    .getByRole("button", { name: /^start clock$/i })
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

// Round 5 (Stagehand sideline-chaos-afl): a quarter the phone wasn't
// watching when the siren went (asleep, reloaded, on another screen)
// was saved with the whole overrun — Q1 recorded at 17:21 of a 12:00
// quarter — so every kid on the field was credited minutes they never
// played, and those carry into season balance. The store already caps
// at the quarter length; the saved quarter_end must too.
test("AFL: a quarter ended after the siren is saved at the quarter length", async ({
  page,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const ids = players.map((p) => p.id);
  // Q1 kicked off 15 minutes ago; U10 quarters are 12.
  const kickoff = new Date(Date.now() - 15 * 60_000).toISOString();
  await admin.from("game_events").insert(
    [
      {
        type: "lineup_set",
        metadata: {
          lineup: {
            back: ids.slice(0, 4),
            hback: [],
            mid: ids.slice(4, 8),
            hfwd: [],
            fwd: ids.slice(8, 12),
            bench: ids.slice(12),
          },
        },
      },
      { type: "quarter_start", metadata: { quarter: 1 } },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId, created_at: kickoff })),
  );
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await page.getByRole("button", { name: /select team for q2/i }).click({ timeout: 15_000 });

  await expect
    .poll(async () => {
      const { data } = await admin
        .from("game_events")
        .select("metadata")
        .eq("game_id", game.id)
        .eq("type", "quarter_end");
      return (data?.[0]?.metadata as { elapsed_ms?: number } | undefined)?.elapsed_ms ?? null;
    })
    .toBe(12 * 60_000);
});
