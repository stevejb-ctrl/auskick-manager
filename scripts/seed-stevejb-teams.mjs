// ─── Seed Stevejb's per-age-group teams (one-off) ─────────────
// Creates one team per age group (AFL × 10 + netball × 6 = 16
// teams) under stevejb@gmail.com on PROD, each populated with a
// full squad (defaultOnFieldSize + 6 bench players).
//
// Idempotent: if a team with the same (created_by, sport,
// age_group) tuple already exists, we skip the team creation
// AND the player seed for it. Safe to re-run.
//
// Usage:
//   node scripts/seed-stevejb-teams.mjs
//   node scripts/seed-stevejb-teams.mjs --dry-run    # show plan, no writes
//
// Steve 2026-05-20: hand-rolled because /demo + admin/seed-demo
// only seed the AFL+netball "demo" teams, not the full age-group
// matrix.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local.prod (NOT .env.local).
(() => {
  const envPath = resolve(__dirname, "..", ".env.local.prod");
  if (!existsSync(envPath)) {
    console.error(`Need .env.local.prod at ${envPath}`);
    process.exit(1);
  }
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
})();

const DRY_RUN = process.argv.includes("--dry-run");

const OWNER_EMAIL = "stevejb@gmail.com";

// Mirrors src/lib/ageGroups.ts (AFL) + src/lib/sports/netball/index.ts.
// `bench` is added to defaultOnFieldSize to derive total squad size.
const SPORTS = [
  {
    sport: "afl",
    ageGroups: [
      { id: "U8", name: "U8 Auskick", defaultOnFieldSize: 6 },
      { id: "U9", name: "U9", defaultOnFieldSize: 9 },
      { id: "U10", name: "U10", defaultOnFieldSize: 12 },
      // AFL Community Policy ladder: 12-a-side through U10/U11/U12,
      // 15-a-side through U13/U14/U15, 18-a-side at U16+. Steve
      // 2026-05-20 — earlier rev had U11/U12 at 15 and U13-U15 at
      // 18, both wrong; matched the bad ageGroups.ts defaults.
      { id: "U11", name: "U11", defaultOnFieldSize: 12 },
      { id: "U12", name: "U12", defaultOnFieldSize: 12 },
      { id: "U13", name: "U13", defaultOnFieldSize: 15 },
      { id: "U14", name: "U14", defaultOnFieldSize: 15 },
      { id: "U15", name: "U15", defaultOnFieldSize: 15 },
      { id: "U16", name: "U16", defaultOnFieldSize: 18 },
      { id: "U17", name: "U17", defaultOnFieldSize: 18 },
    ],
  },
  {
    sport: "netball",
    ageGroups: [
      { id: "set", name: "Net Set Go (Set)", defaultOnFieldSize: 5 },
      { id: "go", name: "Net Set Go (Go)", defaultOnFieldSize: 7 },
      { id: "11u", name: "11U", defaultOnFieldSize: 7 },
      { id: "12u", name: "12U", defaultOnFieldSize: 7 },
      { id: "13u", name: "13U", defaultOnFieldSize: 7 },
      { id: "open", name: "Open", defaultOnFieldSize: 7 },
    ],
  },
];

// Bench depth — 6 extra so the suggester always has rotation room.
const BENCH = 6;

// Hard squad cap enforced by `enforce_max_players` trigger.
// Bumped from 15 → 30 in migration 0037 (Steve 2026-05-20) so
// AFL U16+ squads can fill their 18 on-field lineup + real
// bench depth, and netball coaches can carry rotating attendees
// as fill-ins. (Earlier rev of this comment said "U13+" — that
// was wrong; U13-U15 are 15-a-side, only U16+ goes to 18.)
// Keep the script's constant in lockstep with the DB trigger or
// backfills silently cap short.
const MAX_ACTIVE = 30;

