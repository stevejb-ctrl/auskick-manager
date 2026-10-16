// Covers team navigation (UX plan 1.8): a bottom tab bar on phones,
// hidden on full-screen game modes, and the team switcher in the header.
//
// Covers: src/components/team/TeamBottomBar.tsx,
//         src/components/layout/TeamSwitcher.tsx, src/lib/nav.ts

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makeGame } from "../fixtures/factories";
import { gotoStable } from "../helpers/navigation";
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
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
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

  // The tab bar's client navigation can still be landing (WebKit), so a
  // plain goto here is interrupted by it.
  await gotoStable(page, `/teams/${team.id}/games/${game.id}/live`);
  await expect(page.getByRole("button", { name: /^start q1$/i }).or(page.getByText(/who's here/i)).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("navigation", { name: /team sections/i })).toHaveCount(0);
});

test("the header team switcher moves between teams", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const a = await makeTeam(admin, { ownerId, ageGroup: "U10", name: `Switch A ${stamp}`, sport: "afl" });
  const b = await makeTeam(admin, { ownerId, ageGroup: "U12", name: `Switch B ${stamp}`, sport: "afl" });

  await page.goto(`/teams/${a.id}`);
  const switcher = page.getByRole("button", { name: new RegExp(`switch team.*${a.name}`, "i") });
  await expect(switcher).toBeVisible({ timeout: 10_000 });
  await switcher.click();
  await page.getByRole("menuitem", { name: new RegExp(b.name) }).click();
  await expect(page).toHaveURL(new RegExp(`/teams/${b.id}$`));
});

// Help opens from the avatar menu inside the app; a signed-in coach
// used to land on a marketing header whose only link was "Sign in"
// (UX plan 2.5). Signed out, the Sign in link stays.
test("Help gives a signed-in coach a way back to the app", async ({ page }) => {
  await page.goto("/help/live-game");
  const back = page.getByRole("banner").getByRole("link", { name: /back to siren/i });
  await expect(back).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await back.click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("Help keeps Sign in for visitors", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/help");
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible({
    timeout: 10_000,
  });
});

// UX plan Phase 6: one back affordance — a chevron link top-left, 44 pt.
test("pages share one back link", async ({ page }) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10", sport: "afl" });
  const game = await makeGame(admin, { teamId: team.id, ownerId });

  await page.goto(`/teams/${team.id}/games/${game.id}`);
  const back = page.getByTestId("back-link");
  await expect(back).toHaveText("Games");
  await expect(back).toBeVisible({ timeout: 15_000 });
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await back.click();
  await expect(page).toHaveURL(new RegExp(`/teams/${team.id}/games$`));
});
