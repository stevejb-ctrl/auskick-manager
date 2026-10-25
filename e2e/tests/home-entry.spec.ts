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

  test("the homepage lists all ten sports in popularity order, each a link to its page", async ({ page }) => {
    // The front door for ten sports (design canvas, 22 Oct 2026): no
    // carousel, no picker that re-skins the page, no Beta labels.
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Run game day. Keep your head up." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ten sports. Each one by its own rules." })).toBeVisible();

    const order = ["netball", "afl", "league", "football", "basketball", "union", "touch", "oztag", "hockey", "futsal"];
    const tiles = page.locator('[data-testid^="sport-tile-"]');
    await expect(tiles).toHaveCount(10);
    expect(await tiles.evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))).toEqual(
      order.map((id) => `sport-tile-${id}`),
    );
    const chips = page.getByRole("navigation", { name: "I coach" }).getByRole("link");
    await expect(chips).toHaveCount(10);
    await expect(chips.first()).toHaveText("Netball");
    await expect(page.locator("main")).not.toContainText(/\bbeta\b/i);

    // Each tile says one thing Siren knows about that sport's rules.
    await expect(page.getByTestId("sport-tile-oztag")).toContainText("a girl's try counts two");
    await page.getByTestId("sport-tile-touch").click();
    await expect(page).toHaveURL(/\/touch-football$/);
    await expect(page.getByRole("heading", { level: 1, name: "Mixed teams, kept legal." })).toBeVisible();
  });

  test("the homepage's six features each name the sport they show", async ({ page }) => {
    await page.goto("/");
    const features = page.locator("#features li");
    await expect(features).toHaveCount(6);
    for (const shown of ["Shown in AFL", "Shown in football (soccer)", "Shown in basketball", "Shown in rugby league", "Every sport", "Shown in netball"]) {
      await expect(page.locator("#features")).toContainText(shown);
    }
  });

  test("the marketing pages only claim features the app has", async ({ request }) => {
    // The breaks show a rule check, not a fairness number, and PlayHQ
    // import brings fixtures, not results (copy audit, 21 Oct 2026). The
    // AFL page carries AFL's feature tour, which said both once.
    for (const path of ["/", "/afl"]) {
      const html = await (await request.get(path)).text();
      expect(html, path).not.toMatch(/fairness score/i);
      expect(html, path).not.toMatch(/results synced|results stay in sync/i);
    }
    expect(await (await request.get("/afl")).text()).toContain("Rule check updates as you swap players");
  });

  test("unauthenticated GET / renders the marketing hero", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    // The hero's web sign-in is the most stable marketing-shell signal.
    // (On a phone the header has no room for its own Sign in; Start
    // free goes to the same page.)
    await expect(page.getByRole("link", { name: /^sign in via web$/i })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "Start free" })).toBeVisible();
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
