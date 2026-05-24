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

  test("AFL marketing page links to the iOS app on the App Store", async ({
    page,
  }) => {
    // iOS app launched 2026-05-19 — the hero + final CTA each surface a
    // "Download on the App Store" badge that deep-links to the live
    // listing. Spec pins both that the badge renders AND that it points
    // at the real Apple ID so a future copy-paste typo can't ship a
    // dead link to thousands of marketing visitors.
    await page.goto("/");
    const badges = page.getByRole("link", {
      name: /download siren footy on the app store/i,
    });
    // Hero badge + FinalCTA badge.
    await expect(badges).toHaveCount(2);
    for (const badge of await badges.all()) {
      await expect(badge).toHaveAttribute(
        "href",
        "https://apps.apple.com/au/app/siren-footy/id6768541987"
      );
      await expect(badge).toHaveAttribute("target", "_blank");
      await expect(badge).toHaveAttribute("rel", /noopener/);
    }
  });

  test("hero presents the binary choice — iOS app or web", async ({ page }) => {
    // The hero CTA row is the only fold where the two entry paths sit
    // side-by-side as a deliberate either/or. Pin the contract:
    //   1. The App Store badge is the first CTA.
    //   2. The "Sign in via web" button sits next to it.
    //   3. "Try the demo" is no longer in the hero row (it lives in the
    //      marketing header nav now) — keep an assertion that catches
    //      it sneaking back into the hero by accident, which would break
    //      the binary-choice framing.
    await page.goto("/");
    const heroBadge = page
      .getByRole("link", { name: /download siren footy on the app store/i })
      .first();
    await expect(heroBadge).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^sign in via web$/i })
    ).toBeVisible();
    // Demo CTA only exists in the header nav, not the hero.
    const demoLinks = page.getByRole("link", { name: /^try (the )?demo$/i });
    await expect(demoLinks).toHaveCount(1);
  });

  test("unauthenticated native shell on / redirects to /login", async ({
    context,
    page,
    baseURL,
  }) => {
    // Simulate the iOS/Android Capacitor WebView: NativeCookieBridge
    // sets `siren-native=1` on first launch, and from then on the
    // middleware skips the marketing surface. Setting the cookie
    // directly via the test context pins the second-launch behaviour
    // (zero-flash server redirect) without booting an actual
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
