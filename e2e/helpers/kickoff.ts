// AFL's kickoff on live v3 (Phase 5, B4): the lineup picker's Ready sets
// the lineup, the live screen opens before the first siren, and its bar's
// Start Q1 asks "Start Q1 now" before the clock runs. It used to be one
// screen: the picker's "Start Q1", then the confirm.

import { expect, type Page } from "@playwright/test";

/** The AFL picker's Ready: sets the lineup and opens the live screen, Q1 not started. */
export async function readyAfl(page: Page, timeout = 15_000): Promise<void> {
  await page.getByRole("button", { name: /^ready$/i }).click({ timeout });
  await expect(page.getByRole("button", { name: /^clock — q1, not started$/i })).toBeVisible({ timeout });
}

/** From the live screen before kickoff: Start Q1, then "Start Q1 now". */
export async function startQ1(page: Page, timeout = 15_000): Promise<void> {
  await page.getByRole("button", { name: /^start q1$/i }).click({ timeout });
  await page.getByRole("button", { name: /^start q1 now$/i }).click({ timeout: 10_000 });
}

/** The picker's Ready, then Start Q1 on the live screen: the clock runs. */
export async function kickOffAfl(page: Page, timeout = 15_000): Promise<void> {
  await readyAfl(page, timeout);
  await startQ1(page, timeout);
  await expect(page.getByRole("button", { name: /^clock — q1, running$/i })).toBeVisible({ timeout });
}

// Netball's kickoff on live v3 (Phase 7), as AFL's: the picker's Ready
// sets the lineup, the live screen opens before the first whistle, and
// its bar's Start Q1 asks "Start Q1 now" before the clock runs.

/** The netball picker's Ready: sets the lineup and opens the live screen, Q1 not started. */
export async function readyNetball(page: Page, timeout = 15_000): Promise<void> {
  await readyAfl(page, timeout);
}

/** The netball picker's Ready, then Start Q1 on the live screen: the clock runs. */
export async function kickOffNetball(page: Page, timeout = 15_000): Promise<void> {
  await kickOffAfl(page, timeout);
}

// Rugby's kickoff on live v3 (Phase 8), the same way: the league / union
// picker's Ready sets the lineup (and the vest plan), the live screen
// opens before the whistle, and its bar's Start H1 (Q1 for the youngest)
// asks "Start H1 now".

/** A rugby picker's Ready: the live screen, the first period not started. */
export async function readyRugby(page: Page, tag = "H1", timeout = 15_000): Promise<void> {
  await page.getByRole("button", { name: /^ready$/i }).click({ timeout });
  await expect(page.getByRole("button", { name: new RegExp(`^clock — ${tag}, not started$`, "i") })).toBeVisible({ timeout });
}

/** From rugby's live screen before the whistle: Start H1, then "Start H1 now". */
export async function startRugbyFirst(page: Page, tag = "H1", timeout = 15_000): Promise<void> {
  await page.getByRole("button", { name: new RegExp(`^start ${tag}$`, "i") }).click({ timeout });
  await page.getByRole("button", { name: new RegExp(`^start ${tag} now$`, "i") }).click({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: new RegExp(`^clock — ${tag}, running$`, "i") })).toBeVisible({ timeout });
}

// Basketball's and the touch family's kickoff on live v3 (Phase 10), the
// same way: the picker's Ready sets the lineup, the live screen opens
// before the tip-off (or the tap), and its bar's Start H1 (Q1 for a
// quarters team, P1 for one period) asks "Start H1 now".

/** The basketball / touch / Oztag picker's Ready: the live screen, the first period not started. */
export async function readyShell(page: Page, tag = "H1", timeout = 15_000): Promise<void> {
  await readyRugby(page, tag, timeout);
}

/** From the live screen before the start: Start H1, then "Start H1 now"; the clock runs. */
export async function startShellFirst(page: Page, tag = "H1", timeout = 15_000): Promise<void> {
  await startRugbyFirst(page, tag, timeout);
}

/** The picker's Ready, then Start H1 on the live screen. */
export async function kickOffShell(page: Page, tag = "H1", timeout = 15_000): Promise<void> {
  await readyShell(page, tag, timeout);
  await startShellFirst(page, tag, timeout);
}
