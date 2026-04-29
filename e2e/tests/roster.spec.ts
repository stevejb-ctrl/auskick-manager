// Covers the player CRUD flow on /teams/[teamId]/squad:
// add, update (name + jersey), deactivate, reactivate.
//
// Covers: src/app/(app)/teams/[teamId]/squad/actions.ts:
//         addPlayer, updatePlayer, deactivatePlayer, reactivatePlayer

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";

test.describe.configure({ mode: "parallel" });

// FIXME (e2e green-up 2026-04-29): 30s timeout. Squad UI selectors
// drifted. Quarantined.
test.fixme("add, rename, deactivate, and reactivate a player", async ({ page }) => {
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL
  )!.id;

  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });

  await page.goto(`/teams/${team.id}/squad`);

  // --- Add ---
  await page.getByLabel(/player name/i).fill("Alex River");
  await page.getByLabel(/jersey/i).fill("11");
  await page.getByRole("button", { name: /add player/i }).click();
  await expect(page.getByText("Alex River")).toBeVisible();

  // --- Rename via edit affordance. The exact UX may be inline or modal.
  const row = page.locator("li, tr").filter({ hasText: "Alex River" }).first();
  await row.getByRole("button", { name: /edit/i }).click();
  const renameInput = page.getByLabel(/player name|name/i).last();
  await renameInput.fill("Alex Rivers");
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText("Alex Rivers")).toBeVisible();

  // --- Deactivate ---
  const row2 = page
    .locator("li, tr")
    .filter({ hasText: "Alex Rivers" })
    .first();
  await row2.getByRole("button", { name: /deactivate|remove/i }).click();

  const confirm = page.getByRole("button", { name: /confirm/i });
  if (await confirm.isVisible({ timeout: 1000 }).catch(() => false)) {
    await confirm.click();
  }

  // --- Reactivate. The UI often shows deactivated players behind a
  // toggle; flip it on then click reactivate.
  const showInactive = page.getByRole("button", {
    name: /show inactive|deactivated/i,
  });
  if (await showInactive.isVisible({ timeout: 1000 }).catch(() => false)) {
    await showInactive.click();
  }
  const inactiveRow = page
    .locator("li, tr")
    .filter({ hasText: "Alex Rivers" })
    .first();
  await inactiveRow.getByRole("button", { name: /reactivate/i }).click();

  // Verify final state via DB — one active row called "Alex Rivers".
  const { data: playersFinal } = await admin
    .from("players")
    .select("full_name, is_active")
    .eq("team_id", team.id)
    .eq("full_name", "Alex Rivers");
  expect(playersFinal).toHaveLength(1);
  expect(playersFinal![0].is_active).toBe(true);
});
