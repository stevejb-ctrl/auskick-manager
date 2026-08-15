// Regression guard for the profiles privilege-escalation hole (audit 2026-07).
//
// The "profiles: update own" RLS policy (migration 0001) has no WITH CHECK,
// so it limits WHICH ROW a user may update but not WHICH COLUMNS. Before
// migration 0049 a normal authenticated user could PATCH their own profile
// row setting is_super_admin = true and gain the app's super-admin gate.
// Migration 0049 adds a BEFORE UPDATE trigger that pins is_super_admin for
// the authenticated/anon roles. This test drives the exact escalation vector
// through an authenticated Supabase client (anon key + the user's own JWT —
// what an attacker hitting the public REST API would do) and asserts the flag
// never flips.
//
// Red-first: against the pre-0049 schema the update succeeds and the flag
// becomes true, so the final assertion fails. Post-0049 it stays false.

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
} from "../fixtures/supabase";

test.describe.configure({ mode: "parallel" });

test("a normal user cannot promote themselves to super-admin", async () => {
  const admin = createAdminClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Run via `npm run e2e` so scripts/e2e-setup.mjs loads the env.",
    );
  }

  const user = await createTestUser(admin, {
    email: `esc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@siren.test`,
    password: "escalation-test-pw-1234",
    fullName: "Escalation Attempt",
  });

  try {
    // Authenticate as the normal user: anon key + their JWT.
    const userClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await userClient.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    expect(signInError).toBeNull();

    // The attack: set is_super_admin = true on my own row. RLS's
    // USING (id = auth.uid()) permits the row; the escalation must still
    // be blocked at the column level by the 0049 trigger.
    await userClient
      .from("profiles")
      .update({ is_super_admin: true })
      .eq("id", user.id);

    // Verify with the service-role client that the flag never flipped.
    const { data: after } = await admin
      .from("profiles")
      .select("is_super_admin")
      .eq("id", user.id)
      .single();
    expect(after?.is_super_admin).toBe(false);
  } finally {
    await deleteTestUser(admin, user.id);
  }
});
