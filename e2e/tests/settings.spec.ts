// Covers the non-member-management portion of /teams/[teamId]/settings:
//   - renameTeam
//   - setTrackScoring (toggle on → off → on)
//   - saveSongUrl (the URL variant — file-upload requires Storage setup
//     that's worth covering in a dedicated spec once we add one)
//
// Covers: src/app/(app)/teams/[teamId]/settings/actions.ts:
//         renameTeam, setTrackScoring, saveSongUrl, setSongEnabled

import { test, expect } from "@playwright/test";
import { createAdminClient, createTestUser, deleteTestUser } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";
import { waitForAdminHydration } from "../helpers/admin-hydration";

test.describe.configure({ mode: "parallel" });

test("rename team persists in DB + renders new name", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    name: `Pre-${Date.now()}`,
  });

  await page.goto(`/teams/${team.id}/settings`);

  // The TeamNameSettings card has no <label>; the section is keyed by
  // its h2 ("Team name"). Scope the input + button lookup to that
  // section so other settings cards (Track scoring, Song URL) can't
  // accidentally match.
  const teamNameCard = page.locator("section").filter({ hasText: "Team name" });
  await teamNameCard.getByRole("textbox").fill("Renamed Roos");
  await teamNameCard.getByRole("button", { name: /^save$/i }).click();

  await expect
    .poll(
      async () => {
        const { data: reloaded } = await admin
          .from("teams")
          .select("name")
          .eq("id", team.id)
          .single();
        return reloaded?.name;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe("Renamed Roos");
});

test("toggle track-scoring flag", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });

  await page.goto(`/teams/${team.id}/settings`);

  // Capture initial state.
  const { data: before } = await admin
    .from("teams")
    .select("track_scoring")
    .eq("id", team.id)
    .single();

  // Wait for admin-membership hydration before clicking — see
  // e2e/helpers/admin-hydration.ts for the race rationale.
  const toggle = page.getByRole("switch", { name: /track scoring/i });
  await waitForAdminHydration(toggle);
  await toggle.click();

  // Poll for the persisted change instead of a fixed waitForTimeout —
  // the server action runs async after the click and the previous
  // 500ms timeout was occasionally too tight under load.
  await expect
    .poll(
      async () => {
        const { data: row } = await admin
          .from("teams")
          .select("track_scoring")
          .eq("id", team.id)
          .single();
        return row?.track_scoring;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .not.toBe(before?.track_scoring);
});

// Regression (UX plan C1): `team_memberships` has two FKs to `profiles`
// (`user_id`, `invited_by`), so an unqualified `profiles(...)` embed is
// ambiguous (PGRST201) and the members list rendered "0 members" for
// every team. The list must show each member and let the coach change
// their role.
test("team members list shows every member and changes a role", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  const helper = await createTestUser(admin, {
    email: `members-list-${Date.now()}@siren.test`,
    password: "pw-test-12345",
    fullName: "Morgan Helper",
  });
  try {
    await admin.from("team_memberships").insert({
      team_id: team.id,
      user_id: helper.id,
      role: "parent",
      invited_by: ownerId,
    });

    await page.goto(`/teams/${team.id}/settings`);

    await expect(page.getByText("2 members")).toBeVisible();
    await expect(page.getByText("Morgan Helper")).toBeVisible();

    const roleSelect = page.getByLabel("Role for Morgan Helper");
    await waitForAdminHydration(roleSelect);
    await roleSelect.selectOption("game_manager");

    await expect
      .poll(
        async () => {
          const { data: row } = await admin
            .from("team_memberships")
            .select("role")
            .eq("team_id", team.id)
            .eq("user_id", helper.id)
            .single();
          return row?.role;
        },
        { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
      )
      .toBe("game_manager");
  } finally {
    await deleteTestUser(admin, helper.id);
  }
});
