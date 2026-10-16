// Form controls a screen reader (or voice control) can name. Round 5's
// route crawl found these with no accessible name: the team-name field
// (a heading above it, no label), the admin tag form's Name and Colour
// (labels not tied to their fields), and an admin user's note box and
// "Unsubscribed from email" switch.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";

test("settings and admin controls have accessible names", async ({ page }) => {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers();
  const ownerId = data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });

  await page.goto(`/teams/${team.id}/settings`);
  await expect(page.getByRole("textbox", { name: "Team name" })).toBeVisible({ timeout: 15_000 });

  await page.goto("/admin/tags");
  await expect(page.getByRole("textbox", { name: "Name" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("combobox", { name: "Colour" })).toBeVisible();

  await page.goto(`/admin/users/${ownerId}`);
  await expect(page.getByRole("switch", { name: /unsubscribed from email/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("textbox", { name: /note/i })).toBeVisible();
});
