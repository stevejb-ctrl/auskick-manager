// Covers the PlayHQ fixture-import flow. The real PlayHQ call is
// intercepted via page.route() so the test doesn't depend on the
// external service being reachable from CI.
//
// Covers: src/app/(app)/teams/[teamId]/games/actions.ts:
//         previewPlayhqFixtures, importPlayhqFixtures

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("PlayHQ preview + import creates game rows", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });

  // Stub the outbound PlayHQ call. The exact URL + response shape is
  // defined in lib/playhq.ts; adjust the matcher if that module changes.
  await page.route(/playhq\.com/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        // Minimal fixture envelope — two upcoming games.
        fixtures: [
          {
            id: "phq-1",
            opponent: "Imported Opp 1",
            scheduled_at: new Date(Date.now() + 3 * 86400_000).toISOString(),
            round: 1,
          },
          {
            id: "phq-2",
            opponent: "Imported Opp 2",
            scheduled_at: new Date(Date.now() + 10 * 86400_000).toISOString(),
            round: 2,
          },
        ],
      }),
    });
  });

  await page.goto(`/teams/${team.id}/games`);

  await page.getByRole("button", { name: /import from playhq/i }).click();

  await page
    .getByLabel(/playhq.*url/i)
    .fill("https://www.playhq.com/some-team-url");
  await page.getByRole("button", { name: /preview/i }).click();

  // Preview renders checkboxes. Select both and import.
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: /import.*fixture/i }).click();

  await page.waitForTimeout(1000);

  const { data: games } = await admin
    .from("games")
    .select("opponent")
    .eq("team_id", team.id);
  expect(games?.some((g) => g.opponent === "Imported Opp 1")).toBe(true);
});
