// Covers the player CRUD flow on /teams/[teamId]/squad:
// add, update (name + jersey), deactivate, reactivate.
//
// Covers: src/app/(app)/teams/[teamId]/squad/actions.ts:
//         addPlayer, updatePlayer, deactivatePlayer, reactivatePlayer

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

test("add, rename, deactivate, and reactivate a player", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });

  await page.goto(`/teams/${team.id}/squad`);

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
  // Post-merge: the per-row Toggle disables itself for non-admins
  // (Toggle's `disabled={isPending || !isAdmin}`). Under parallel
  // workers we occasionally render before the membership-driven
  // `isAdmin` lookup has hydrated, leaving the switch [disabled] and
  // making the click a no-op. Wait for the admin-enabled state via a
  // Web-First assertion before clicking — same pattern landed in
  // settings.spec.ts (commit b014ef9) for the track-scoring toggle.
  const deactivateSwitch = page.getByRole("switch", { name: /deactivate player/i });
  await expect(deactivateSwitch).toBeEnabled({ timeout: 5_000 });
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
  // the page. Same admin-membership race guard as the deactivate
  // click above — see settings.spec.ts commit b014ef9 for the
  // pattern rationale.
  const reactivateSwitch = page.getByRole("switch", { name: /reactivate player/i });
  await expect(reactivateSwitch).toBeEnabled({ timeout: 5_000 });
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
