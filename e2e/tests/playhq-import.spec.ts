// Covers the PlayHQ fixture-import flow. The real PlayHQ call is
// intercepted via page.route() so the test doesn't depend on the
// external service being reachable from CI.
//
// Covers: src/app/(app)/teams/[teamId]/games/actions.ts:
//         previewPlayhqFixtures, importPlayhqFixtures

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

// FIXME (architecture 2026-04-29): the test stubs `playhq.com` via
// `page.route(...)`, but `previewPlayhqFixtures` and
// `importPlayhqFixtures` are server actions — the fetch to PlayHQ
// happens server-side, so the stub is silently ignored. The action
// then either errors out or returns no fixtures, the preview list
// stays empty, and the spec times out trying to find a checkbox to
// click. To un-fixme, we need ONE of:
//   (a) a TEST_PLAYHQ_FIXTURES env var that makes
//       `lib/playhq.ts:fetchPlayhqFixtures` return canned data when
//       set (cheapest)
//   (b) MSW or similar set up on the server runtime
//   (c) replace this with a unit test of previewPlayhqFixtures
//       directly, with `fetch` mocked at the module boundary
// Until one of those lands, this stays quarantined.
test.fixme("PlayHQ preview + import creates game rows", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });

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
  await waitForHydration(page);

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

// Each sport imports from its own PlayHQ (cross-sport audit, 14 Oct
// 2026). Every request went to AFL's tenant, and a netball team could
// pull in an AFL club's fixtures. Both checks below stop before any
// call to PlayHQ, so they run without the stub the test above needs.
test("a netball team can't import an AFL club's fixtures", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "11u", sport: "netball" });

  await page.goto(`/teams/${team.id}/games`);
  await waitForHydration(page);
  await page.getByRole("button", { name: /import from playhq/i }).click();
  await expect(page.getByLabel(/playhq team url/i)).toHaveAttribute("placeholder", /playhq\.com\/netball-australia\//);
  await page
    .getByLabel(/playhq team url/i)
    .fill("https://www.playhq.com/afl/org/kotara-jfc/1a2b3c4d/u10-2026/teams/kotara-u10/9f8e7d6c");
  await page.getByRole("button", { name: /preview fixtures/i }).click();
  // Scoped to the import dialog: the page has other alert regions.
  await expect(
    page.getByRole("dialog", { name: /import fixtures from playhq/i }).getByRole("alert"),
  ).toContainText(/that's an afl team page/i);
});

test("a league team isn't offered a PlayHQ import", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U11", sport: "rugby_league" });

  await page.goto(`/teams/${team.id}/games`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /create manually/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /import from playhq/i })).toHaveCount(0);
  await expect(page.getByText(/playhq/i)).toHaveCount(0);
});
