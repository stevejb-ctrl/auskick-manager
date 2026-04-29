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

  // The AdminTabBar contains nav links also labelled "Users" / "Teams"
  // / "Games" — `getByText("Users", { exact: true })` matches both the
  // tab link AND the KPI card label, which trips Playwright's strict
  // mode. Match the KPI labels by their style fingerprint
  // (uppercase + tracking-micro = the eyebrow class only used by the
  // KpiCard) so we end up at exactly one element per label.
  const kpiLabel = (label: string) =>
    page.locator(".tracking-micro", { hasText: new RegExp(`^${label}$`) });
  await expect(kpiLabel("Users")).toBeVisible();
  await expect(kpiLabel("Teams")).toBeVisible();
  await expect(kpiLabel("Games")).toBeVisible();
});
