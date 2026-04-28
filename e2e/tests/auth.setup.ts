// Runs ONCE before any test spec in the suite (Playwright project
// `setup`). Responsibilities:
//   1. Create the deterministic super-admin via the admin API
//   2. Flip is_super_admin = true on their profile
//   3. Sign them in via the login form and save the cookie jar to
//      `playwright/.auth/super-admin.json`
//
// Every subsequent spec picks up that storageState via the `chromium`
// project config in playwright.config.ts — so no spec needs to log
// in itself, saving ~2s per test.
//
// The UI-sign-in approach is deliberate over cookie injection: it
// verifies the real auth path works and means tests don't drift from
// what users experience.

import { test as setup, expect } from "@playwright/test";
import { createAdminClient, ensureTestUser } from "../fixtures/supabase";
import path from "node:path";

const authFile = path.resolve(__dirname, "../../playwright/.auth/super-admin.json");

setup("authenticate as super-admin", async ({ page }) => {
  const email = process.env.TEST_SUPER_ADMIN_EMAIL;
  const password = process.env.TEST_SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "TEST_SUPER_ADMIN_EMAIL and TEST_SUPER_ADMIN_PASSWORD must be set. " +
        "Run via `npm run e2e` so scripts/e2e-setup.mjs loads .env.test."
    );
  }

  // Step 1–2: ensure the user exists + has super-admin flag.
  const admin = createAdminClient();
  await ensureTestUser(admin, {
    email,
    password,
    fullName: "Super Admin",
    superAdmin: true,
  });

  // Step 3: sign in through the UI. This exercises the real auth path —
  // if LoginForm breaks, setup fails loudly instead of masking the bug.
  //
  // /login defaults to magic-link mode (email-only field, "Continue"
  // button). For the deterministic CI auth path we want password
  // sign-in, which requires clicking the "Sign in with password
  // instead" toggle to reveal the password field. The toggle is a
  // stable data-testid hook so this doesn't drift if the link copy
  // is reworded.
  await page.goto("/login");
  await page.getByTestId("login-mode-toggle").click();
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();

  // Landing page after login is /dashboard. If the server redirects
  // somewhere else (e.g. /onboarding for new accounts), update this.
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  await expect(page).toHaveURL(/\/dashboard/);

  // Persist the cookie jar for every downstream spec.
  await page.context().storageState({ path: authFile });
});
