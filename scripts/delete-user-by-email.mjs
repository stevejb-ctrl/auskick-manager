// Ad-hoc cleanup: delete a user by email. Removes their team
// memberships and any teams they were the sole admin of, then
// deletes the auth user. Intended for tearing down test accounts
// so signup / invite flows can be re-tried end-to-end.
//
// Usage:  node scripts/delete-user-by-email.mjs <email>

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
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/delete-user-by-email.mjs <email>");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Find the user. listUsers() is paginated; iterate until we find the
// match or run out of pages.
async function findUser(targetEmail) {
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === targetEmail.toLowerCase()
    );
    if (hit) return hit;
    if (data.users.length < perPage) return null;
    page++;
  }
}

const user = await findUser(email);
if (!user) {
  console.log(`No user found with email ${email}`);
  process.exit(0);
}
console.log(`Found user ${user.id} (${user.email})`);

// Clean up team_memberships. If this user was the sole admin of a
// team, also delete the team (cascade takes care of players, games,
// etc). Otherwise just drop the membership.
const { data: memberships } = await admin
  .from("team_memberships")
  .select("team_id, role")
  .eq("user_id", user.id);

for (const m of memberships ?? []) {
  if (m.role === "admin") {
    const { count } = await admin
      .from("team_memberships")
      .select("*", { count: "exact", head: true })
      .eq("team_id", m.team_id)
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      console.log(`  - sole admin of team ${m.team_id}; deleting team`);
      const { error } = await admin.from("teams").delete().eq("id", m.team_id);
      if (error) console.error(`    team delete failed: ${error.message}`);
      continue;
    }
  }
  console.log(`  - dropping membership in team ${m.team_id} (${m.role})`);
  await admin
    .from("team_memberships")
    .delete()
    .eq("user_id", user.id)
    .eq("team_id", m.team_id);
}

// Any invites they created or accepted should survive (they're
// team-scoped), but null out the created_by / accepted_by references
// so FK constraints don't block the auth user delete.
await admin.from("team_invites").update({ created_by: null }).eq("created_by", user.id);
await admin.from("team_invites").update({ accepted_by: null }).eq("accepted_by", user.id);

// Finally, the auth user. Cascades on profiles.
const { error: delError } = await admin.auth.admin.deleteUser(user.id);
if (delError) {
  console.error(`deleteUser failed: ${delError.message}`);
  process.exit(1);
}
console.log(`Deleted auth user ${user.id}`);
