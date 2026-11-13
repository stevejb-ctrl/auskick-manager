// ─── Large text (200%) ──────────────────────────────────────────────
// UX round 3 (e4, 24 Oct 2026), union at 390×844 with the root font at
// 200%: the sticky score bar was 525 px (62% of the screen) and no kid
// showed between the bars. Each team's chips couldn't wrap, so both +DG
// chips sat at x = 356–452, off the screen, from about 175%. The
// long-press sheet's first action was at y = 758. Break tiles cut names
// to three letters ("Leo…") while times and codes grew. On the game
// page "Copy for group chat" ran off the right edge.

import { test, expect } from "@playwright/test";
import { boxOf, largeText, netballGame, openLive, skipHints, unionGame } from "../helpers/a11y";
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

    // Live v3 (Phase 8): union is on the shell. The score is the header up
    // top, the chips the bar at the foot (the "Scores" region); only the
    // field between them scrolls.
    const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    const bar = await boxOf(page.getByRole("region", { name: "Scores" }));
    // The score bar takes under half the screen (it took 62%).
    expect(bar.height / viewport.height).toBeLessThanOrEqual(0.45);

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

    // A kid shows in the field, between the header and the bench.
    const field = page.getByTestId("live-field");
    await field.evaluate((el) => el.scrollTo(0, 0));
    const inView = await field.evaluate((el) => {
      const f = el.getBoundingClientRect();
      return Array.from(el.querySelectorAll("[data-testid^='league-player-tile-']")).filter((t) => {
        const r = t.getBoundingClientRect();
        return r.height > 0 && r.top >= f.top - 1 && r.bottom <= f.bottom + 1;
      }).length;
    });
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

// The phone's own 200% text setting (CDP Page.setFontSizes), as the court
// cases above: that's what the layout's `bigtext:` rows follow, so the
// break goes two across. Scaling the page's root font instead left it
// three across, and on CI's Linux fonts "Isaac J" no longer fit (13 Nov
// 2026); no phone shows that layout at 200%.
test("at 200% break tiles show each kid's whole name, at the larger size", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CDP Page.setFontSizes is Chromium-only");
  const { team, game, players } = await unionGame({
    name: "A11Y-LT-BREAK",
    ended: true,
    names: ["Paddy Murphy", "Isaac Jones", "Leo Nguyen"],
  });
  await skipHints(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32, fixed: 26 } });
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^start 2nd half/i })).toBeVisible({ timeout: 15_000 });

  // The tiles carry the squad's short name ("Paddy M"), as in play,
  // since the break draws the field (10 Nov 2026).
  for (const p of players.slice(0, 3)) {
    const tile = page.getByTestId(`player-tile-${p.id}`);
    const [first, last] = p.full_name.split(" ");
    const name = tile.getByText(`${first} ${last[0]}`, { exact: true });
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

// The netball court at large text (Steve, 10 Nov 2026). The court's bibs
// stand a row each, zigzagging down it; at 150–200% each row's one bib
// was squeezed into half the court (FieldLines' two columns for large
// text), so a name like "Charlotte" was cut to a letter or two. Every bib
// stays whole, apart and tappable; the court may grow taller (it
// scrolls), never wider than the phone.
// Two ways text gets large: the root font size (as the specs above), and
// the phone's own text setting (CDP's reader font size, Chromium only),
// which is what the layout's `bigtext:` media query follows.
const COURT_CASES = [
  { label: "150% text", percent: 150, reader: false },
  { label: "200% text", percent: 200, reader: false },
  { label: "the phone's 200% text setting", percent: 200, reader: true },
];
for (const { label, percent, reader } of COURT_CASES) {
  test(`at ${label} the netball court's bibs are apart, tappable and show the kid's name`, async ({ page, browserName }) => {
    test.skip(reader && browserName !== "chromium", "CDP Page.setFontSizes is Chromium-only");
    const { admin, team, game, players } = await netballGame({ name: `A11Y-LT-NB-${percent}` });
    // A long first name, as a real squad has.
    await admin.from("players").update({ full_name: "Charlotte Thompson" }).eq("id", players[2].id);
    await skipHints(page);
    if (reader) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32, fixed: 26 } });
    }
    await openLive(page, team.id, game.id);
    if (!reader) await largeText(page, percent);

    const ids = players.slice(0, 7).map((p) => p.id);
    // One read, so every box is at the same scroll of the court.
    const tiles = await page.getByTestId("live-field").evaluate((field, tileIds) => {
      return tileIds.map((id) => {
        const el = field.querySelector(`[data-testid="player-tile-${id}"]`) as HTMLElement | null;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const name = Array.from(el.querySelectorAll("span")).find((s) => s.classList.contains("truncate"));
        return {
          top: r.top + field.scrollTop,
          bottom: r.bottom + field.scrollTop,
          left: r.left,
          right: r.right,
          width: r.width,
          height: r.height,
          name: name?.textContent ?? "",
          nameCut: name ? name.scrollWidth > name.clientWidth + 1 : true,
        };
      });
    }, ids);
    const viewport = await page.evaluate(() => window.innerWidth);

    expect(tiles.every(Boolean), "every bib is on the court").toBe(true);
    const boxes = tiles.map((t) => t!);
    for (const t of boxes) {
      expect(t.height, `${t.name} is tall enough to tap`).toBeGreaterThanOrEqual(44);
      expect(t.width, `${t.name} is wide enough to tap`).toBeGreaterThanOrEqual(44);
      expect(t.left, `${t.name} is on the screen`).toBeGreaterThanOrEqual(0);
      expect(t.right, `${t.name} is on the screen`).toBeLessThanOrEqual(viewport);
      expect(t.nameCut, `${t.name}'s name is cut`).toBe(false);
    }
    // No two bibs overlap.
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        const apart = a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5;
        expect(apart, `${a.name} and ${b.name} overlap`).toBe(true);
      }
    }
    // Nothing scrolls sideways: the page, the live screen, the court.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport);
    for (const testId of ["live-shell", "live-field"]) {
      const el = await page.getByTestId(testId).evaluate((n) => ({ sw: n.scrollWidth, cw: n.clientWidth }));
      expect(el.sw, `${testId} doesn't scroll sideways`).toBeLessThanOrEqual(el.cw);
    }
  });
}
