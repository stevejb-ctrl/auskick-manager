// ─── Radio groups: one Tab stop, arrow keys move and select ─────────
// Accessibility follow-up to UX round 3's R6 (25 Oct 2026). The
// segmented controls and choice cards that act as radio groups only
// moved with Tab, one stop per option, and the setup wizard's sports
// were a row of pressed buttons. They now follow the WAI-ARIA radio
// group (one shared hook, useRadioGroup): the group is a single Tab
// stop, the arrow keys move and select, Home and End jump to the ends.

import { test, expect, type Locator, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";
import { ownerOf, skipHints, unionGame } from "../helpers/a11y";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

async function tabStops(group: Locator): Promise<number> {
  return group.getByRole("radio").evaluateAll((els) => els.filter((el) => (el as HTMLElement).tabIndex >= 0).length);
}

async function expectChecked(page: Page, radio: Locator) {
  await expect(radio).toHaveAttribute("aria-checked", "true");
  await expect(radio).toBeFocused();
}

/** The radio-group keyboard on `group`, from its checked radio. */
async function expectRadioKeys(page: Page, group: Locator) {
  const radios = group.getByRole("radio");
  const n = await radios.count();
  expect(n).toBeGreaterThan(1);
  expect(await tabStops(group), "the group is one Tab stop").toBe(1);

  const start = await radios.evaluateAll((els) => Math.max(0, els.findIndex((el) => el.getAttribute("aria-checked") === "true")));
  await radios.nth(start).focus();
  await page.keyboard.press("ArrowRight");
  await expectChecked(page, radios.nth((start + 1) % n));
  await page.keyboard.press("ArrowLeft");
  await expectChecked(page, radios.nth(start));
  await page.keyboard.press("End");
  await expectChecked(page, radios.nth(n - 1));
  await page.keyboard.press("ArrowDown");
  await expectChecked(page, radios.nth(0));
  await page.keyboard.press("ArrowUp");
  await expectChecked(page, radios.nth(n - 1));
  await page.keyboard.press("Home");
  await expectChecked(page, radios.nth(0));
  // Still one Tab stop: the newly checked radio.
  expect(await tabStops(group)).toBe(1);
}

test("the break's Suggested / Rotate / Repeat / Manual", async ({ page }) => {
  const { team, game } = await unionGame({ name: "A11Y-RK-BRK", ended: true });
  await skipHints(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^start 2nd half/i })).toBeVisible({ timeout: 15_000 });
  await expectRadioKeys(page, page.getByRole("radiogroup", { name: "How the next lineup is built" }));
});

test("the Team tab's How kids rotate and Season balance", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U12", sport: "afl", name: `A11Y-RK-SET ${Date.now() % 100000}` });
  await page.goto(`/teams/${team.id}/settings`);
  await waitForHydration(page);
  const rotate = page.getByRole("radiogroup", { name: "How kids rotate" });
  await expect(rotate).toBeVisible({ timeout: 15_000 });
  await expectRadioKeys(page, rotate);
  await expectRadioKeys(page, page.getByRole("radiogroup", { name: "Season balance" }));
});

test("the setup wizard's sports are a radio group", async ({ page }) => {
  await page.goto("/teams/new");
  await waitForHydration(page);
  const sports = page.getByRole("radiogroup", { name: "Sport" });
  await expect(sports).toBeVisible({ timeout: 15_000 });
  await expect(sports.getByRole("radio", { name: "Junior AFL" })).toBeVisible();
  await expectRadioKeys(page, sports);
});
