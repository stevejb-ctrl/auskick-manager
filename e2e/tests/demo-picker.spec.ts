// Covers the multi-sport demo picker at /demo.
//
//   1. Picker renders a card for each of the ten sports, all
//      clickable.
//   2. Clicking a card POSTs to runDemoGame and redirects to
//      /run/{token} (the public live-game view). Verified by URL
//      assertion + presence of live-game chrome.
//
// Covers: src/app/(marketing)/demo/page.tsx (DemoPage, DemoSportCard)
//         + src/app/(marketing)/demo/actions.ts (runDemoGame)
//         + src/app/api/admin/seed-demo/route.ts (per-sport seeding)
//
// Test-DB setup:
//   The picker's server action looks up an is_demo=true team per
//   sport and refuses if none exists. `npm run db:reset` doesn't
//   seed those teams, so a fresh test DB has no demo teams. The
//   beforeAll below (e2e/helpers/demo.ts) idempotently creates one team per sport (with
//   a minimal roster) and a super-admin to own them, so the spec
//   works against any clean DB.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { DEMO_CARDS, ensureDemoTeams } from "../helpers/demo";

test.describe("Demo picker", () => {
  // The demo teams the picker's server action needs (e2e/helpers/demo.ts).
  test.beforeAll(ensureDemoTeams);

  test("renders all 10 sport cards with the expected affordances", async ({
    page,
  }) => {
    await page.goto("/demo");

    await expect(
      page.getByRole("heading", { name: /pick a sport/i }),
    ).toBeVisible();

    // Live v3 (11 Nov 2026): the picker opens on the site's grass band,
    // as the homepage and the sport pages do.
    const band = page.locator("main section[data-surface]").first();
    await expect(band).toHaveAttribute("data-surface", "field");
    await expect(band).toHaveCSS("background-color", "rgb(15, 76, 43)");

    await expect(page.locator('[data-testid^="demo-card-"]')).toHaveCount(10);
    for (const [id, sport] of DEMO_CARDS) {
      const card = page.getByTestId(`demo-card-${id}`);
      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute("aria-label", /start.*demo/i);
      await expect(card).not.toContainText(/coming soon/i);
      // Each card carries its own sport's field drawing.
      await expect(card.locator(`svg[data-sport-field="${sport}"]`)).toHaveCount(1);
    }
    // No sport is in beta any more (src/lib/siren-facts.ts).
    await expect(page.getByTestId("demo-card-football")).not.toContainText(/beta/i);
  });

  for (const [id, sport] of DEMO_CARDS) {
    test(`${id} card starts a demo game and redirects to /run/{token}`, async ({
      page,
    }) => {
      await page.goto("/demo");

      await page.getByTestId(`demo-card-${id}`).click();

      await page.waitForURL(/\/run\/[a-zA-Z0-9_-]+/, { timeout: 15_000 });

      expect(page.url()).toMatch(/\/run\/[a-zA-Z0-9_-]+/);

      // Smoke-check that the public run page actually rendered. The
      // demo game lands PRE-KICKOFF (runDemoGame seeds no lineup_set
      // event), and the test rosters are only 4 players — fewer than
      // any sport's required positions — so all three sports render
      // the availability/welcome path, not the live game. The opponent
      // name ("Demo Opponent") is only surfaced on AFL's pre-kickoff
      // header (GameInfoHeader); netball/league don't show it until
      // kickoff, so it's a poor cross-sport marker.
      // RunnerWelcomeBanner ("You're running today's game for …") is
      // the universal smoke check — it renders on the pre-kickoff
      // screen for every sport.
      await expect(
        page.getByText(/you're running today's game/i),
      ).toBeVisible({ timeout: 10_000 });

      // The game belongs to this sport's demo team, sped up 8×.
      const token = page.url().match(/\/run\/([a-zA-Z0-9_-]+)/)![1];
      const { data: game } = await createAdminClient()
        .from("games")
        .select("clock_multiplier, teams!inner(sport, is_demo)")
        .eq("share_token", token)
        .single();
      expect(game).toMatchObject({
        clock_multiplier: 8,
        teams: { sport, is_demo: true },
      });
    });
  }

  // The five sports added to the picker last each play their own U10
  // format: on-field size and sub interval from the sport's age-group
  // config (src/lib/sports/<sport>/index.ts).
  const U10_FORMATS = [
    ["basketball", "basketball", 5, 240],
    ["touch", "touch", 5, 300],
    ["oztag", "oztag", 8, 300],
    ["hockey", "hockey", 7, 240],
    ["futsal", "futsal", 5, 240],
  ] as const;
  for (const [id, sport, onField, subInterval] of U10_FORMATS) {
    test(`the ${id} demo plays ${sport} U10: ${onField} on the field`, async ({ page }) => {
      await page.goto("/demo");
      await page.getByTestId(`demo-card-${id}`).click();
      await page.waitForURL(/\/run\/[a-zA-Z0-9_-]+/, { timeout: 15_000 });
      const token = page.url().match(/\/run\/([a-zA-Z0-9_-]+)/)![1];
      const { data: game } = await createAdminClient()
        .from("games")
        .select("on_field_size, sub_interval_seconds, teams!inner(sport, age_group, mixed_max_boys)")
        .eq("share_token", token)
        .single();
      expect(game).toMatchObject({
        on_field_size: onField,
        sub_interval_seconds: subInterval,
        teams: {
          sport,
          age_group: "U10",
          // Touch and Oztag demos are mixed teams under the boys' cap.
          mixed_max_boys: sport === "touch" ? 3 : sport === "oztag" ? 4 : null,
        },
      });
    });
  }

  test("the football demo plays soccer: its own team, sized from MiniRoos U9", async ({ page }) => {
    await page.goto("/demo");
    await page.getByTestId("demo-card-football").click();
    await page.waitForURL(/\/run\/[a-zA-Z0-9_-]+/, { timeout: 15_000 });
    const token = page.url().match(/\/run\/([a-zA-Z0-9_-]+)/)![1];
    const admin = createAdminClient();
    const { data: game } = await admin
      .from("games")
      .select("on_field_size, clock_multiplier, teams!inner(sport, is_demo, age_group)")
      .eq("share_token", token)
      .single();
    expect(game).toMatchObject({
      on_field_size: 7,
      clock_multiplier: 8,
      teams: { sport: "soccer", is_demo: true, age_group: "U9" },
    });
  });

  test("the union demo plays union: its own team, sized from union U10", async ({ page }) => {
    await page.goto("/demo");
    await page.getByTestId("demo-card-union").click();
    await page.waitForURL(/\/run\/[a-zA-Z0-9_-]+/, { timeout: 15_000 });
    const token = page.url().match(/\/run\/([a-zA-Z0-9_-]+)/)![1];
    const admin = createAdminClient();
    const { data: game } = await admin
      .from("games")
      .select("on_field_size, sub_interval_seconds, teams!inner(sport, is_demo)")
      .eq("share_token", token)
      .single();
    expect(game).toMatchObject({
      on_field_size: 12,
      sub_interval_seconds: 240,
      teams: { sport: "rugby_union", is_demo: true },
    });
  });
});
