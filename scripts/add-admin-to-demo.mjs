// One-shot: add a real user as an admin on the App Review demo team
// so they can clean up data / fix screenshots before submission.
//
// Idempotent: re-running upserts the membership row (so promoting a
// game_manager to admin works the same way).
//
// Usage:
//   node scripts/add-admin-to-demo.mjs <email>
//
// e.g.
//   node scripts/add-admin-to-demo.mjs stevejb@gmail.com

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
      return [
        l.slice(0, i).trim(),
        l.slice(i + 1).trim().replace(/^"|"$/g, ""),
      ];
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

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/add-admin-to-demo.mjs <email>");
  process.exit(1);
}

const DEMO_OWNER_EMAIL = "appreview@sirenfooty.com.au";
const DEMO_TEAM_NAME = "Fitzroy Falcons";

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUser(targetEmail) {
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === targetEmail.toLowerCase(),
    );
    if (hit) return hit;
    if (data.users.length < perPage) return null;
    page++;
  }
}

async function main() {
  const realUser = await findUser(email);
  if (!realUser) {
    console.error(
      `No user found with email ${email}. They need to sign up at ` +
        `https://www.sirenfooty.com.au/login first, then re-run this.`,
    );
    process.exit(1);
  }
  console.log(`Real user:    ${realUser.id} (${realUser.email})`);

  const demoOwner = await findUser(DEMO_OWNER_EMAIL);
  if (!demoOwner) {
    console.error(
      `No demo owner found at ${DEMO_OWNER_EMAIL}. ` +
        `Run \`npm run seed:app-review\` first.`,
    );
    process.exit(1);
  }
  console.log(`Demo owner:   ${demoOwner.id} (${demoOwner.email})`);

  // Find the Fitzroy Falcons team owned by the demo account.
  const { data: team, error: teamErr } = await admin
    .from("teams")
    .select("id, name")
    .eq("name", DEMO_TEAM_NAME)
    .eq("created_by", demoOwner.id)
    .maybeSingle();
  if (teamErr) throw new Error(`team lookup: ${teamErr.message}`);
  if (!team) {
    console.error(
      `No "${DEMO_TEAM_NAME}" team found. Re-run \`npm run seed:app-review\`.`,
    );
    process.exit(1);
  }
  console.log(`Demo team:    ${team.id} (${team.name})`);

  // Upsert membership — idempotent. The unique (team_id, user_id)
  // constraint from migration 0001 means a re-run just bumps the
  // role if it changed.
  const { error: upsertErr } = await admin.from("team_memberships").upsert(
    {
      team_id: team.id,
      user_id: realUser.id,
      role: "admin",
      invited_by: demoOwner.id,
    },
    { onConflict: "team_id,user_id" },
  );
  if (upsertErr) throw new Error(`membership upsert: ${upsertErr.message}`);

  console.log("");
  console.log(`✓ ${email} added as admin of ${team.name}.`);
  console.log(`  Sign in at https://www.sirenfooty.com.au/login as`);
  console.log(`  ${email} — the demo team will appear in your team list.`);
}

await main();
