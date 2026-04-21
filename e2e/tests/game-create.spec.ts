// Regression guard for the U8/U10/U13 on_field_size fix shipped on
// 2026-04-21: newly-created games must inherit on_field_size from
// the team's age-group config (AGE_GROUPS[ag].defaultOnFieldSize),
// not the old hard-coded default of 12.
//
// Covers: src/app/(app)/teams/[teamId]/games/actions.ts:createGame
//
// Expected values (per AFL Junior Match Policy, see src/lib/ageGroups.ts):
//   U8   → 6
//   U10  → 12
//   U13  → 18

import { test, expect } from "@playwright/test";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
} from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";
import type { AgeGroup } from "../../src/lib/types";

test.describe.configure({ mode: "parallel" });

const cases: Array<{ ageGroup: AgeGroup; expectedSize: number }> = [
  { ageGroup: "U8", expectedSize: 6 },
  { ageGroup: "U10", expectedSize: 12 },
  { ageGroup: "U13", expectedSize: 18 },
];

for (const { ageGroup, expectedSize } of cases) {
  test(`createGame on a ${ageGroup} team stores on_field_size=${expectedSize}`, async ({
    browser,
  }) => {
    const admin = createAdminClient();
    const stamp = Date.now();
    const user = await createTestUser(admin, {
      email: `gc-${ageGroup}-${stamp}@siren.test`,
      password: "gc-test-pw-1234",
      fullName: `GC ${ageGroup}`,
    });

    try {
      const team = await makeTeam(admin, {
        ownerId: user.id,
        ageGroup,
        name: `GC ${ageGroup} ${stamp}`,
      });

      // Sign in as this user (not the super-admin) so the create-game
      // flow mirrors a real team admin's experience.
      const context = await browser.newContext({ storageState: undefined });
      const page = await context.newPage();

      await page.goto("/login");
      await page.getByLabel(/email/i).fill(user.email);
      await page.getByLabel(/password/i).fill(user.password);
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      await page.waitForURL(/\/(dashboard|teams)/, { timeout: 10_000 });

      await page.goto(`/teams/${team.id}/games`);

      // The games page has an "Add game" affordance that opens the
      // CreateGameForm. Button label may be "Add game" or "+ Add game".
      await page.getByRole("button", { name: /add game/i }).first().click();

      const opponent = `Test Opp ${stamp}`;
      await page.getByLabel(/opponent/i).fill(opponent);

      // Pick a datetime in the near future. datetime-local format is
      // YYYY-MM-DDTHH:mm.
      const future = new Date(Date.now() + 7 * 86400_000);
      const local = future.toISOString().slice(0, 16);
      await page.getByLabel(/date.*time/i).fill(local);

      await page.getByRole("button", { name: /create game/i }).click();

      // Game detail page loads. Confirm via DB that on_field_size
      // matches the age-group default.
      await page.waitForURL(/\/teams\/.+\/games\/.+/, { timeout: 10_000 });

      const { data: games } = await admin
        .from("games")
        .select("id, on_field_size, opponent")
        .eq("team_id", team.id)
        .eq("opponent", opponent);

      expect(games).not.toBeNull();
      expect(games).toHaveLength(1);
      expect(games![0].on_field_size).toBe(expectedSize);

      await context.close();
    } finally {
      await deleteTestUser(admin, user.id);
    }
  });
}
