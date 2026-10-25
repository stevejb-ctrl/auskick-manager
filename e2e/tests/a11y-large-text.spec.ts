// ─── Large text (200%) ──────────────────────────────────────────────
// UX round 3 (e4, 24 Oct 2026), union at 390×844 with the root font at
// 200%: the sticky score bar was 525 px (62% of the screen) and no kid
// showed between the bars. Each team's chips couldn't wrap, so both +DG
// chips sat at x = 356–452, off the screen, from about 175%. The
// long-press sheet's first action was at y = 758. Break tiles cut names
// to three letters ("Leo…") while times and codes grew. On the game
// page "Copy for group chat" ran off the right edge.

import { test, expect } from "@playwright/test";
import { boxOf, largeText, liveChrome, openLive, skipHints, unionGame } from "../helpers/a11y";
import { finishedGame, fullTime, playPeriod } from "../helpers/finished-game";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });
test.use({ viewport: { width: 390, height: 844 } });

for (const percent of [175, 200]) {
  test(`at ${percent}% text every score chip is on screen and the bar leaves room for the field`, async ({ page }) => {
    const { team, game } = await unionGame({ name: `A11Y-LT-${percent}` });
    await skipHints(page);
    await openLive(page, team.id, game.id);
    await largeText(page, percent);

    const { top, bottom, viewport } = await liveChrome(page);
    // The score bar takes under half the screen (it took 62%).
    expect(bottom.height / viewport.height).toBeLessThanOrEqual(0.45);

    // Every chip, both teams', can be seen and tapped without sideways scroll.
    for (const name of [
      "Record a try for our team",
      "Record a conversion for our team",
      "Record a penalty goal for our team",
      "Record a drop goal for our team",
      "Record opponent try",
      "Record opponent conversion",
      "Record opponent penalty goal",
      "Record opponent drop goal",
    ]) {
      const chip = page.getByRole("button", { name });
      await chip.scrollIntoViewIfNeeded();
      const box = await boxOf(chip);
      expect(box.left, name).toBeGreaterThanOrEqual(0);
      expect(box.right, name).toBeLessThanOrEqual(viewport.width);
      expect(box.bottom, name).toBeLessThanOrEqual(viewport.height + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

    // A kid shows between the bars once the field is scrolled up.
    const field = page.getByRole("region", { name: "On field" });
    await field.evaluate((el, t) => window.scrollBy(0, el.getBoundingClientRect().top - t), top.bottom);
    const after = await liveChrome(page);
    const inView = await page.evaluate(
      ([t, b]) =>
        Array.from(document.querySelectorAll("[data-testid^='league-player-tile-']")).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.height > 0 && r.top >= t - 1 && r.bottom <= b + 1;
        }).length,
      [after.top.bottom, after.bottom.top],
    );
    expect(inView).toBeGreaterThanOrEqual(1);
  });
}

test("at 200% the player sheet's first action is on the first screen", async ({ page }) => {
  const { team, game, lineup } = await unionGame({ name: "A11Y-LT-LOCK" });
  await skipHints(page);
  await openLive(page, team.id, game.id);
  await largeText(page, 200);

  await page.getByTestId(`league-player-tile-${lineup.forwards[0]}`).click({ delay: 600 });
  const sw = page.getByRole("button", { name: /switch player/i });
  await expect(sw).toBeVisible();
  await page.waitForTimeout(300);
  const box = await boxOf(sw);
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom, "Switch player shows as the sheet opens").toBeLessThanOrEqual(844);
  // The sheet uses the phone's width: its buttons are at least 300 px wide.
  expect(box.width).toBeGreaterThanOrEqual(300);
});

test("at 200% break tiles show each kid's whole name, at the larger size", async ({ page }) => {
  const { team, game, players } = await unionGame({
    name: "A11Y-LT-BREAK",
    ended: true,
    names: ["Paddy Murphy", "Isaac Jones", "Leo Nguyen"],
  });
  await skipHints(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^start 2nd half/i })).toBeVisible({ timeout: 15_000 });
  await largeText(page, 200);

  for (const p of players.slice(0, 3)) {
    const tile = page.getByTestId(`player-tile-${p.id}`);
    const name = tile.getByText(p.full_name, { exact: true });
    await name.scrollIntoViewIfNeeded();
    const m = await name.evaluate((el) => ({
      clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
      size: parseFloat(getComputedStyle(el).fontSize),
    }));
    expect(m.clipped, `${p.full_name} is cut off`).toBe(false);
    expect(m.size, `${p.full_name}'s size grows with the text setting`).toBeGreaterThanOrEqual(24);
  }
});

test("at 200% the game page's 'Copy for group chat' stays on screen", async ({ page }) => {
  const { team, game } = await finishedGame("rugby_union", 3, (ids) => [
    ...playPeriod(1, [{ type: "try", player_id: ids[0], metadata: { quarter: 1, elapsed_ms: 60_000 } }]),
    fullTime,
  ]);
  await page.goto(`/teams/${team.id}/games/${game.id}`);
  await waitForHydration(page);
  const copy = page.getByRole("button", { name: /copy for group chat/i });
  await expect(copy).toBeVisible({ timeout: 15_000 });
  await largeText(page, 200);
  await copy.scrollIntoViewIfNeeded();
  const box = await boxOf(copy);
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(390);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
