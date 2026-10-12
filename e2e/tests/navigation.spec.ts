// Covers team navigation (UX plan 1.8): a bottom tab bar on phones,
// hidden on full-screen game modes, and the team switcher in the header.
//
// Covers: src/components/team/TeamBottomBar.tsx,
//         src/components/layout/TeamSwitcher.tsx, src/lib/nav.ts

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makeGame } from "../fixtures/factories";
import type { SupabaseClient } from "@supabase/supabase-js";

test.describe.configure({ mode: "parallel" });
test.use({ viewport: { width: 390, height: 844 } });

async function superAdminId(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

test("phones get a bottom tab bar that hides on the game-day screen", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  await page.goto(`/teams/${team.id}`);
  const bar = page.getByRole("navigation", { name: /team sections/i });
  await expect(bar).toBeVisible({ timeout: 10_000 });
  for (const name of ["Today", "Games", "Squad", "Stats", "Team"]) {
    await expect(bar.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(bar.getByRole("link", { name: "Today", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await bar.getByRole("link", { name: "Team", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/teams/${team.id}/settings$`));

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByRole("button", { name: /^start q1$/i }).or(page.getByText(/who's here/i)).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("navigation", { name: /team sections/i })).toHaveCount(0);
});

test("the header team switcher moves between teams", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const a = await makeTeam(admin, { ownerId, ageGroup: "U10", name: `Switch A ${stamp}` });
  const b = await makeTeam(admin, { ownerId, ageGroup: "U12", name: `Switch B ${stamp}` });

  await page.goto(`/teams/${a.id}`);
  const switcher = page.getByRole("button", { name: new RegExp(`switch team.*${a.name}`, "i") });
  await expect(switcher).toBeVisible({ timeout: 10_000 });
  await switcher.click();
  await page.getByRole("menuitem", { name: new RegExp(b.name) }).click();
  await expect(page).toHaveURL(new RegExp(`/teams/${b.id}$`));
});
