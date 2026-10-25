// ─── Focus rings, named kick buttons, and dark mode ─────────────────
// UX round 3 (e4, 24 Oct 2026), the P3s:
//   - Every live control fell back to the browser's 1 px auto ring,
//     which vanished on the near-black clock pill and the dark sub card.
//   - Union's "Record conversion" dialog had 15 rows of buttons named
//     just "Made" and "Missed": 30 a screen reader couldn't tell apart.
//   - No dark theme and no color-scheme, so Chrome's auto-dark and
//     Samsung Internet inverted the page and the dark sub card and
//     clock pill lost their emphasis. Siren opts out: it's a light app
//     (a real dark theme is a design job of its own).

import { test, expect } from "@playwright/test";
import { contrast, openLive, skipHints, unionGame } from "../helpers/a11y";

test.describe.configure({ mode: "parallel" });

test("a focused control gets a solid ring that reads on white and on the dark clock pill", async ({ page }) => {
  const { team, game } = await unionGame({ name: "A11Y-P3-RING" });
  await skipHints(page);
  await openLive(page, team.id, game.id);

  const clock = page.getByRole("button", { name: /^clock — h1/i });
  await clock.focus();
  // As the keyboard would: away and back with Tab.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  if (!(await clock.evaluate((el) => el === document.activeElement))) await clock.focus();
  const ring = await clock.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      focusVisible: el.matches(":focus-visible"),
      style: s.outlineStyle,
      width: parseFloat(s.outlineWidth),
      offset: parseFloat(s.outlineOffset),
      color: s.outlineColor.match(/\d+/g)!.slice(0, 3).map(Number) as [number, number, number],
    };
  });
  expect(ring.focusVisible).toBe(true);
  expect(ring.style).toBe("solid");
  expect(ring.width).toBeGreaterThanOrEqual(2);
  expect(ring.offset).toBeGreaterThanOrEqual(2);
  // One ring colour that reads (3:1) on the white bar and on the near-black pill and sub card.
  expect(contrast(ring.color, [255, 255, 255]), "ring on white").toBeGreaterThanOrEqual(3);
  expect(contrast(ring.color, [26, 30, 26]), "ring on ink").toBeGreaterThanOrEqual(3);
});

test("after a try, each kicker's Made and Missed say whose kick it is", async ({ page }) => {
  const { team, game, players, lineup } = await unionGame({ name: "A11Y-P3-KICK" });
  await skipHints(page);
  await openLive(page, team.id, game.id);
  const name = (id: string) => players.find((p) => p.id === id)!.full_name;

  await page.getByRole("button", { name: "Record a try for our team" }).click();
  await page.getByRole("dialog", { name: "Who scored?" }).getByRole("button", { name: new RegExp(`^${name(lineup.backs[0])}`) }).click();
  // The conversion follows the try.
  const conversion = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: /^made/i }) });
  await expect(conversion).toBeVisible({ timeout: 10_000 });
  const kicker = name(lineup.backs[1]);
  await expect(conversion.getByRole("button", { name: `Made, ${kicker}`, exact: true })).toBeVisible();
  await expect(conversion.getByRole("button", { name: `Missed, ${kicker}`, exact: true })).toBeVisible();
  // No two buttons share a name.
  const names = await conversion.getByRole("button", { name: /^(made|missed)/i }).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? el.textContent));
  expect(new Set(names).size).toBe(names.length);
});

test("Siren declares itself light-only, so forced dark modes leave it alone", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const { team, game } = await unionGame({ name: "A11Y-P3-DARK" });
  await skipHints(page);
  await openLive(page, team.id, game.id);
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "only light");
  // Chromium serialises it "light only".
  const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  expect(scheme.split(" ").sort()).toEqual(["light", "only"]);
  // Still the light page under a dark system setting.
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(247, 245, 241)");
});
