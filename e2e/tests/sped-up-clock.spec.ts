// Sped-up clock (games.clock_multiplier) — the public demo runs at 8×
// and test / explore seeds run faster still. Real games run at 1×, so
// this only ever showed to demo prospects (Stagehand rounds 4 and 5,
// Oct 2026).
//
// AFL: saved events and the replay are in GAME ms (elapsed_ms = real
// ms × multiplier) but the live store ran in real ms. After a reload a
// kid subbed on at 2:40 of game time showed 0:00 until the siren, and
// every tile ran at 1/8 of the header clock.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

async function suppressWalkthrough(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
}

/** Seconds shown on each tile (its trailing m:ss), read in one go so
 *  both come from the same render. */
async function tileSeconds(page: Page, ids: string[]): Promise<number[]> {
  return page.evaluate((tileIds) => {
    return tileIds.map((id) => {
      const text = document.querySelector(`[data-testid="player-tile-${id}"]`)?.textContent ?? "";
      const m = text.match(/(\d+):(\d{2})\s*$/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
    });
  }, ids);
}

test("AFL at 8×: tiles count game time after a reload, like the replay", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 14 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const ids = players.map((p) => p.id);
  const starter = ids[0]; // a back who has been on since the bounce
  const subbedOff = ids[4]; // a mid, swapped off at 2:40 of game time
  const subbedOn = ids[12]; // off the bench at 2:40

  // Q1 started 30 s ago in real time = 4:00 of game time at 8×. The
  // swap was saved at 2:40 of game time (20 s real after the bounce).
  const t = (secondsAgo: number) => new Date(Date.now() - secondsAgo * 1000).toISOString();
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
        created_at: t(31),
      },
      { type: "quarter_start", metadata: { quarter: 1 }, created_at: t(30) },
      {
        type: "swap",
        metadata: {
          off_player_id: subbedOff,
          on_player_id: subbedOn,
          zone: "mid",
          quarter: 1,
          elapsed_ms: 160_000,
        },
        created_at: t(10),
      },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId })),
  );
  await admin
    .from("games")
    .update({ status: "in_progress", clock_multiplier: 8 })
    .eq("id", game.id);

  await suppressWalkthrough(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByTestId(`player-tile-${subbedOn}`)).toBeVisible({ timeout: 15_000 });

  const [onSecs, starterSecs, offSecs] = await tileSeconds(page, [subbedOn, starter, subbedOff]);

  // Subbed on at 2:40, the clock now past 4:00 → at least 1:20. Was 0:00.
  expect(onSecs).toBeGreaterThanOrEqual(80);
  // Page load at 8× adds game time, but not a whole quarter's worth.
  expect(onSecs).toBeLessThan(80 + 240);
  // A starter has 2:40 more than the kid who came on then. Was 0:30-ish.
  expect(starterSecs - onSecs).toBeGreaterThanOrEqual(158);
  expect(starterSecs - onSecs).toBeLessThanOrEqual(162);
  // The kid who came off keeps exactly the 2:40 they played.
  expect(offSecs).toBe(160);

  // And the tiles keep pace with the game clock: two real seconds
  // are about 16 s of game time, not 2.
  await page.waitForTimeout(2_000);
  const [onLater] = await tileSeconds(page, [subbedOn]);
  expect(onLater - onSecs).toBeGreaterThanOrEqual(10);
});

