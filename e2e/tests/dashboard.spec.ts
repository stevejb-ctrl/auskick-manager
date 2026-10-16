// Covers the multi-team dashboard (UX plan 1.5): each team is a card
// with sport, age group and next game; creating a team is a secondary
// action for a returning coach.
//
// Covers: src/app/(app)/dashboard/page.tsx

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("dashboard team cards show sport, age group and the next game", async ({ page }) => {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers();
  const ownerId = data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U12",
    name: `Card ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sport: "afl",
  });
  await makeGame(admin, {
    teamId: team.id,
    ownerId,
    opponent: "Card Crows",
    scheduledAt: new Date(Date.now() + 2 * 86400_000).toISOString(),
  });

  await page.goto("/dashboard?list=1");

  const card = page.getByRole("link", { name: new RegExp(team.name) });
  await expect(card).toContainText("AFL · Under 12", { timeout: 15_000 });
  await expect(card).toContainText("vs Card Crows");

  // Returning coaches open a team; creating another is secondary.
  await expect(page.getByRole("link", { name: /^\+ new team$/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^create a new team$/i })).toHaveCount(0);
});
