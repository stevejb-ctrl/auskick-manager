// One-shot: find all teams named "Fitzroy Falcons" and keep only the
// newest one. The seed-app-review wipe step preserves teams with
// co-admins (so re-running the seeder after promoting stevejb@ to
// admin leaves the original team alive); this script cleans up the
// resulting duplicates.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(here, "..", ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const TEAM_NAME = "Fitzroy Falcons";

const { data: teams, error } = await admin
  .from("teams")
  .select("id, name, age_group, created_at")
  .eq("name", TEAM_NAME)
  .order("created_at", { ascending: false });

if (error) throw error;
if (!teams || teams.length === 0) {
  console.log(`No teams named "${TEAM_NAME}" found.`);
  process.exit(0);
}

console.log(`Found ${teams.length} team(s) named "${TEAM_NAME}":`);
for (const t of teams) {
  console.log(`  ${t.id} created_at=${t.created_at}`);
}

if (teams.length === 1) {
  console.log(`\nNothing to do — only one team. Exiting.`);
  process.exit(0);
}

// Keep [0] (newest), delete the rest.
const [keep, ...drop] = teams;
console.log(`\nKeeping: ${keep.id} (newest)`);
for (const t of drop) {
  const { error: dErr } = await admin.from("teams").delete().eq("id", t.id);
  if (dErr) {
    console.error(`  ✗ ${t.id}: ${dErr.message}`);
  } else {
    console.log(`  ✓ deleted ${t.id}`);
  }
}

console.log(`\nDone. ${TEAM_NAME} cleanup complete.`);
