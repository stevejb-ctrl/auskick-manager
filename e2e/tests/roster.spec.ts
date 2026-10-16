// Covers the player CRUD flow on /teams/[teamId]/squad:
// add, update (name + jersey), deactivate, reactivate.
//
// Covers: src/app/(app)/teams/[teamId]/squad/actions.ts:
//         addPlayer, updatePlayer, deactivatePlayer, reactivatePlayer

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";
import { waitForAdminHydration } from "../helpers/admin-hydration";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

test("add, rename, deactivate, and reactivate a player", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });

  await page.goto(`/teams/${team.id}/squad`);
  await waitForHydration(page);

  // ── Add ────────────────────────────────────────────────────
  // AddPlayerForm has proper labels: "Player name" + "Jersey #".
  await page.getByLabel(/player name/i).fill("Alex River");
  await page.getByLabel(/jersey/i).fill("11");
  await page.getByRole("button", { name: /^add player$/i }).click();
  await expect(page.getByText("Alex River")).toBeVisible();

  // ── Rename ─────────────────────────────────────────────────
  // The test creates exactly one player on a fresh team, so there's
  // exactly one <li> on the squad list — no need to filter by name
  // (which would break in edit mode anyway: the row's text content
  // shifts from the rendered name to button labels + input values
  // once `editing=true`).
  const row = page.getByRole("listitem");
  await row.getByRole("button", { name: /^edit$/i }).click();
  // Inside the row in edit mode: textbox[0] = name, textbox[1] = jersey.
  const nameInput = row.getByRole("textbox").first();
  await nameInput.fill("Alex Rivers");
  await row.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText("Alex Rivers")).toBeVisible();

  // ── Deactivate ─────────────────────────────────────────────
  // Toggle role="switch" with aria-label "Deactivate player" when
  // active. Single-row page → no filter needed.
  //
  // Wait for admin-membership hydration — see e2e/helpers/admin-hydration.ts.
  const deactivateSwitch = page.getByRole("switch", { name: /deactivate player/i });
  await waitForAdminHydration(deactivateSwitch);
  await deactivateSwitch.click();

  // Wait for the row to reappear in the inactive section. PlayerList
  // renders an "Inactive" SFCard automatically when any inactive
  // players exist — there's no "show inactive" toggle to click.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("players")
          .select("is_active")
          .eq("team_id", team.id)
          .eq("full_name", "Alex Rivers")
          .single();
        return data?.is_active;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(false);

  // ── Reactivate ─────────────────────────────────────────────
  // Same Toggle, aria-label is now "Reactivate player". Player
  // moved to the inactive section but is still the only <li> on
  // the page.
  //
  // Wait for admin-membership hydration — see e2e/helpers/admin-hydration.ts.
  const reactivateSwitch = page.getByRole("switch", { name: /reactivate player/i });
  await waitForAdminHydration(reactivateSwitch);
  await reactivateSwitch.click();

  // ── Verify final state via DB ──────────────────────────────
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("players")
          .select("full_name, is_active")
          .eq("team_id", team.id)
          .eq("full_name", "Alex Rivers")
          .single();
        return data?.is_active;
      },
      { timeout: 5_000, intervals: [200, 200, 500, 500, 1000] },
    )
    .toBe(true);
});

// UX plan 2.2: adding a squad one form at a time took ~3 fields × 18
// kids. Pasting a list adds everyone in one go, after a preview.
test("pasting a list adds the whole squad at once", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });

  await page.goto(`/teams/${team.id}/squad`);
  await waitForHydration(page);
  await page.getByRole("button", { name: /^paste a list$/i }).click();
  await page
    .getByLabel(/paste your squad/i)
    .fill("Ava Smith #3\n7 Ben Jones\nCara Lee, 12");
  await expect(page.getByText(/3 players:/i)).toBeVisible();
  await page.getByRole("button", { name: /^add 3 players$/i }).click();
  await expect(page.getByRole("status").filter({ hasText: /added 3 players/i })).toBeVisible({
    timeout: 10_000,
  });

  const { data: rows } = await admin
    .from("players")
    .select("full_name, jersey_number")
    .eq("team_id", team.id)
    .order("jersey_number");
  expect(rows).toEqual([
    { full_name: "Ava Smith", jersey_number: 3 },
    { full_name: "Ben Jones", jersey_number: 7 },
    { full_name: "Cara Lee", jersey_number: 12 },
  ]);
});

// Round 5 (team-admin mission, checked in code): reactivating a player
// into a full squad was refused by the server, but the row ignored the
// answer — the switch just flipped back with no reason given.
test("reactivating into a full squad says why it didn't work", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" }); // 20-kid squad
  const { error } = await admin.from("players").insert([
    ...Array.from({ length: 20 }, (_, i) => ({
      team_id: team.id,
      full_name: `Kid ${i + 1}`,
      jersey_number: i + 1,
      is_active: true,
      created_by: ownerId,
    })),
    { team_id: team.id, full_name: "Benched Bo", jersey_number: 21, is_active: false, created_by: ownerId },
  ]);
  if (error) throw new Error(error.message);

  await page.goto(`/teams/${team.id}/squad`);
  await waitForHydration(page);
  const row = page.getByRole("listitem").filter({ hasText: "Benched Bo" });
  const reactivate = row.getByRole("switch", { name: /reactivate player/i });
  await waitForAdminHydration(reactivate);
  await reactivate.click();
  await expect(row.getByRole("alert")).toContainText(/squad is full/i);
});

// Round 5 (coach-onboarding, team-admin): "Name is required" stayed up
// while the coach typed the name, until the next Add — it read as the
// typing not taking.
test("the add-player name error clears once a name is typed", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });

  await page.goto(`/teams/${team.id}/squad`);
  await waitForHydration(page);
  await page.getByRole("button", { name: /^add player$/i }).click();
  await expect(page.getByText("Name is required.")).toBeVisible();
  await page.getByLabel(/player name/i).fill("Sam");
  await expect(page.getByText("Name is required.")).toHaveCount(0);
});

// Jersey numbers are the sport's call, made once (cross-sport audit,
// 14 Oct 2026). The squad page showed them for AFL only while setup,
// availability and the live screens showed them for league too, so a
// league coach could set a number in setup and never see it again.
for (const [sport, ageGroup, jerseys] of [
  ["afl", "U10", true],
  ["rugby_league", "U11", true],
  ["netball", "11u", false],
] as const) {
  test(`${sport}: the squad page ${jerseys ? "shows" : "hides"} jersey numbers`, async ({ page }) => {
    const admin = createAdminClient();
    const { data: superAdmin } = await admin.auth.admin.listUsers();
    const ownerId = superAdmin.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
    const team = await makeTeam(admin, { ownerId, ageGroup, sport });
    await admin.from("players").insert({ team_id: team.id, full_name: "Jo Number", jersey_number: 27, created_by: ownerId });

    await page.goto(`/teams/${team.id}/squad`);
    await waitForHydration(page);
    await expect(page.getByText("Jo Number")).toBeVisible();
    await expect(page.getByLabel(/jersey #/i)).toHaveCount(jerseys ? 1 : 0);
    await expect(page.getByRole("listitem").filter({ hasText: "Jo Number" }).getByText("27", { exact: true })).toHaveCount(
      jerseys ? 1 : 0,
    );
  });
}
