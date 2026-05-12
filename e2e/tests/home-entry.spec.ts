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

  test("unauthenticated native shell on / redirects to /login", async ({
    context,
    page,
    baseURL,
  }) => {
    // Simulate the iOS/Android Capacitor WebView: NativeRouteBridge
    // sets `siren-native=1` on first launch, and from then on the
    // middleware skips the marketing surface. Setting the cookie
    // directly via the test context lets us pin the second-launch
    // behaviour (zero-flash redirect) without booting an actual
    // Capacitor shell.
    const url = new URL(baseURL ?? "http://localhost:3000");
    await context.addCookies([
      {
        name: "siren-native",
        value: "1",
        domain: url.hostname,
        path: "/",
      },
    ]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });
});
