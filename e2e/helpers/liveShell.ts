// AFL's live v3 shell (Phase 5): Scores and fixes opens from the score
// itself (either side of the header), and everything else that isn't
// scoring or subbing is in the ⋯ game menu.

import { expect, type Locator, type Page } from "@playwright/test";

/** Tap the score in the header: the Scores and fixes sheet. */
export async function openScoresFromHeader(page: Page, timeout = 15_000): Promise<Locator> {
  await page.getByRole("button", { name: /^Scores and fixes\./ }).first().click({ timeout });
  const sheet = page.getByRole("dialog", { name: "Scores and fixes" });
  await expect(sheet).toBeVisible({ timeout });
  return sheet;
}

/** ⋯ in the top bar: the game menu sheet. */
export async function openGameMenu(page: Page, timeout = 15_000): Promise<Locator> {
  await page.getByRole("button", { name: "Game menu" }).click({ timeout });
  const menu = page.getByRole("dialog", { name: "Game menu" });
  await expect(menu).toBeVisible({ timeout });
  return menu;
}

/** The sub-due alert (the info line, live v3 Phase 6). */
export function subDueAlert(page: Page): Locator {
  return page.getByRole("alert").filter({ hasText: /sub due/i });
}

/** Tap the info line ("Next sub 2:10 · 3 swaps ›"): the pairs sheet. */
export async function openPairs(page: Page, timeout = 15_000): Promise<Locator> {
  await page.getByTestId("info-line").click({ timeout });
  const sheet = page.getByRole("dialog").filter({ has: page.getByTestId("swapcard-apply-all") });
  await expect(sheet).toBeVisible({ timeout });
  return sheet;
}
