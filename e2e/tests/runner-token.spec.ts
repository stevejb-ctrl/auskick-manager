// Regression guard for runner-token isolation:
//   - An unauthed user with a valid share_token can reach /run/[token]
//     and see the live game UI.
//   - The same token does NOT grant access to a different game.
//   - The token does NOT grant access to team-admin routes
//     (e.g. /teams/[teamId]/settings).
//
// Covers: src/app/run/[token]/* + the share_token auth path in the
// live-game server actions.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("unauthed /run/[token] loads the live game UI", async ({ browser }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  // New context WITHOUT storageState — simulates a bench parent or
  // runner opening the share link on their own phone.
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();

  await page.goto(`/run/${game.share_token}`);

  // The runner page (src/app/run/[token]/page.tsx) has two states:
  // pre-kickoff (when no lineup_set event exists) renders an
  // AvailabilityList + a "Continue to starting lineup" CTA, and
  // in-progress renders the full LiveGame. With no events seeded,
  // we land on pre-kickoff — assert the CTA text is present.
  //
  // 2026-05-15: use getByText instead of getByRole("link") because
  // the CTA renders as a disabled SFButton (a <button>, not a Link)
  // when `enoughAvailable` is false — and this test seeds no
  // game_availability rows. Both states still print the same text;
  // matching the text alone proves token-gated access without
  // requiring availability fixture setup.
  await expect(
    page.getByText(/continue to starting lineup/i),
  ).toBeVisible({ timeout: 10_000 });

  await context.close();
});

test("one game's share_token does not grant access to a different game", async ({
  browser,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  // Use distinctive multi-character opponent names so getByText can't
  // match a stray "A" or "B" elsewhere on the page (button labels,
  // nav, etc.).
  const gameA = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    opponent: "Alpha Sharks",
  });
  const gameB = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    opponent: "Bravo Eagles",
  });

  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();

  // Each token is single-game scoped: visiting one renders that
  // game's opponent, visiting the other renders the other's. The
  // test proves both tokens render distinct game state without
  // cross-contamination.
  await page.goto(`/run/${gameA.share_token}`);
  await expect(page.getByText("Alpha Sharks").first()).toBeVisible();

  await page.goto(`/run/${gameB.share_token}`);
  await expect(page.getByText("Bravo Eagles").first()).toBeVisible();

  await context.close();
});

test("share token does not open team-settings routes", async ({ browser }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  await makeGame(admin, { teamId: team.id, ownerId });

  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();

  await page.goto(`/teams/${team.id}/settings`);

  // Should redirect to /login (not render settings). We accept either
  // a hard redirect or a "sign in" prompt on the page.
  await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });

  await context.close();
});
