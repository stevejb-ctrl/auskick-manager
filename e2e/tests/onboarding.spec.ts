// Covers the "first five minutes" flow for a brand-new coach:
// sign up → land on dashboard → create team → add first player.
//
// This spec is the app's reliability canary for new-user activation.
// If it breaks, nobody new can get started.

import { test, expect } from "@playwright/test";
import { createAdminClient, deleteTestUser } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";
import type { SupabaseClient } from "@supabase/supabase-js";

async function superAdminId(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
}

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
    // --- Account creation + sign-in ---
    // The signup UI was collapsed into the unified email-first /login
    // flow, which sends a magic link — we can't click magic links in
    // headless Playwright. Instead we provision the user via the admin
    // SDK and sign in using the password fallback toggle on /login.
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (createErr) throw createErr;
    userId = created.user?.id ?? null;
    expect(userId).not.toBeNull();

    await page.goto("/login");
    await page.getByTestId("login-mode-toggle").click();
    // LoginForm's inputs are unlabelled at the DOM level (LoginField
    // wraps them but the label association isn't exposed to a11y), so
    // testids are the reliable hook.
    await page.getByTestId("login-email").fill(email);
    await page.getByTestId("login-password").fill(password);
    await page.getByTestId("login-submit").click();

    // Sign-in lands on either /dashboard or /teams/new (no teams yet).
    await page.waitForURL(/\/(dashboard|teams\/new)/, { timeout: 15_000 });

    // --- Create team ---
    if (!page.url().includes("/teams/new")) {
      await page.goto("/teams/new");
    }
    const teamName = `Roos ${stamp}`;
    await page.getByLabel(/team name/i).fill(teamName);
    await page.getByLabel(/age group/i).selectOption("U10");
    await page.getByRole("button", { name: /continue/i }).click();

    // Setup flow lands on /teams/[id]/setup[?]step=config or similar.
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

// Regression (UX plan C2): createGame always redirected to game detail,
// so a coach who created a game inside the setup wizard was ejected and
// never reached "All set" (invite co-coach, share availability).
test("creating a game inside the wizard stays in the wizard and reaches All set", async ({
  page,
}) => {
  const admin = createAdminClient();
  const ownerId = await superAdminId(admin);
  const team = await makeTeam(admin, { ownerId, ageGroup: "U10" });

  await page.goto(`/teams/${team.id}/setup?step=games`);
  await page.getByRole("button", { name: /create manually/i }).click();
  await page.getByLabel(/opponent/i).fill("Wizard Wombats");
  await page.getByLabel(/date & time/i).fill("2026-11-01T09:00");
  await page.getByRole("button", { name: /^create game$/i }).click();

  await expect(page).toHaveURL(new RegExp(`/teams/${team.id}/setup[?]step=games`), {
    timeout: 10_000,
  });
  await expect(page.getByText("vs Wizard Wombats")).toBeVisible();

  await page.getByRole("link", { name: /^continue$/i }).click();
  await expect(page).toHaveURL(new RegExp(`/teams/${team.id}/setup[?]step=done`));
});
