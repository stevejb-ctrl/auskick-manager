// Authenticated users should NEVER see the marketing site — the app
// should feel like a native app, not "marketing page with the app
// overlaid". This spec pins the entry-routing contract: GET / with a
// Supabase session redirects server-side to /dashboard before any
// marketing content renders.

import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "parallel" });

test("authenticated GET / redirects to /dashboard", async ({ page }) => {
  // Default storageState in the chromium project is the super-admin
  // session — that's all we need; any signed-in user should redirect.
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test.describe("unauthenticated entry", () => {
  // Clear storageState so this case actually hits the marketing path.
  // Without the override we'd inherit the super-admin session from the
  // chromium project and never exercise the unauth branch.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("unauthenticated GET / renders the marketing hero", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    // MarketingHeader renders the Siren wordmark + a Sign in link.
    // Asserting on the Sign in CTA is the most stable marketing-shell
    // signal — copy on the hero shifts between brand variants.
    await expect(
      page.getByRole("link", { name: /sign in/i }).first()
    ).toBeVisible();
  });
});
