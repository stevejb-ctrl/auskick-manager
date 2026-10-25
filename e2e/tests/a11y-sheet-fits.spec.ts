// ─── A sheet never runs off the screen ──────────────────────────────
// UX round 3 (e4, 24 Oct 2026): SlotFillSheet had a fixed max-h-72 list
// and no height cap, centred in a fixed overlay. On a phone held
// sideways (844×390) union's "Who scored?" sheet was 418 px tall: its
// eyebrow sat above the screen and Cancel 15 px below it. At 200% text
// in portrait the heading was at y = -41. Every sport's scorer and sub
// pickers use this sheet.
//
// The sheet is capped to the viewport and its list scrolls, so the
// heading and Cancel always show.

import { test, expect } from "@playwright/test";
import { boxOf, largeText, openLive, skipHints, unionGame } from "../helpers/a11y";

test.describe.configure({ mode: "parallel" });

const CASES = [
  { label: "a phone held sideways (844×390)", viewport: { width: 844, height: 390 }, text: 100 },
  { label: "portrait at 200% text", viewport: { width: 390, height: 844 }, text: 200 },
];

for (const c of CASES) {
  test(`the scorer sheet fits the screen: ${c.label}`, async ({ page }) => {
    await page.setViewportSize(c.viewport);
    const { team, game } = await unionGame({ name: "A11Y-SHEET" });
    await skipHints(page);
    await openLive(page, team.id, game.id);
    if (c.text !== 100) await largeText(page, c.text);

    await page.getByRole("button", { name: "Record a try for our team" }).click();
    const sheet = page.getByRole("dialog", { name: "Who scored?" });
    await expect(sheet).toBeVisible();
    // The entrance animation has landed.
    await page.waitForTimeout(400);
    const height = c.viewport.height;

    const heading = await boxOf(sheet.getByRole("heading", { name: "Who scored?" }));
    expect(heading.top, "the heading is on screen").toBeGreaterThanOrEqual(0);
    const cancel = await boxOf(sheet.getByRole("button", { name: "Cancel" }));
    expect(cancel.bottom, "Cancel is on screen").toBeLessThanOrEqual(height);
    expect(cancel.top).toBeGreaterThanOrEqual(0);

    // The list scrolls inside the sheet to its last kid, who then shows
    // between the heading and Cancel.
    const last = sheet.getByRole("listitem").last().getByRole("button");
    await last.scrollIntoViewIfNeeded();
    const lastBox = await boxOf(last);
    expect(lastBox.top).toBeGreaterThanOrEqual(heading.bottom - 1);
    expect(lastBox.bottom).toBeLessThanOrEqual(cancel.top + 1);
    // And the heading didn't scroll away to get there.
    expect((await boxOf(sheet.getByRole("heading", { name: "Who scored?" }))).top).toBeGreaterThanOrEqual(0);
  });
}
