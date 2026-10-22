// Helpers for the period break screen (src/components/quarter-break/
// PeriodBreak.tsx), the same in every sport: the status chip opens the
// Game settings sheet (lend, injured, arrived, mark out, players on the
// field), the strategy picker sits on the screen itself.

import { expect, type Page } from "@playwright/test";

export type BreakStrategyName = "Suggested" | "Rotate" | "Repeat" | "Manual";

const settingsDialog = (page: Page) => page.getByRole("dialog", { name: "Game settings" });

/** Open the Game settings sheet (the status chip), if it isn't open. */
export async function openGameSettings(page: Page): Promise<void> {
  const dialog = settingsDialog(page);
  if (!(await dialog.isVisible())) {
    await page.getByRole("button", { name: /^game settings:/i }).click();
  }
  await expect(dialog).toBeVisible();
}

/** Close the Game settings sheet (Done), if it's open. */
export async function closeGameSettings(page: Page): Promise<void> {
  const dialog = settingsDialog(page);
  if (await dialog.isVisible()) await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
}

/** Pick how the next lineup starts: Suggested / Rotate / Repeat / Manual. */
export async function pickBreakStrategy(page: Page, name: BreakStrategyName): Promise<void> {
  await closeGameSettings(page);
  await page.getByRole("radiogroup", { name: "How the next lineup is built" }).getByRole("radio", { name }).click();
}

/**
 * Start the next period from the break: the footer's Start, then the
 * confirm sheet's "now" (or "Start anyway" when a rule is broken).
 */
export async function startFromBreak(page: Page, periodName: RegExp): Promise<void> {
  await closeGameSettings(page);
  await page.getByRole("button", { name: periodName }).click();
  const anyway = page.getByRole("button", { name: "Start anyway" });
  const now = page.getByRole("button", { name: /^start .+ now$/i });
  await expect(anyway.or(now)).toBeVisible();
  await ((await anyway.isVisible()) ? anyway : now).click();
}
