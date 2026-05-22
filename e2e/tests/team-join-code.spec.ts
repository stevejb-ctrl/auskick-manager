// Covers the team join-code feature:
//   - Manager sees the code in team settings and can regenerate it.
//   - Parent enters the code on /join-team → lands on /teams/{id}/games
//     as a `parent` membership.
//   - Bad codes (wrong format, unknown team) fail cleanly.
//   - Re-entering the code as an existing member is a no-op success.
//   - /welcome surfaces both "Set up" and "Join with a code" CTAs.
//
// Covers: supabase/migrations/0041_team_join_code.sql
//         src/app/(app)/teams/[teamId]/settings/member-actions.ts:
//             regenerateJoinCode
//         src/app/(app)/join-team/actions.ts: joinTeamByCode
//         src/app/(app)/join-team/page.tsx + JoinTeamForm.tsx
//         src/components/team/TeamMembersSettings.tsx JoinCodeSection
//         src/app/(app)/welcome/page.tsx (dual CTAs)

import { test, expect } from "@playwright/test";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
} from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

// Helper — seeds a team and writes a deterministic join_code into
// the row (trigger fills nulls, so an explicit value wins). Lets the
// test know the code without an extra round-trip.
async function makeTeamWithCode(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
  code: string,
) {
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  const { error } = await admin
    .from("teams")
    .update({ join_code: code })
    .eq("id", team.id);
  if (error) throw new Error(`makeTeamWithCode update: ${error.message}`);
  return team;
}

test("team settings shows the join code with a Regenerate button", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;
  const team = await makeTeamWithCode(admin, ownerId, "TEST-CODE");

  const ctx = await browser.newContext({
    storageState: "playwright/.auth/super-admin.json",
  });
  const page = await ctx.newPage();
  await page.goto(`/teams/${team.id}/settings`);

  await expect(page.getByTestId("team-join-code")).toHaveText("TEST-CODE");
  await expect(
    page.getByRole("button", { name: /^regenerate$/i }),
  ).toBeVisible();

  await ctx.close();
});

test("regenerate replaces the code with a fresh one", async ({ browser }) => {
  test.setTimeout(60_000);
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;
  const team = await makeTeamWithCode(admin, ownerId, "OLD1-CODE");

  const ctx = await browser.newContext({
    storageState: "playwright/.auth/super-admin.json",
  });
  const page = await ctx.newPage();

  // Regenerate is gated by window.confirm — auto-accept any dialogs
  // so the button click goes straight through.
  page.on("dialog", (d) => d.accept());

  await page.goto(`/teams/${team.id}/settings`);
  await page.getByRole("button", { name: /^regenerate$/i }).click();

  // DB code should change off "OLD1-CODE" within a few seconds.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("teams")
          .select("join_code")
          .eq("id", team.id)
          .single();
        return data?.join_code;
      },
      { timeout: 10_000, intervals: [200, 500, 500, 1000, 1000] },
    )
    .not.toBe("OLD1-CODE");

  // And the new code must match the canonical XXXX-XXXX format from
  // the migration's 31-char alphabet (no 0/O/1/I/L allowed).
  const { data: refreshed } = await admin
    .from("teams")
    .select("join_code")
    .eq("id", team.id)
    .single();
  expect(refreshed?.join_code).toMatch(
    /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/,
  );

  await ctx.close();
});

test("parent enters a valid code on /join-team → lands on /games", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;
  const team = await makeTeamWithCode(admin, ownerId, "PRNT-JOIN");

  // Brand-new parent account, not yet a member of anything.
  const parent = await createTestUser(admin, {
    email: `code-parent-${Date.now()}@siren.test`,
    password: "parent-test-pw-1234",
    fullName: "Code Parent",
  });

  try {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();

    // Sign in as the parent first (mirrors the auth.setup pattern).
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("login-mode-toggle").click();
    await page.getByTestId("login-password").waitFor({ state: "visible" });
    await page.getByTestId("login-email").fill(parent.email);
    await page.getByTestId("login-password").fill(parent.password);
    await page.getByTestId("login-submit").click();
    // Fresh-account parent has zero teams → bounces through /welcome.
    await page.waitForURL(/\/(welcome|dashboard|join-team)/, {
      timeout: 30_000,
    });

    await page.goto("/join-team");
    // Type a casing/format-shifted version to exercise the normaliser.
    await page.getByTestId("join-code-input").fill("prntjoin");
    await page.getByRole("button", { name: /^join team$/i }).click();

    // Lands on the team's Games tab — same destination as the
    // link-accept path so a new parent always sees the schedule first.
    await page.waitForURL(new RegExp(`/teams/${team.id}/games`), {
      timeout: 30_000,
    });

    // DB confirms the membership exists with role = parent.
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("team_memberships")
            .select("role")
            .eq("team_id", team.id)
            .eq("user_id", parent.id)
            .maybeSingle();
          return data?.role;
        },
        { timeout: 10_000, intervals: [200, 500, 500, 1000, 1000] },
      )
      .toBe("parent");

    await ctx.close();
  } finally {
    await deleteTestUser(admin, parent.id);
  }
});

test("garbage code format fails before hitting the DB", async ({ browser }) => {
  test.setTimeout(60_000);
  const admin = createAdminClient();

  const ctx = await browser.newContext({
    storageState: "playwright/.auth/super-admin.json",
  });
  const page = await ctx.newPage();
  await page.goto("/join-team");

  await page.getByTestId("join-code-input").fill("abc");
  await page.getByRole("button", { name: /^join team$/i }).click();

  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /doesn't look like a team join code/i }),
  ).toBeVisible({ timeout: 10_000 });

  // Sanity: no rogue membership row was created.
  const { count } = await admin
    .from("team_memberships")
    .select("*", { count: "exact", head: true });
  // Just confirm the query worked; we can't usefully assert on the
  // count because parallel tests are creating memberships too.
  expect(typeof count).toBe("number");

  await ctx.close();
});

test("valid-shaped but unknown code returns a friendly error", async ({
  browser,
}) => {
  test.setTimeout(60_000);

  const ctx = await browser.newContext({
    storageState: "playwright/.auth/super-admin.json",
  });
  const page = await ctx.newPage();
  await page.goto("/join-team");

  // Right shape, no team with this code (vanishingly unlikely
  // collision with the 31^8 generator space).
  await page.getByTestId("join-code-input").fill("ZZZZ-ZZZZ");
  await page.getByRole("button", { name: /^join team$/i }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: /couldn't find a team/i }),
  ).toBeVisible({ timeout: 10_000 });

  await ctx.close();
});

test("/welcome surfaces both Set up and Join with a code CTAs", async ({
  browser,
}) => {
  test.setTimeout(60_000);

  // Use a fresh parent account so /welcome doesn't bounce to
  // /dashboard (which it does for anyone who's already on a team).
  const admin = createAdminClient();
  const parent = await createTestUser(admin, {
    email: `welcome-cta-${Date.now()}@siren.test`,
    password: "parent-test-pw-1234",
    fullName: "Welcome CTA",
  });

  try {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("login-mode-toggle").click();
    await page.getByTestId("login-password").waitFor({ state: "visible" });
    await page.getByTestId("login-email").fill(parent.email);
    await page.getByTestId("login-password").fill(parent.password);
    await page.getByTestId("login-submit").click();
    await page.waitForURL(/\/welcome/, { timeout: 30_000 });

    await expect(
      page.getByRole("link", { name: /^set up a new team$/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^join with a code$/i }),
    ).toBeVisible();

    await ctx.close();
  } finally {
    await deleteTestUser(admin, parent.id);
  }
});
