// Supabase client + helper functions used only by the e2e test harness.
//
// Runtime expectation: these run in Node (Playwright workers), not in a
// browser, so we use the plain `@supabase/supabase-js` client rather
// than the SSR client from `@/lib/supabase/server.ts`. That also means
// we don't need cookies — the service-role key is passed directly.
//
// All exported helpers take a `SupabaseClient` as their first arg and
// return typed data. The one exception is `createAdminClient` itself,
// which constructs the client from env vars populated by e2e-setup.mjs.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Run tests via `npm run e2e` so scripts/e2e-setup.mjs loads .env.test."
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

/**
 * Create an auth user + profile via the admin API. `email_confirm: true`
 * skips the magic-link confirmation step so tests can log in immediately.
 *
 * Caller is responsible for deleting the user after their test (or
 * letting `supabase db reset` wipe everything between runs).
 */
export async function createTestUser(
  admin: SupabaseClient,
  opts: {
    email: string;
    password: string;
    fullName?: string;
    superAdmin?: boolean;
  }
): Promise<TestUser> {
  const { data, error } = await admin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
    user_metadata: { full_name: opts.fullName ?? "Test User" },
  });
  if (error || !data.user) {
    throw new Error(`createTestUser failed: ${error?.message ?? "no user"}`);
  }

  if (opts.superAdmin) {
    // The `handle_new_user` trigger runs on auth.users insert and creates
    // the profile row with is_super_admin defaulting to false. Flip it now.
    const { error: flipError } = await admin
      .from("profiles")
      .update({ is_super_admin: true })
      .eq("id", data.user.id);
    if (flipError) {
      throw new Error(`setting is_super_admin failed: ${flipError.message}`);
    }
  }

  return {
    id: data.user.id,
    email: opts.email,
    password: opts.password,
  };
}

/**
 * Delete a test user + cascade (profile, memberships, teams created by
 * them, players, games, events). Relies on the ON DELETE CASCADE chain
 * defined in migration 0001.
 */
export async function deleteTestUser(
  admin: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error && !error.message.includes("not found")) {
    throw new Error(`deleteTestUser failed: ${error.message}`);
  }
}

/**
 * Idempotent version of createTestUser — returns the existing user if
 * one with this email already exists. Used in global setup for the
 * super-admin, who should persist across test re-runs on the same
 * DB (until the next `supabase db reset`).
 */
export async function ensureTestUser(
  admin: SupabaseClient,
  opts: { email: string; password: string; fullName?: string; superAdmin?: boolean }
): Promise<TestUser> {
  // Supabase admin API doesn't expose a "get by email" directly; list
  // and filter. Safe at tiny user counts (<100) in a test DB.
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  const existing = data.users.find((u) => u.email === opts.email);
  if (existing) {
    if (opts.superAdmin) {
      await admin
        .from("profiles")
        .update({ is_super_admin: true })
        .eq("id", existing.id);
    }
    return { id: existing.id, email: opts.email, password: opts.password };
  }
  return createTestUser(admin, opts);
}
