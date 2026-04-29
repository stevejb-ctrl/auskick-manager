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
  // Each PlayerRow is a <li>. Edit opens an inline form with two
  // bare <Input>s (no <label>). Scope all interactions to the row
  // so we never collide with other rows or the header form above.
  const row = page.getByRole("listitem").filter({ hasText: "Alex River" });
  await row.getByRole("button", { name: /^edit$/i }).click();
  // Inside the row in edit mode: textbox[0] = name, textbox[1] = jersey.
  const nameInput = row.getByRole("textbox").first();
  await nameInput.fill("Alex Rivers");
  await row.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText("Alex Rivers")).toBeVisible();

  // ── Deactivate ─────────────────────────────────────────────
  // PlayerRow renders a Toggle (role="switch") with aria-label
  // "Deactivate player" when active.
  const row2 = page.getByRole("listitem").filter({ hasText: "Alex Rivers" });
  await row2.getByRole("switch", { name: /deactivate player/i }).click();

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
  // Same Toggle, but aria-label is now "Reactivate player".
  const inactiveRow = page
    .getByRole("listitem")
    .filter({ hasText: "Alex Rivers" });
  await inactiveRow
    .getByRole("switch", { name: /reactivate player/i })
    .click();

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
