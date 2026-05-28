// Covers the multi-sport demo picker at /demo.
//
//   1. Picker renders 4 cards: AFL, Rugby League, Netball (all
//      clickable), Rugby Union (disabled "Coming soon").
//   2. Clicking an active card POSTs to runDemoGame and redirects to
//      /run/{token} (the public live-game view). Verified by URL
//      assertion + presence of live-game chrome.
//   3. Union card has aria-disabled and doesn't navigate when clicked.
//
// Covers: src/app/(marketing)/demo/page.tsx (DemoPage, DemoSportCard)
//         + src/app/(marketing)/demo/actions.ts (runDemoGame)
//         + src/app/api/admin/seed-demo/route.ts (per-sport seeding)
//
// Test-DB setup:
//   The picker's server action looks up an is_demo=true team per
//   sport and refuses if none exists. `npm run db:reset` doesn't
//   seed those teams, so a fresh test DB has no demo teams. The
//   beforeAll below idempotently creates one team per sport (with
//   a minimal roster) and a super-admin to own them, so the spec
//   works against any clean DB.

import { test, expect } from "@playwright/test";
import { createAdminClient, ensureTestUser } from "../fixtures/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

// Minimal rosters per sport — same shape the production seed-demo
// route creates, trimmed for test economy. Names match the prod
// seeds so test expectations carry over if we ever lock to a
// specific player.
const TEST_DEMO_SEED = {
  afl: {
    name: "Demo Team",
    age_group: "U10",
    players: ["Alex Johnson", "Blake Smith", "Casey Brown", "Dana Wilson"],
  },
  netball: {
    name: "Demo Netball",
    age_group: "go",
    players: ["Amelia", "Bella", "Chloe", "Daisy"],
  },
  rugby_league: {
    name: "Demo League",
    age_group: "U10",
    players: ["Tom Clarke", "Jack Sullivan", "Luke Davies", "Sam Reilly"],
    settings: {
      track_zone_time: true,
      enforce_unbroken_periods: true,
    },
  },
} as const;

type SeededSport = keyof typeof TEST_DEMO_SEED;

async function seedDemoTeamIfMissing(
  admin: SupabaseClient,
  ownerId: string,
  sport: SeededSport,
): Promise<void> {
  const { data: existing } = await admin
    .from("teams")
    .select("id")
    .eq("is_demo", true)
    .eq("sport", sport)
    .limit(1)
    .maybeSingle();
  if (existing) return;

  const cfg = TEST_DEMO_SEED[sport];
  // handle_new_team() trigger auto-creates the (team, ownerId, admin)
  // membership row on INSERT — don't explicitly insert it here or the
  // unique constraint trips.
  const settings = "settings" in cfg ? cfg.settings : {};
  const { data: team, error: teamErr } = await admin
    .from("teams")
    .insert({
      name: cfg.name,
      age_group: cfg.age_group,
      sport,
      track_scoring: true,
      is_demo: true,
      created_by: ownerId,
      ...settings,
    })
    .select("id")
    .single();
  if (teamErr || !team) {
    throw new Error(
      `Failed to seed ${sport} demo team: ${teamErr?.message ?? "unknown"}`,
    );
  }

  const { error: playersErr } = await admin.from("players").insert(
    cfg.players.map((name) => ({
      team_id: team.id,
      full_name: name,
      jersey_number: null as number | null,
      is_active: true,
      created_by: ownerId,
    })),
  );
  if (playersErr) {
    throw new Error(
      `Failed to seed ${sport} demo players: ${playersErr.message}`,
    );
  }
}

test.describe("Demo picker", () => {
  test.beforeAll(async () => {
    // Provision the demo teams the picker's server action needs.
    // Idempotent — re-runs on the same DB are no-ops once teams
    // exist. Owner is a stable super-admin user so the
    // team_memberships trigger has a valid created_by FK to reach.
    const admin = createAdminClient();
    const owner = await ensureTestUser(admin, {
      email: "e2e-demo-owner@siren.test",
      password: "e2e-demo-owner-password-not-secret",
      fullName: "E2E Demo Owner",
      superAdmin: true,
    });
    await seedDemoTeamIfMissing(admin, owner.id, "afl");
    await seedDemoTeamIfMissing(admin, owner.id, "netball");
    await seedDemoTeamIfMissing(admin, owner.id, "rugby_league");
  });

  test("renders all 4 sport cards with the expected affordances", async ({
    page,
  }) => {
    await page.goto("/demo");

    await expect(
      page.getByRole("heading", { name: /pick a sport/i }),
    ).toBeVisible();

    for (const sport of ["afl", "league", "netball"] as const) {
      const card = page.getByTestId(`demo-card-${sport}`);
      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute("aria-label", /start.*demo/i);
    }

    const unionCard = page.getByTestId("demo-card-union");
    await expect(unionCard).toBeVisible();
    await expect(unionCard).toHaveAttribute("aria-disabled", "true");
    await expect(unionCard).toContainText(/coming soon/i);
  });

  for (const sport of ["afl", "league", "netball"] as const) {
    test(`${sport} card starts a demo game and redirects to /run/{token}`, async ({
      page,
    }) => {
      await page.goto("/demo");

      await page.getByTestId(`demo-card-${sport}`).click();

      await page.waitForURL(/\/run\/[a-zA-Z0-9_-]+/, { timeout: 15_000 });

      expect(page.url()).toMatch(/\/run\/[a-zA-Z0-9_-]+/);

      // Smoke-check that the live-game page actually rendered —
      // "Demo Opponent" is the opponent name our server action
      // INSERTs, so it appears on the live chrome regardless of
      // sport.
      await expect(page.getByText(/demo opponent/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });
  }

  test("union card is non-interactive", async ({ page }) => {
    await page.goto("/demo");

    const unionCard = page.getByTestId("demo-card-union");
    await unionCard.click();
    await page.waitForTimeout(500);
    expect(page.url()).toMatch(/\/demo\/?$/);
  });
});
