// Minimum-viable end-to-end smoke test. Proves the whole harness —
// Supabase container, Next.js server, Playwright worker, storageState
// auth, and the super-admin route guard — wires up end-to-end. If this
// goes red, no other spec is worth looking at.
//
// The test is intentionally thin: navigate to /admin (a super-admin-only
// route) and assert one label from the KPI card grid renders. We're not
// exercising business logic here — just proving the plumbing.

import { test, expect } from "@playwright/test";

test("super-admin loads /admin and sees the KPI grid", async ({ page }) => {
  await page.goto("/admin");

  // Route guard: if storageState missing or profile.is_super_admin flag
  // didn't stick, /admin would 404 or redirect. Asserting the URL after
  // navigation catches both cases.
  await expect(page).toHaveURL(/\/admin$/);

  // KpiCard exposes a stable `data-testid="admin-kpi-{slug}"` per
  // card. Using it sidesteps the ambiguity from `getByText("Users")`
  // — there are AdminTabBar nav links AND DataTable column headers
  // also labelled "Users"/"Teams"/"Games" using the same eyebrow
  // styling.
  await expect(page.getByTestId("admin-kpi-users")).toBeVisible();
  await expect(page.getByTestId("admin-kpi-teams")).toBeVisible();
  await expect(page.getByTestId("admin-kpi-games")).toBeVisible();
});
