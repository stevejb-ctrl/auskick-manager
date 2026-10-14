// Rugby league clock pause. Pausing froze the half clock on screen,
// but resuming threw the pause away: the clock was still worked out
// from the kick-off time, so it jumped forward by however long it
// had been paused. The hooter, the sub timer and every saved
// elapsed_ms then credited on-field kids with the stoppage.
//
// The pause still lives only in the page (no quarter_pause event),
// so it doesn't survive a reload. Neither does AFL's or netball's.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

/** The league scorebug's countdown (m:ss left in the half), in seconds. */
async function secondsLeft(page: Page): Promise<number> {
  const text = await page
    .locator('button[aria-label^="Clock"] [aria-live="polite"]')
    .first()
    .textContent();
  const m = (text ?? "").match(/(\d+):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

test("rugby league: resuming a paused half carries on from where it stopped", async ({ page }) => {
  // A deliberate six-second stoppage on top of the page load.
  test.setTimeout(90_000);
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    sport: "rugby_league",
    name: `RL-Pause-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 10, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId, ageGroup: "U10" });
  const ids = players.map((p) => p.id);
  const onFieldCount = 8;

  // H1 kicked off a few seconds ago, at real speed.
  const startAt = new Date(Date.now() - 3_000).toISOString();
  await admin.from("game_events").insert(
    [
      {
        type: "lineup_set",
        metadata: {
          lineup: { forwards: ids.slice(0, 4), backs: ids.slice(4, onFieldCount), bench: ids.slice(onFieldCount) },
          sport: "rugby_league",
        },
      },
      { type: "quarter_start", metadata: { quarter: 1, sport: "rugby_league" } },
    ].map((e) => ({ ...e, game_id: game.id, created_by: ownerId, created_at: startAt })),
  );
  await admin
    .from("games")
    .update({ status: "in_progress", on_field_size: onFieldCount, clock_multiplier: 1 })
    .eq("id", game.id);

  await page.addInitScript(() => {
    try {
      localStorage.setItem("gm-walkthrough-seen", "1");
    } catch {}
  });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);

  const running = page.getByRole("button", { name: /^clock — h1, running$/i });
  const paused = page.getByRole("button", { name: /^clock — h1, paused$/i });
  await expect(running).toBeVisible({ timeout: 15_000 });
  // Wait for the first client tick (the server render shows a full half).
  await expect.poll(() => secondsLeft(page), { timeout: 5_000 }).toBeLessThan(20 * 60);

  // Pause from the clock menu.
  await running.click();
  await page
    .getByRole("dialog", { name: /h1 clock/i })
    .getByRole("button", { name: /^pause clock$/i })
    .click();
  await expect(paused).toBeVisible();
  const atPause = await secondsLeft(page);

  // A six-second stoppage. The clock holds still on screen.
  await page.waitForTimeout(6_000);
  expect(await secondsLeft(page)).toBe(atPause);

  // Resume.
  await paused.click();
  const resumedAt = Date.now();
  await page
    .getByRole("dialog", { name: /h1 clock/i })
    .getByRole("button", { name: /^resume clock$/i })
    .click();
  await expect(running).toBeVisible();
  const afterResume = await secondsLeft(page);
  const realSecondsSinceResume = (Date.now() - resumedAt) / 1000;

  // The clock only lost the time played since the resume (plus a
  // tick of rounding), not the six paused seconds. Before the fix it
  // jumped straight down by the whole stoppage.
  expect(atPause - afterResume).toBeLessThanOrEqual(Math.ceil(realSecondsSinceResume) + 1);

  // And it is running again.
  await expect.poll(() => secondsLeft(page), { timeout: 5_000 }).toBeLessThan(afterResume);
});
