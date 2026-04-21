// Covers the "first five minutes" flow for a brand-new coach:
// sign up → land on dashboard → create team → add first player.
//
// This spec is the app's reliability canary for new-user activation.
// If it breaks, nobody new can get started.

import { test, expect } from "@playwright/test";
import { createAdminClient, deleteTestUser } from "../fixtures/supabase";

test.describe.configure({ mode: "parallel" });

test("new user signs up, creates team, adds first player", async ({
  browser,
}) => {
  // Use a clean context so we don't inherit the super-admin storageState.
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();

  // Unique email per run keeps tests isolated even if a previous run
  // failed before cleanup.
  const stamp = Date.now();
  const email = `onboarder-${stamp}@siren.test`;
  const password = "onboard-test-pw-1234";
  const admin = createAdminClient();
  let userId: string | null = null;

  try {
    // --- Signup ---
    await page.goto("/signup");
    await page.getByLabel(/full name/i).fill("New Coach");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password$/i).fill(password);
    await page.getByLabel(/confirm password/i).fill(password);
    await page.getByRole("button", { name: /create account/i }).click();

    // Signup lands on either /dashboard or /teams/new (no teams yet).
    await page.waitForURL(/\/(dashboard|teams\/new)/, { timeout: 15_000 });

    // Capture the created user id for cleanup.
    const { data } = await admin.auth.admin.listUsers();
    userId = data.users.find((u) => u.email === email)?.id ?? null;
    expect(userId).not.toBeNull();

    // --- Create team ---
    if (!page.url().includes("/teams/new")) {
      await page.goto("/teams/new");
    }
    const teamName = `Roos ${stamp}`;
    await page.getByLabel(/team name/i).fill(teamName);
    await page.getByLabel(/age group/i).selectOption("U10");
    await page.getByRole("button", { name: /continue/i }).click();

    // Setup flow lands on /teams/[id]/setup?step=config or similar.
    await page.waitForURL(/\/teams\/[0-9a-f-]+/, { timeout: 10_000 });

    // --- Add first player ---
    // Navigate to squad. The setup flow may have a "Skip to squad"
    // affordance, but a direct goto is always reliable.
    const teamUrlMatch = page.url().match(/\/teams\/([0-9a-f-]+)/);
    expect(teamUrlMatch).not.toBeNull();
    const teamId = teamUrlMatch![1];

    await page.goto(`/teams/${teamId}/squad`);
    await page.getByLabel(/player name/i).fill("Sam Smith");
    await page.getByLabel(/jersey/i).fill("7");
    await page.getByRole("button", { name: /add player/i }).click();

    // Player should appear in the list.
    await expect(page.getByText("Sam Smith")).toBeVisible({ timeout: 5_000 });
  } finally {
    if (userId) await deleteTestUser(admin, userId);
    await context.close();
  }
});
