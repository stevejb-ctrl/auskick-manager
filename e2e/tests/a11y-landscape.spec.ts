// ─── A phone held sideways (844×390) ────────────────────────────────
// UX round 3 (e4, 24 Oct 2026): landscape was the portrait layout
// stretched. The top bar and score bar took 205–232 of 390 px, so one
// row of 3 of union's 15 kids showed. "Make this swap" sat 16 px under
// the score bar, the long-press sheet's first action started at
// y = 340, and the lineup and break footers (119–125 px) left no
// players above the fold.
//
// Short viewports get compact bars: the score chips sit beside each
// team's score in one row, the footers fold to one row, and the player
// sheet puts its actions before the stats.

import { test, expect, type Page } from "@playwright/test";
import { barOf, boxOf, liveChrome, openLive, skipHints, unionGame } from "../helpers/a11y";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });
test.use({ viewport: { width: 844, height: 390 } });

/** Field tiles wholly between the two bars. */
async function tilesInView(page: Page, top: number, bottom: number): Promise<number> {
  return page.evaluate(
    ([t, b]) =>
      Array.from(document.querySelectorAll("[data-testid^='league-player-tile-']")).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.top >= t - 1 && r.bottom <= b + 1;
      }).length,
    [top, bottom],
  );
}

test("the live bars leave the field room: two rows of kids show between them", async ({ page }) => {
  const { team, game } = await unionGame({ name: "A11Y-LAND-LIVE" });
  await skipHints(page);
  await openLive(page, team.id, game.id);

  const { top, bottom, viewport } = await liveChrome(page);
  // The bars together take at most 40% of the height (they took 53%).
  expect(top.height + bottom.height).toBeLessThanOrEqual(viewport.height * 0.4);
  // Every score chip is in the bar and on screen.
  for (const name of ["Record a try for our team", "Record opponent try", "Record a drop goal for our team", "Record opponent drop goal"]) {
    const chip = await boxOf(page.getByRole("button", { name }));
    expect(chip.top, name).toBeGreaterThanOrEqual(bottom.top - 1);
    expect(chip.bottom, name).toBeLessThanOrEqual(viewport.height + 1);
    expect(chip.right, name).toBeLessThanOrEqual(viewport.width);
  }

  // Scroll the field up under the top bar: two rows (six kids) show.
  const field = page.getByRole("region", { name: "On field" });
  await field.evaluate((el, t) => window.scrollBy(0, el.getBoundingClientRect().top - t), top.bottom);
  const after = await liveChrome(page);
  expect(await tilesInView(page, after.top.bottom, after.bottom.top)).toBeGreaterThanOrEqual(6);
});

test("with a sub due, 'Make the swap' sits clear of the score bar", async ({ page }) => {
  // 16 here, 15 on: one on the bench (one pair, "Make this swap"), due two
  // minutes in, after a try, so the undo strip is in the bar too: as the
  // e4 run had it, a 183 px bar over "Make this swap".
  const { team, game } = await unionGame({
    name: "A11Y-LAND-SUB",
    available: 16,
    subIntervalSec: 120,
    elapsedSec: 130,
    rows: (ids) => [{ type: "try", player_id: ids[0], metadata: { quarter: 1, elapsed_ms: 60_000 } }],
  });
  await skipHints(page);
  await openLive(page, team.id, game.id);

  const make = page.getByRole("button", { name: /^make this swap$/i });
  await expect(make).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const { top, bottom } = await liveChrome(page);
  const box = await boxOf(make);
  expect(box.top, "below the top bar").toBeGreaterThanOrEqual(top.bottom - 1);
  expect(box.bottom, "above the score bar").toBeLessThanOrEqual(bottom.top + 1);
});

test("the player sheet's first action shows without scrolling the sheet", async ({ page }) => {
  const { team, game, lineup } = await unionGame({ name: "A11Y-LAND-LOCK" });
  await skipHints(page);
  await openLive(page, team.id, game.id);

  await page.getByTestId(`league-player-tile-${lineup.forwards[0]}`).click({ delay: 600 });
  const sw = page.getByRole("button", { name: /switch player/i });
  await expect(sw).toBeVisible();
  await page.waitForTimeout(300);
  const box = await boxOf(sw);
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom, "Switch player is on screen as the sheet opens").toBeLessThanOrEqual(390);
});

test("the break's Start footer is one compact row", async ({ page }) => {
  const { team, game } = await unionGame({ name: "A11Y-LAND-BREAK", ended: true });
  await skipHints(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const start = page.getByRole("button", { name: /^start 2nd half/i });
  await expect(start).toBeVisible({ timeout: 15_000 });
  const footer = await barOf(start);
  expect(footer.height, "footer height").toBeLessThanOrEqual(76);
  expect((await boxOf(start)).height).toBeGreaterThanOrEqual(44);
});

test("the lineup's footer is one compact row", async ({ page }) => {
  const { team, game } = await unionGame({ name: "A11Y-LAND-LINEUP", seed: false });
  await skipHints(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const start = page.getByRole("button", { name: /^start h1$/i });
  await expect(start).toBeVisible({ timeout: 15_000 });
  const footer = await barOf(start);
  expect(footer.height, "footer height").toBeLessThanOrEqual(76);
  expect((await boxOf(start)).height).toBeGreaterThanOrEqual(44);
  // Save plan & exit is still there, inside the footer.
  const save = await boxOf(page.getByRole("button", { name: /save plan & exit/i }));
  expect(save.top).toBeGreaterThanOrEqual(footer.top);
  expect(save.bottom).toBeLessThanOrEqual(footer.bottom);
});
