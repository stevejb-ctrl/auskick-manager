// Ad-hoc / dev runner for the account-purge flow. Mirrors the Edge
// Function `supabase/functions/purge-deleted-accounts` but runs in
// Node against any environment whose service-role key you have in
// `.env.local`. Useful for:
//
//   - Manual testing of the soft-delete → grace → purge loop without
//     waiting for the nightly cron.
//   - Draining the queue immediately if the cron is stuck.
//   - Purging a single user by ID (skip the deletion_scheduled_for
//     filter via `--user <uuid>`).
//
// Usage:
//   node scripts/purge-deleted-accounts.mjs                # purge all due
//   node scripts/purge-deleted-accounts.mjs --dry-run      # report only
//   node scripts/purge-deleted-accounts.mjs --user <uuid>  # one user
//
// The user-targeted mode does NOT check `deletion_scheduled_for` —
// it's a foot-gun that lets ops fix things by hand. Don't expose it
// to anything but a service-role key in a trusted shell.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, "..", ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const userIdx = args.indexOf("--user");
const targetUserId = userIdx >= 0 ? args[userIdx + 1] : null;

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function purgeOne(userId) {
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

  const deletedTeamIds = [];
  for (const m of memberships ?? []) {
    if (m.role !== "admin") continue;
    const { count } = await admin
      .from("team_memberships")
      .select("*", { count: "exact", head: true })
      .eq("team_id", m.team_id)
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      if (dryRun) {
        console.log(`  [dry-run] would delete team ${m.team_id}`);
        deletedTeamIds.push(m.team_id);
        continue;
      }
      const { error } = await admin
        .from("teams")
        .delete()
        .eq("id", m.team_id);
      if (error) {
        console.error(`  team ${m.team_id} delete failed: ${error.message}`);
        continue;
      }
      deletedTeamIds.push(m.team_id);
    }
  }

  if (dryRun) {
    return {
      userId,
      email: profile?.email ?? null,
      deletedTeamIds,
      durationMs: Date.now() - start,
      dryRun: true,
    };
  }

  const { error: delError } = await admin.auth.admin.deleteUser(userId);
  if (delError && !/not[_ ]found/i.test(delError.message)) {
    throw new Error(`deleteUser failed: ${delError.message}`);
  }

  return {
    userId,
    email: profile?.email ?? null,
    deletedTeamIds,
    durationMs: Date.now() - start,
  };
}

async function main() {
  let candidates;
  if (targetUserId) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, email")
      .eq("id", targetUserId)
      .maybeSingle();
    if (error) throw new Error(`profile lookup: ${error.message}`);
    candidates = data ? [data] : [];
  } else {
    const nowIso = new Date().toISOString();
    const { data, error } = await admin
      .from("profiles")
      .select("id, email")
      .not("deletion_scheduled_for", "is", null)
      .lte("deletion_scheduled_for", nowIso);
    if (error) throw new Error(`scan: ${error.message}`);
    candidates = data ?? [];
  }

  if (candidates.length === 0) {
    console.log("No accounts to purge.");
    return;
  }

  console.log(
    `${dryRun ? "[DRY RUN] " : ""}Purging ${candidates.length} account(s)…`,
  );
  for (const c of candidates) {
    console.log(`- ${c.email} (${c.id})`);
    try {
      const r = await purgeOne(c.id);
      console.log(
        `  ✓ teams deleted: ${r.deletedTeamIds.length}, ${r.durationMs}ms`,
      );
    } catch (e) {
      console.error(`  ✗ ${e.message}`);
    }
  }
}

await main();
