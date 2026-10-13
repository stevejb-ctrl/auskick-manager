// Regression guard for the U8/U10/U13 on_field_size fix shipped on
// 2026-04-21: newly-created games must inherit on_field_size from
// the team's age-group config (getAgeGroupConfig(sport, ag)), not the
// old hard-coded default of 12.
//
// Since 2026-10-13 createGame also writes sub_interval_seconds from
// the same config. Before, manual games took the DB default of 180s
// while PlayHQ and demo games used the age group's value. AFL's is
// derived from quarter length (smallest clean split of at least 4 min).
//
// Covers: src/app/(app)/teams/[teamId]/games/actions.ts:createGame

import { test, expect } from "@playwright/test";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
} from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

const cases: Array<{
  sport?: "afl" | "rugby_league";
  ageGroup: string;
  expectedSize: number;
  expectedSubSeconds: number;
}> = [
  // AFL U8: 10-min quarters, two 5-min stints.
  { ageGroup: "U8", expectedSize: 6, expectedSubSeconds: 300 },
  // AFL U10: 12-min quarters, three 4-min stints.
  { ageGroup: "U10", expectedSize: 12, expectedSubSeconds: 240 },
  // U13 dropped from 18 (5-position) to 15 (3-zone 5-5-5) when commit
  // 108ffd0 flipped every AFL age group onto the 3-zone model.
  { ageGroup: "U13", expectedSize: 15, expectedSubSeconds: 240 },
  // League U13: 13-a-side, 25-min halves, six 250s stints.
  { sport: "rugby_league", ageGroup: "U13", expectedSize: 13, expectedSubSeconds: 250 },
];

for (const { sport = "afl", ageGroup, expectedSize, expectedSubSeconds } of cases) {
  test(`createGame on a ${sport} ${ageGroup} team stores on_field_size=${expectedSize}, sub_interval_seconds=${expectedSubSeconds}`, async ({
    browser,
  }) => {
    const admin = createAdminClient();
    const stamp = Date.now();
    const user = await createTestUser(admin, {
      email: `gc-${sport}-${ageGroup}-${stamp}@siren.test`.toLowerCase(),
      password: "gc-test-pw-1234",
      fullName: `GC ${ageGroup}`,
    });

    try {
      const team = await makeTeam(admin, {
        ownerId: user.id,
        ageGroup,
        sport,
        name: `GC ${sport} ${ageGroup} ${stamp}`,
      });

      // Sign in as this user (not the super-admin) so the create-game
      // flow mirrors a real team admin's experience. /login is now an
      // email-first / magic-link form by default; click the password
      // toggle first to surface the password input. (Same pattern
      // auth.setup uses — see e2e/tests/auth.setup.ts.)
      const context = await browser.newContext({ storageState: undefined });
      const page = await context.newPage();

      await page.goto("/login");
      await page.getByTestId("login-mode-toggle").click();
      await page.getByTestId("login-email").fill(user.email);
      await page.getByTestId("login-password").fill(user.password);
      await page.getByTestId("login-submit").click();
      await page.waitForURL(/\/(dashboard|teams)/, { timeout: 10_000 });

      await page.goto(`/teams/${team.id}/games`);

      // The games page lives behind AddGameSection now: the "manual
      // create" affordance is a "Create manually" button (the primary
      // option is "Import from PlayHQ"). Clicking opens a modal that
      // hosts CreateGameForm.
      await page.getByRole("button", { name: /create manually/i }).click();

      const opponent = `Test Opp ${stamp}`;
      await page.getByLabel(/opponent/i).fill(opponent);

      // Pick a datetime in the near future. datetime-local format is
      // YYYY-MM-DDTHH:mm.
      const future = new Date(Date.now() + 7 * 86400_000);
      const local = future.toISOString().slice(0, 16);
      await page.getByLabel(/date.*time/i).fill(local);

      await page.getByRole("button", { name: /^create game$/i }).click();

      // createGame redirects to /teams/{teamId}/games/{gameId} on
      // success — wait for that redirect, then DB-verify the size.
      await page.waitForURL(/\/teams\/.+\/games\/.+/, { timeout: 10_000 });

      const { data: games } = await admin
        .from("games")
        .select("id, on_field_size, sub_interval_seconds, opponent")
        .eq("team_id", team.id)
        .eq("opponent", opponent);

      expect(games).not.toBeNull();
      expect(games).toHaveLength(1);
      expect(games![0].on_field_size).toBe(expectedSize);
      expect(games![0].sub_interval_seconds).toBe(expectedSubSeconds);

      await context.close();
    } finally {
      await deleteTestUser(admin, user.id);
    }
  });
}
