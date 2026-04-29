// Covers the team-invite round trip:
//   1. Admin creates an invite → token + link
//   2. Another user follows /join/[token] and accepts
//   3. DB has a new team_memberships row with the expected role
//
// Covers: src/app/(app)/teams/[teamId]/settings/member-actions.ts:
//         createInvite (and related), src/app/join/[token]/actions.ts:
//         acceptInvite

import { test, expect } from "@playwright/test";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
} from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("admin invites a parent, parent accepts via /join/[token]", async ({
  browser,
}) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });

  // --- Step 1: super-admin (acting as team admin) creates an invite ---
  const adminContext = await browser.newContext({
    storageState: "playwright/.auth/super-admin.json",
  });
  const adminPage = await adminContext.newPage();

  await adminPage.goto(`/teams/${team.id}/settings`);
  // TeamMembersSettings starts with "Invite someone" trigger; clicking
  // it surfaces the create-link form whose submit button is "Create
  // invite link" (per src/components/team/TeamMembersSettings.tsx).
  await adminPage
    .getByRole("button", { name: /^invite someone$/i })
    .click();
  await adminPage
    .getByRole("button", { name: /^create invite link$/i })
    .click();

  // Pull the freshly-created token straight from the DB — the UI
  // surfaces a "Copy" button but parsing the clipboard from a
  // Playwright test is flakier than a DB fetch.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("team_invites")
          .select("token")
          .eq("team_id", team.id);
        return data?.length ?? 0;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBeGreaterThanOrEqual(1);
  const { data: invites } = await admin
    .from("team_invites")
    .select("token, role")
    .eq("team_id", team.id);
  const token = invites![0].token;
  const invitedRole = invites![0].role;

  await adminContext.close();

  // --- Step 2: new user follows the join link, signs up, accepts ---
  const invitee = await createTestUser(admin, {
    email: `invitee-${Date.now()}@siren.test`,
    password: "invitee-test-pw-1234",
    fullName: "Invited Parent",
  });

  try {
    const userContext = await browser.newContext({ storageState: undefined });
    const userPage = await userContext.newPage();

    // Sign in as the invitee first (account created via admin API
    // above). /login is email-first / magic-link; toggle to password
    // mode and use the testid pattern.
    await userPage.goto("/login");
    await userPage.getByTestId("login-mode-toggle").click();
    await userPage.getByTestId("login-email").fill(invitee.email);
    await userPage.getByTestId("login-password").fill(invitee.password);
    await userPage.getByTestId("login-submit").click();
    await userPage.waitForURL(/\/(dashboard|teams)/, { timeout: 10_000 });

    await userPage.goto(`/join/${token}`);
    // AcceptInviteButton renders "Accept & join team".
    await userPage
      .getByRole("button", { name: /accept.*join team/i })
      .click();

    // Lands on the team page after accepting.
    await userPage.waitForURL(new RegExp(`/teams/${team.id}`), {
      timeout: 10_000,
    });

    // --- Step 3: DB confirms membership ---
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("team_memberships")
            .select("role")
            .eq("team_id", team.id)
            .eq("user_id", invitee.id);
          return data?.[0]?.role;
        },
        { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
      )
      .toBe(invitedRole);

    await userContext.close();
  } finally {
    await deleteTestUser(admin, invitee.id);
  }
});
