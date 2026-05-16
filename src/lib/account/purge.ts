// Hard-delete logic for user accounts. Runs at two call sites:
//
//   1. The nightly Supabase Edge Function
//      `purge-deleted-accounts` (supabase/functions/purge-deleted-accounts).
//      It finds profiles whose `deletion_scheduled_for` has passed and
//      calls `purgeUserAccount` on each.
//
//   2. The ad-hoc Node script `scripts/purge-deleted-accounts.mjs`,
//      which dev / ops can run by hand against any environment to
//      drain the queue immediately (useful for manual testing,
//      App Review reviewer accounts, or a stuck cron).
//
// Both call sites use a service-role Supabase client (RLS bypassed).
// The application layer (user-facing /account page) only ever toggles
// the schedule columns — never invokes this directly.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PurgeResult {
  userId: string;
  email: string | null;
  deletedTeamIds: string[];
  durationMs: number;
}

/**
 * Hard-delete one user. Sole-admin teams are deleted (cascading
 * players, games, events, drafts, availability) BEFORE the auth
 * user goes so the teams don't end up orphaned with no admin and
 * `created_by` nulled out.
 *
 * Everything else — `team_memberships`, `profiles`, `device_tokens` —
 * cascades automatically when the auth user is removed. Audit-trail
 * pointers (`games.created_by`, `team_invites.accepted_by`, etc.)
 * become NULL per migration 0034.
 *
 * Idempotent: if the auth user is already gone, the deleteUser call
 * returns a "not found" error which we treat as success.
 */
export async function purgeUserAccount(
  admin: SupabaseClient,
  userId: string,
): Promise<PurgeResult> {
  const start = Date.now();

  // Look up email up front so the cron log can show a human-readable
  // identity even after the row is gone.
  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle<{ email: string }>();

  // 1. Walk this user's admin memberships. For each team where they
  //    are the sole admin, delete the team. Teams with co-admins are
  //    left intact — the user's membership row will cascade away when
  //    the auth user is removed, leaving the other admin(s) in charge.
  const { data: memberships } = await admin
    .from("team_memberships")
    .select("team_id, role")
    .eq("user_id", userId);

  const deletedTeamIds: string[] = [];
  for (const m of memberships ?? []) {
    if (m.role !== "admin") continue;
    const { count } = await admin
      .from("team_memberships")
      .select("*", { count: "exact", head: true })
      .eq("team_id", m.team_id)
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      const { error } = await admin
        .from("teams")
        .delete()
        .eq("id", m.team_id);
      if (error) {
        // Don't abort the whole purge for one team — log and continue.
        // Common cause: a co-admin was added between the count above
        // and the delete here; the team should stay.
        // eslint-disable-next-line no-console
        console.error(
          `[purgeUserAccount] team ${m.team_id} delete failed: ${error.message}`,
        );
        continue;
      }
      deletedTeamIds.push(m.team_id);
    }
  }

  // 2. Hard-delete the auth user. Cascades profile -> memberships,
  //    device_tokens, profile_tags, contact_notes (profile_id),
  //    contact_preferences. Audit pointers SET NULL.
  const { error: delError } = await admin.auth.admin.deleteUser(userId);
  if (delError && !/not[_ ]found/i.test(delError.message)) {
    throw new Error(
      `auth.admin.deleteUser(${userId}) failed: ${delError.message}`,
    );
  }

  return {
    userId,
    email: profile?.email ?? null,
    deletedTeamIds,
    durationMs: Date.now() - start,
  };
}

/**
 * Find every profile whose grace period has elapsed. Used by the
 * nightly cron — returns an empty array on a quiet night.
 */
export async function findAccountsToPurge(
  admin: SupabaseClient,
): Promise<Array<{ id: string; email: string }>> {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("profiles")
    .select("id, email")
    .not("deletion_scheduled_for", "is", null)
    .lte("deletion_scheduled_for", nowIso);
  if (error) {
    throw new Error(`findAccountsToPurge: ${error.message}`);
  }
  return (data ?? []) as Array<{ id: string; email: string }>;
}
