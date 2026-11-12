// ─── Login at 320 px with 200% text ─────────────────────────────────
// Accessibility follow-up to UX round 3's R6 (25 Oct 2026). At 320×568
// with the root font at 200% the login form ran off the screen: the
// mobile band's caption, the "Sign in with password instead" / "Trouble
// signing in?" row and the footer's links couldn't wrap, so the page
// scrolled sideways and some controls sat past the right edge. Both of
// the form's states (the sign-in link, the password) now fit.

import { test, expect, type Page } from "@playwright/test";
import { boxOf, largeText } from "../helpers/a11y";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });
test.use({ viewport: { width: 320, height: 568 }, storageState: { cookies: [], origins: [] } });

const WIDTH = 320;

/** Every control on the page is on screen sideways, uncovered and uncut. */
async function expectAllReachable(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth), "no sideways scroll").toBeLessThanOrEqual(WIDTH);
  const controls = page.locator("a:visible, button:visible, input:visible");
  const n = await controls.count();
  expect(n).toBeGreaterThan(5);
  for (let i = 0; i < n; i++) {
    const c = controls.nth(i);
    const label = (await c.getAttribute("aria-label")) ?? (await c.textContent())?.trim() ?? `control ${i}`;
    await c.scrollIntoViewIfNeeded();
    const box = await boxOf(c);
    expect(box.left, `${label} starts on screen`).toBeGreaterThanOrEqual(0);
    expect(box.right, `${label} ends on screen`).toBeLessThanOrEqual(WIDTH);
    // Its words aren't cut off inside it…
    const cut = await c.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(cut, `${label}'s text is cut off`).toBeLessThanOrEqual(1);
    // …and nothing sits on top of it: its centre is its own.
    const own = await c.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (hit === el || el.contains(hit) || (el as HTMLElement).closest("label")?.contains(hit) === true);
    });
    expect(own, `${label} is covered`).toBe(true);
  }
}

for (const state of ["sign-in link", "password"] as const) {
  test(`at 320 px and 200% text the ${state} form fits and every control is reachable`, async ({ page }) => {
    await page.goto("/login");
    await waitForHydration(page);
    await expect(page.getByTestId("login-email")).toBeVisible({ timeout: 15_000 });
    if (state === "password") {
      await page.getByTestId("login-mode-toggle").click();
      await expect(page.getByTestId("login-password")).toBeVisible();
    }
    await largeText(page, 200);
    await expectAllReachable(page);
  });
}
