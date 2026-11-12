// ─── Time bars on the live tiles ─────────────────────────────
// Live v3 took the zone-time bar off the kid tiles (8 Nov 2026). Steve,
// 13 Nov: coaches want it, but not everyone, so it's back as a per-phone
// preference, on by default: a thin bar along each tile's foot, its time
// in each area this game. Switched from the live game's menu (Hide /
// Show time bars) or Account, kept in localStorage.
//
// Covers: KidTile ZoneTimeBar, lib/live/zoneBars, LiveGameMenu's switch,
// Account's ZoneBarsPreferenceSettings, and each sport passing its split.

import { test, expect } from "@playwright/test";
import { aflGame, basketballGame, netballGame, openLive, skipHints } from "../helpers/a11y";
import { openGameMenu } from "../helpers/liveShell";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });
test.use({ viewport: { width: 390, height: 844 } });

test("AFL: every kid who's played has a time bar, in their zone's colour, and the bench none yet", async ({ page }) => {
  const { team, game, players } = await aflGame({ name: "ZB-AFL", elapsedSec: 90 });
  await skipHints(page);
  await openLive(page, team.id, game.id);

  // Back 0–3, mid 4–7, fwd 8–11: one stretch each, in its own zone.
  for (const [i, zone] of [[0, "back"], [5, "mid"], [9, "fwd"]] as const) {
    const bar = page.getByTestId(`player-tile-${players[i].id}`).getByTestId("zone-bar");
    await expect(bar).toBeVisible({ timeout: 15_000 });
    await expect(bar.locator("[data-zone]")).toHaveCount(1);
    await expect(bar.locator("[data-zone]")).toHaveAttribute("data-zone", zone);
  }
  // The bench hasn't played: nothing to show.
  await expect(page.getByTestId(`player-tile-${players[13].id}`).getByTestId("zone-bar")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("zone-bars-afl.png") });
});

test("the game menu hides the bars on this phone, and they stay hidden after a reload", async ({ page }) => {
  const { team, game, players } = await aflGame({ name: "ZB-MENU", elapsedSec: 90 });
  await skipHints(page);
  await openLive(page, team.id, game.id);
  const tile = page.getByTestId(`player-tile-${players[0].id}`);
  await expect(tile.getByTestId("zone-bar")).toBeVisible({ timeout: 15_000 });

  let menu = await openGameMenu(page);
  await menu.getByTestId("menu-zone-bars").click();
  await expect(page.getByTestId("zone-bar")).toHaveCount(0);

  await page.reload();
  await waitForHydration(page);
  await expect(tile).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("zone-bar")).toHaveCount(0);

  // And back on, from the same item, now saying so.
  menu = await openGameMenu(page);
  await expect(menu.getByTestId("menu-zone-bars")).toContainText("Show time bars");
  await menu.getByTestId("menu-zone-bars").click();
  await expect(tile.getByTestId("zone-bar")).toBeVisible();
});

test("Account's switch turns the bars off for the live screen", async ({ page }) => {
  const { team, game, players } = await aflGame({ name: "ZB-ACCT", elapsedSec: 90 });
  await skipHints(page);
  await page.goto("/account");
  await waitForHydration(page);
  const toggle = page.getByRole("switch", { name: "Time bars on players" });
  await expect(toggle).toHaveAttribute("aria-checked", "true", { timeout: 15_000 });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  await openLive(page, team.id, game.id);
  await expect(page.getByTestId(`player-tile-${players[0].id}`)).toBeVisible();
  await expect(page.getByTestId("zone-bar")).toHaveCount(0);
});

test("netball and basketball draw their own areas", async ({ page }) => {
  await skipHints(page);
  // Netball: GS (index 0) plays in the attack third.
  const nb = await netballGame({ name: "ZB-NB", elapsedSec: 90 });
  await openLive(page, nb.team.id, nb.game.id);
  const gs = page.getByTestId(`player-tile-${nb.players[0].id}`).getByTestId("zone-bar");
  await expect(gs).toBeVisible({ timeout: 15_000 });
  await expect(gs.locator("[data-zone]")).toHaveAttribute("data-zone", "attack");
  await page.screenshot({ path: test.info().outputPath("zone-bars-netball.png") });

  // Basketball: guards 0–1, forwards 2–4.
  const bb = await basketballGame({ name: "ZB-BB", elapsedSec: 90 });
  await openLive(page, bb.team.id, bb.game.id);
  for (const [i, line] of [[0, "guard"], [3, "forward"]] as const) {
    const bar = page.getByTestId(`player-tile-${bb.players[i].id}`).getByTestId("zone-bar");
    await expect(bar).toBeVisible({ timeout: 15_000 });
    await expect(bar.locator("[data-zone]")).toHaveAttribute("data-zone", line);
  }
  await page.screenshot({ path: test.info().outputPath("zone-bars-basketball.png") });
});
