// Covers the multi-sport demo picker at /demo.
//
//   1. Picker renders 4 cards: AFL, Rugby League, Netball (all
//      clickable), Rugby Union (disabled "Coming soon").
//   2. Clicking an active card POSTs to runDemoGame and redirects to
//      /run/{token} (the public live-game view). Verified by URL
//      assertion + presence of live-game chrome.
//   3. Union card has aria-disabled and doesn't navigate when clicked.
//
// Covers: src/app/demo/page.tsx (DemoPage, DemoSportCard)
//         + src/app/demo/actions.ts (runDemoGame)
//         + src/app/api/admin/seed-demo/route.ts (per-sport seeding)
//
// Doesn't cover: the seed-demo route itself — that has its own auth
// gate via CRON_SECRET and is exercised at deploy time by the Vercel
// cron, not at e2e time. Demo teams are assumed seeded (a test that
// fails because no demo team exists in the test DB is a
// configuration error, not a regression).

import { test, expect } from "@playwright/test";

test.describe("Demo picker", () => {
  test("renders all 4 sport cards with the expected affordances", async ({
    page,
  }) => {
    await page.goto("/demo");

    await expect(
      page.getByRole("heading", { name: /pick a sport/i }),
    ).toBeVisible();

    // The 3 shipped sports render as buttons with explicit aria
    // labels. The button-vs-disabled-div split lives in the
    // DemoSportCard component, so we assert role:button only for
    // the active sports.
    for (const sport of ["afl", "league", "netball"] as const) {
      const card = page.getByTestId(`demo-card-${sport}`);
      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute("aria-label", /start.*demo/i);
    }

    // Union is the coming-soon card — present, but not a button.
    const unionCard = page.getByTestId("demo-card-union");
    await expect(unionCard).toBeVisible();
    await expect(unionCard).toHaveAttribute("aria-disabled", "true");
    await expect(unionCard).toContainText(/coming soon/i);
  });

  // Per-sport happy-path. Each sport card click should:
  //   - POST to runDemoGame
  //   - Server action creates a game + redirects
  //   - Browser lands on /run/{token}
  //
  // Parametrised so adding the 4th sport (when Union ships) is a
  // one-line change.
  for (const sport of ["afl", "league", "netball"] as const) {
    test(`${sport} card starts a demo game and redirects to /run/{token}`, async ({
      page,
    }) => {
      await page.goto("/demo");

      // Click the sport card. The form action runs server-side, then
      // redirects — Playwright follows the redirect automatically.
      await page.getByTestId(`demo-card-${sport}`).click();

      // Wait for the URL to settle on the /run/{token} path. The
      // share token is a random string, so we match on the prefix.
      await page.waitForURL(/\/run\/[a-zA-Z0-9_-]+/, { timeout: 15_000 });

      expect(page.url()).toMatch(/\/run\/[a-zA-Z0-9_-]+/);

      // Smoke-check that the live-game page actually rendered (not
      // an error placeholder). The /run page shows the live-game
      // chrome — opponent name "Demo Opponent" is the most stable
      // tell that the demo game was created with our payload.
      await expect(page.getByText(/demo opponent/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });
  }

  test("union card is non-interactive", async ({ page }) => {
    await page.goto("/demo");

    const unionCard = page.getByTestId("demo-card-union");

    // The Union card is rendered as a <div>, not a <button> — clicks
    // shouldn't navigate. We click anyway and assert the URL stays
    // on /demo to prove disabled-state is real (no event handler
    // sneaking through).
    await unionCard.click();
    await page.waitForTimeout(500); // generous — give any rogue
    // navigation a chance to fire
    expect(page.url()).toMatch(/\/demo\/?$/);
  });
});
