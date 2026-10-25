// ─── Dialogs and sheets hold keyboard focus ─────────────────────────
// UX round 3 (e4, 24 Oct 2026): only the clock menu took focus. With
// the scorer sheet open, Tab walked through eight score buttons behind
// the backdrop; Escape didn't close it; Cancel dropped focus on BODY.
// The long-press sheet and the End H1 confirm did the same.
//
// Every dialog (Modal, SlotFillSheet, ActionSheet) now moves focus in,
// keeps Tab and Shift+Tab inside, closes on Escape and gives focus back
// to the control that opened it.

import { test, expect } from "@playwright/test";
import { focusInDialog, openLive, skipHints, unionGame } from "../helpers/a11y";

test.describe.configure({ mode: "parallel" });

async function tabStaysIn(page: import("@playwright/test").Page, presses: number, key = "Tab") {
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press(key);
    expect(await focusInDialog(page), `${key} ${i + 1} left the dialog`).toBe(true);
  }
}

test("the scorer sheet takes focus, keeps Tab inside, closes on Escape and gives focus back to +T", async ({ page }) => {
  const { team, game } = await unionGame({ name: "A11Y-FOCUS-SHEET" });
  await skipHints(page);
  await openLive(page, team.id, game.id);

  const plusT = page.getByRole("button", { name: "Record a try for our team" });
  await plusT.focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "Who scored?" });
  await expect(sheet).toBeVisible();
  await expect.poll(() => focusInDialog(page), { message: "focus moved into the sheet" }).toBe(true);

  // 15 kids and Cancel: twenty Tabs wrap round, never behind the backdrop.
  await tabStaysIn(page, 20);
  await tabStaysIn(page, 3, "Shift+Tab");

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(plusT).toBeFocused();
  // Escape cancelled: no try was recorded.
  await expect(page.getByTestId("league-points-team")).toHaveText("0");
});

test("the player sheet opened from the keyboard takes focus, traps it and gives it back", async ({ page }) => {
  const { team, game, lineup } = await unionGame({ name: "A11Y-FOCUS-LOCK" });
  await skipHints(page);
  await openLive(page, team.id, game.id);

  const tile = page.getByTestId(`league-player-tile-${lineup.forwards[0]}`);
  await tile.focus();
  await page.keyboard.press("Enter");
  const actions = page.getByRole("button", { name: /^player actions/i });
  await actions.focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: /switch player/i }) });
  await expect(sheet).toBeVisible();
  await expect.poll(() => focusInDialog(page), { message: "focus moved into the player sheet" }).toBe(true);
  await tabStaysIn(page, 12);

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  // Back on the control that opened it (or the tile, if the dock went).
  await expect
    .poll(() =>
      page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a || a === document.body) return "BODY";
        return /^player actions/i.test(a.textContent ?? "") ? "actions" : a.dataset.testid?.startsWith("league-player-tile-") ? "tile" : a.outerHTML.slice(0, 80);
      }),
    )
    .toMatch(/^(actions|tile)$/);
});

test("the End H1 confirm takes focus, traps it, and Escape gives focus back to the clock", async ({ page }) => {
  const { team, game } = await unionGame({ name: "A11Y-FOCUS-END" });
  await skipHints(page);
  await openLive(page, team.id, game.id);

  const clock = page.getByRole("button", { name: /^clock — h1, running$/i });
  await clock.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "H1 clock" })).toBeVisible();
  await expect.poll(() => focusInDialog(page)).toBe(true);
  // The clock menu traps Tab too.
  await tabStaysIn(page, 5);

  await page.getByRole("button", { name: /^end h1 now$/i }).focus();
  await page.keyboard.press("Enter");
  const confirm = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: /^end\s*h\s*1$/i }) });
  await expect(confirm).toBeVisible();
  await expect.poll(() => focusInDialog(page), { message: "focus moved into the confirm" }).toBe(true);
  await tabStaysIn(page, 4);
  await tabStaysIn(page, 2, "Shift+Tab");

  await page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  await expect(clock).toBeFocused();
  // Still in H1: Escape didn't end the half.
  await expect(page.getByRole("button", { name: /^clock — h1, running$/i })).toBeVisible();
});