// Generic name pool. Deliberately bland — these are demo squads,
// not real kids. Mix of first names + surnames; combined randomly
// (with no-dup check per team) to produce ~50 unique combinations
// per squad before any clash. We never need more than ~24 per
// squad so this is plenty.
const FIRSTS = [
  "Alex", "Sam", "Charlie", "Jordan", "Riley", "Casey", "Morgan",
  "Taylor", "Hayden", "Cam", "Drew", "Avery", "Jamie", "Quinn",
  "Reese", "Sasha", "Logan", "Parker", "Bailey", "Finley", "Harper",
  "Indi", "Jess", "Kit", "Lou", "Mack", "Nat", "Ollie", "Pat", "Robin",
];
const LASTS = [
  "Adams", "Baker", "Carter", "Davis", "Evans", "Foster", "Gibson",
  "Hayes", "Ingram", "Jensen", "Knox", "Lloyd", "Mason", "Nash",
  "Owens", "Powell", "Quinn", "Reed", "Stone", "Tate", "Underwood",
  "Vega", "Walsh", "Xie", "Young", "Zhao",
];

function pickName(usedFull) {
  // Retry up to 100x in the (extremely rare) case of all 30×26
  // combos colliding with usedFull entries. Functionally infinite.
  for (let i = 0; i < 100; i++) {
    const f = FIRSTS[Math.floor(Math.random() * FIRSTS.length)];
    const l = LASTS[Math.floor(Math.random() * LASTS.length)];
    const full = `${f} ${l}`;
    if (!usedFull.has(full)) return full;
  }
  // Fallback: stamp with a 4-digit suffix.
  return `${FIRSTS[0]} ${LASTS[0]} ${Math.floor(Math.random() * 9999)}`;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local.prod");
  process.exit(1);
}
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function run() {
  // 1. Look up owner.
  const { data: owner, error: ownerErr } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .eq("email", OWNER_EMAIL)
    .maybeSingle();
  if (ownerErr) {
    console.error("Owner lookup failed:", ownerErr.message);
    process.exit(1);
  }
  if (!owner) {
    console.error(`No profile found with email ${OWNER_EMAIL}`);
    process.exit(2);
  }
  console.log(`Owner: ${owner.full_name ?? "(no name)"} <${owner.email}> ${owner.id}`);
  console.log(`Mode:  ${DRY_RUN ? "DRY RUN (no writes)" : "WRITE"}`);
  console.log("");

  // 2. List existing teams under this owner so we can skip
  //    duplicates idempotently. Also count active players per
  //    existing team so the script can BACKFILL squads for teams
  //    created on a previous run that hit the player-insert error
  //    (the team-create succeeded but the trigger blocked the
  //    player batch). Without this, a partial failure leaves an
  //    empty team and re-running skips it forever.
  const { data: existing, error: existingErr } = await admin
    .from("teams")
    .select("id, name, sport, age_group")
    .eq("created_by", owner.id);
  if (existingErr) {
    console.error("Existing-teams lookup failed:", existingErr.message);
    process.exit(1);
  }
  const existingByKey = new Map();
  for (const t of existing ?? []) {
    existingByKey.set(`${t.sport}::${t.age_group}`, t);
  }
  // Bulk-count active players per existing team in one query.
  const existingTeamIds = (existing ?? []).map((t) => t.id);
  const activeCountByTeam = new Map();
  if (existingTeamIds.length > 0) {
    const { data: playerRows } = await admin
      .from("players")
      .select("team_id")
      .in("team_id", existingTeamIds)
      .eq("is_active", true);
    for (const row of playerRows ?? []) {
      activeCountByTeam.set(
        row.team_id,
        (activeCountByTeam.get(row.team_id) ?? 0) + 1,
      );
    }
  }
  console.log(`Owner currently has ${existing?.length ?? 0} teams.`);
  console.log("");

  // 3. For each sport × age group, create-if-missing.
  let created = 0;
  let skipped = 0;
  let playersInserted = 0;
  // Helper that seeds N players (capped at MAX_ACTIVE − current
  // count) into a team. Returns the number inserted. Idempotent
  // for the "team exists but has 0 players" backfill case.
  async function seedPlayers(teamId, sport, desiredSize) {
    const current = activeCountByTeam.get(teamId) ?? 0;
    const room = Math.max(0, MAX_ACTIVE - current);
    const target = Math.min(desiredSize, MAX_ACTIVE) - current;
    const toInsert = Math.max(0, Math.min(target, room));
    if (toInsert === 0) return 0;

    const usedFull = new Set();
    const playerRows = [];
    for (let i = 0; i < toInsert; i++) {
      const name = pickName(usedFull);
      usedFull.add(name);
      playerRows.push({
        team_id: teamId,
        full_name: name,
        // Jersey numbers for AFL (1..N from current+1); netball
        // uses null (the netball UI doesn't surface jerseys).
        jersey_number: sport === "afl" ? current + i + 1 : null,
        is_active: true,
        created_by: owner.id,
      });
    }
    const { error: playersErr } = await admin
      .from("players")
      .insert(playerRows);
    if (playersErr) {
      console.error(`    player insert failed: ${playersErr.message}`);
      return 0;
    }
    return toInsert;
  }

  for (const sportBlock of SPORTS) {
    for (const ag of sportBlock.ageGroups) {
      const key = `${sportBlock.sport}::${ag.id}`;
      const teamName = `Bulls ${sportBlock.sport === "netball" ? "Netball" : "Footy"} ${ag.name}`;
      const desiredSize = ag.defaultOnFieldSize + BENCH;
      const capNote =
        desiredSize > MAX_ACTIVE
          ? ` (capped at ${MAX_ACTIVE} of ${desiredSize})`
          : "";

      const existingTeam = existingByKey.get(key);
      if (existingTeam) {
        const haveActive = activeCountByTeam.get(existingTeam.id) ?? 0;
        if (haveActive >= Math.min(desiredSize, MAX_ACTIVE)) {
          console.log(`⏭   ${sportBlock.sport.padEnd(8)} ${ag.id.padEnd(6)} — exists with ${haveActive} players, skipping`);
          skipped++;
        } else {
          // Backfill: team exists but is undersized (likely a
          // previous partial-failure where team-insert succeeded
          // and player-batch was blocked by the trigger).
          if (DRY_RUN) {
            const wouldInsert = Math.min(desiredSize, MAX_ACTIVE) - haveActive;
            console.log(`+   ${sportBlock.sport.padEnd(8)} ${ag.id.padEnd(6)} backfill: would add ${wouldInsert} players to existing team${capNote}`);
            playersInserted += wouldInsert;
          } else {
            const added = await seedPlayers(existingTeam.id, sportBlock.sport, desiredSize);
            console.log(`✓   ${sportBlock.sport.padEnd(8)} ${ag.id.padEnd(6)} backfilled ${added} players into existing team${capNote}`);
            playersInserted += added;
          }
        }
        continue;
      }

      if (DRY_RUN) {
        console.log(`+   ${sportBlock.sport.padEnd(8)} ${ag.id.padEnd(6)} "${teamName}" → ${Math.min(desiredSize, MAX_ACTIVE)} players${capNote}`);
        created++;
        playersInserted += Math.min(desiredSize, MAX_ACTIVE);
        continue;
      }

      // Insert team.
      const { data: team, error: teamErr } = await admin
        .from("teams")
        .insert({
          name: teamName,
          sport: sportBlock.sport,
          age_group: ag.id,
          created_by: owner.id,
          // Default-on so the score-related UI is exercised on every team.
          track_scoring: true,
        })
        .select("id")
        .single();
      if (teamErr || !team) {
        console.error(`✗   ${sportBlock.sport} ${ag.id} team insert failed: ${teamErr?.message}`);
        continue;
      }

      // Track the new team in our local active-count map so
      // seedPlayers reads "0 active" for it.
      activeCountByTeam.set(team.id, 0);
      const added = await seedPlayers(team.id, sportBlock.sport, desiredSize);
      playersInserted += added;

      console.log(`✓   ${sportBlock.sport.padEnd(8)} ${ag.id.padEnd(6)} "${teamName}" → ${added} players${capNote}`);
      created++;
    }
  }

  console.log("");
  console.log(`Summary: ${created} created, ${skipped} skipped, ${playersInserted} players inserted.`);
}

run().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
