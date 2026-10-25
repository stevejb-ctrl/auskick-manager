// ─── A focused control is never under a sticky bar (WCAG 2.4.11) ────
// UX round 3 (e4, 24 Oct 2026): scrolling a focused control into view
// ignored the fixed score bar and the sticky footers. Tabbing through
// union's field put HB9 … FB15 and the bench at y = 558–844 while the
// score bar covered from y = 518: the focused tile was wholly hidden.
// Netball's lineup put GD and GK under the Start Q1 footer, and union's
// break put a bench kid under Start 2nd half.
//
// The bars' heights are the page's scroll padding, so focus scrolls
// the control clear of them.

import { test, expect, type Locator, type Page } from "@playwright/test";
import { barOf, boxOf, netballGame, openLive, skipHints, unionGame } from "../helpers/a11y";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });
test.use({ viewport: { width: 390, height: 844 } });

/** Focus it as the keyboard would (scrolling it into view), then where is it against the bars? */
async function focusedClear(page: Page, target: Locator, top: Locator, bottom: Locator) {
  await target.focus();
  await expect(target).toBeFocused();
  // Smooth scrolling, if any, has landed.
  await page.waitForTimeout(150);
  const [t, b, box] = [await barOf(top), await barOf(bottom), await boxOf(target)];
  return { clearOfTop: box.top >= t.bottom - 1, clearOfBottom: box.bottom <= b.top + 1, box, top: t.bottom, bottom: b.top };
}

test("live: every field and bench tile, focused, shows between the top bar and the score bar", async ({ page }) => {
  const { team, game, lineup } = await unionGame({ name: "A11Y-FNO-LIVE" });
  await skipHints(page);
  await openLive(page, team.id, game.id);
  const exit = page.getByRole("button", { name: "Exit live game" });
  const clock = page.getByRole("button", { name: /^clock — /i });

  // Down the field and onto the bench, then back up.
  const ids = [...lineup.forwards, ...lineup.backs, ...lineup.bench];
  for (const id of [...ids, ...ids.slice().reverse()]) {
    const r = await focusedClear(page, page.getByTestId(`league-player-tile-${id}`), exit, clock);
    expect(r.clearOfBottom, `tile ${ids.indexOf(id) + 1} (bottom ${r.box.bottom}) under the score bar (top ${r.bottom})`).toBe(true);
    expect(r.clearOfTop, `tile ${ids.indexOf(id) + 1} (top ${r.box.top}) under the top bar (bottom ${r.top})`).toBe(true);
  }
});

test("lineup: netball's GD and GK, focused, sit above the Start Q1 footer", async ({ page }) => {
  const { team, game } = await netballGame({ name: "A11Y-FNO-NB", seed: false });
  await skipHints(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const start = page.getByRole("button", { name: /^start q1$/i });
  await expect(start).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const pos of [/(^|, )goal defence(,|$)/i, /(^|, )goal keeper(,|$)/i]) {
    const r = await focusedClear(page, page.getByRole("button", { name: pos }).first(), start, start);
    expect(r.clearOfBottom, `${pos} (bottom ${r.box.bottom}) under the footer (top ${r.bottom})`).toBe(true);
  }
});

test("break: the last bench kid, focused, sits above the Start footer", async ({ page }) => {
  const { team, game, lineup } = await unionGame({ name: "A11Y-FNO-BREAK", ended: true });
  await skipHints(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const start = page.getByRole("button", { name: /^start 2nd half/i });
  await expect(start).toBeVisible({ timeout: 15_000 });
  const exit = page.getByRole("button", { name: "Exit live game" });
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const id of [lineup.bench[lineup.bench.length - 1], lineup.forwards[0]]) {
    const r = await focusedClear(page, page.getByTestId(`player-tile-${id}`), exit, start);
    expect(r.clearOfBottom, `bottom ${r.box.bottom} under the footer (top ${r.bottom})`).toBe(true);
    expect(r.clearOfTop, `top ${r.box.top} under the top bar (bottom ${r.top})`).toBe(true);
  }
});
