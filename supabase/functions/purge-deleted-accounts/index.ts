// ─── purge-deleted-accounts ─────────────────────────────────────
// Nightly purge of accounts whose grace period has elapsed. Required
// for App Store compliance (guideline 5.1.1(v)): users delete their
// account from inside the app, and the actual wipe must happen within
// "a reasonable time". Our soft-delete window is 30 days
// (src/lib/account/constants.ts); this function does the hard delete.
//
// For each profile where `deletion_scheduled_for <= now()`:
//   1. Walk admin memberships. For teams where this user is the sole
//      admin, delete the team (cascades players, games, events,
//      drafts, availability via FK ON DELETE CASCADE).
//   2. Hard-delete the auth user. Profiles + memberships +
//      device_tokens cascade automatically. Audit-trail pointers
//      (created_by, accepted_by, …) SET NULL per migration 0034.
//
// The logic mirrors src/lib/account/purge.ts — that's the Node
// equivalent used by the ad-hoc `npm run purge:accounts` script for
// dev/ops runs against any environment. Two copies because the Edge
// Function runs in Deno on Supabase's servers and can't import from
// the Next.js src tree.
//
// Schedule: invoked daily by `pg_cron` (see migration 0034 follow-up
// in supabase/cron/* or the Supabase dashboard → Database → Cron).
// Cron payload is empty — the function reads its own work queue from
// the profiles table.
//
// Auth: protected by the function-secret JWT pattern. Cron-triggered
// invocations send the service-role key in the Authorization header;
// requests without it 401. No public surface.
//
// Required Supabase secrets:
//   SUPABASE_URL              — auto-populated
//   SUPABASE_SERVICE_ROLE_KEY — auto-populated
//
// Manual invocation (dev):
//   curl -X POST "$SUPABASE_URL/functions/v1/purge-deleted-accounts" \
//        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

interface PurgeResult {
  userId: string;
  email: string | null;
  deletedTeamIds: string[];
  durationMs: number;
}

interface PurgeSummary {
  ok: true;
  scanned: number;
  purged: number;
  errors: Array<{ userId: string; error: string }>;
  results: PurgeResult[];
}

function isAuthorised(req: Request): boolean {
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  return bearer === expected;
}

async function purgeOne(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<PurgeResult> {
  const start = Date.now();

  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  const { data: memberships } = await admin
    .from("team_memberships")
    .select("team_id, role")
    .eq("user_id", userId);

  const deletedTeamIds: string[] = [];
  for (const m of (memberships ?? []) as Array<{
    team_id: string;
    role: string;
  }>) {
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
        console.error(
          `[purge ${userId}] team ${m.team_id} delete failed: ${error.message}`,
        );
        continue;
      }
      deletedTeamIds.push(m.team_id);
    }
  }

  const { error: delError } = await admin.auth.admin.deleteUser(userId);
  if (delError && !/not[_ ]found/i.test(delError.message)) {
    throw new Error(
      `auth.admin.deleteUser(${userId}) failed: ${delError.message}`,
    );
  }

  return {
    userId,
    email: (profile as { email?: string } | null)?.email ?? null,
    deletedTeamIds,
    durationMs: Date.now() - start,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  if (!isAuthorised(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing SUPABASE_URL / KEY" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Pull every profile whose grace period has elapsed. The partial
  // index on profiles.deletion_scheduled_for keeps this O(matching).
  const nowIso = new Date().toISOString();
  const { data: due, error: scanError } = await admin
    .from("profiles")
    .select("id, email")
    .not("deletion_scheduled_for", "is", null)
    .lte("deletion_scheduled_for", nowIso);
  if (scanError) {
    return new Response(
      JSON.stringify({ ok: false, error: scanError.message }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const candidates = (due ?? []) as Array<{ id: string; email: string }>;
  const results: PurgeResult[] = [];
  const errors: Array<{ userId: string; error: string }> = [];

  for (const profile of candidates) {
    try {
      const r = await purgeOne(admin, profile.id);
      results.push(r);
      console.log(
        `[purge] ${profile.email} (${profile.id}) — teams: ${r.deletedTeamIds.length}, ${r.durationMs}ms`,
      );
    } catch (e) {
      const msg = (e as Error).message;
      errors.push({ userId: profile.id, error: msg });
      console.error(`[purge] ${profile.id} failed: ${msg}`);
    }
  }

  const summary: PurgeSummary = {
    ok: true,
    scanned: candidates.length,
    purged: results.length,
    errors,
    results,
  };
  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
