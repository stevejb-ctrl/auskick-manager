// ensureTestUser is what auth.setup.ts runs at the start of every e2e
// run. Several sessions share one local Supabase, so a second run's
// setup must not sign the first run out. It used to reset the password
// every time, and GoTrue deletes every session a user has when their
// password changes. The first run's storageState went dead mid-run and
// its specs landed on /login across the suite.
//
// Each test makes its own user, never the shared super-admin, so a red
// run here can't sign the rest of the suite out.

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  ensureTestUser,
} from "../fixtures/supabase";

test.describe.configure({ mode: "parallel" });

// Start signed out; each test signs its own user in.
test.use({ storageState: { cookies: [], origins: [] } });

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("login-mode-toggle").click();
  await page.getByTestId("login-password").waitFor({ state: "visible" });
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

test("a second run's setup leaves the first run's session signed in", async ({ page }) => {
  const admin = createAdminClient();
  const opts = {
    email: `ensure-user-${Date.now()}@siren.test`,
    password: "pw-test-12345",
    fullName: "Ensure User",
    superAdmin: true,
  };
  const user = await ensureTestUser(admin, opts);
  try {
    // First run: setup signs in through the UI, as auth.setup does.
    await signIn(page, opts.email, opts.password);

    // Second run: its setup ensures the same user again.
    await ensureTestUser(admin, opts);

    // The first run's cookies still get past the super-admin guard.
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId("admin-kpi-users")).toBeVisible();
  } finally {
    await deleteTestUser(admin, user.id);
  }
});

test("a password that drifted from .env.test is put back", async () => {
  // `supabase db reset` keeps auth.users, so the super-admin can carry
  // a password from an older .env.test. ensureTestUser must still
  // leave the user able to sign in with the current one.
  const admin = createAdminClient();
  const email = `ensure-drift-${Date.now()}@siren.test`;
  const user = await createTestUser(admin, { email, password: "pw-old-12345" });
  try {
    await ensureTestUser(admin, { email, password: "pw-new-12345" });

    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await anon.auth.signInWithPassword({ email, password: "pw-new-12345" });
    expect(error).toBeNull();
    await anon.auth.signOut({ scope: "local" });
  } finally {
    await deleteTestUser(admin, user.id);
  }
});
