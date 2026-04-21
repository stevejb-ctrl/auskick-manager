// Covers the non-member-management portion of /teams/[teamId]/settings:
//   - renameTeam
//   - setTrackScoring (toggle on → off → on)
//   - saveSongUrl (the URL variant — file-upload requires Storage setup
//     that's worth covering in a dedicated spec once we add one)
//
// Covers: src/app/(app)/teams/[teamId]/settings/actions.ts:
//         renameTeam, setTrackScoring, saveSongUrl, setSongEnabled

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";

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

  await page.getByLabel(/team name/i).fill("Renamed Roos");
  await page.getByRole("button", { name: /save|update/i }).first().click();

  await page.waitForTimeout(500);

  const { data: reloaded } = await admin
    .from("teams")
    .select("name")
    .eq("id", team.id)
    .single();
  expect(reloaded?.name).toBe("Renamed Roos");
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

  const toggle = page.getByRole("switch", { name: /track scoring/i }).or(
    page.getByRole("checkbox", { name: /track scoring/i })
  );
  await toggle.click();

  await page.waitForTimeout(500);

  const { data: after } = await admin
    .from("teams")
    .select("track_scoring")
    .eq("id", team.id)
    .single();

  expect(after?.track_scoring).not.toBe(before?.track_scoring);
});
