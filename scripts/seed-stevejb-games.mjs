// ─── Seed Stevejb's sample games (one-off) ────────────────────
// For each team under stevejb@gmail.com that already exists on
// PROD (created by seed-stevejb-teams.mjs), insert a short season
// of upcoming fixtures so the team isn't empty when you click in.
//
// Idempotent: if a team already has any games we skip it entirely.
// That way re-running this only fills the gaps — it never duplicates
// existing rounds, and it leaves real games (or games seeded by
// other tooling) untouched.
//
// Usage:
//   node scripts/seed-stevejb-games.mjs
//   node scripts/seed-stevejb-games.mjs --dry-run    # show plan, no writes
//
// Steve 2026-05-20: companion to seed-stevejb-teams.mjs, written
// the same day. Kept as a separate script so coaches who only
// want squads (and bring their own real games) aren't forced into
// demo fixtures.

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

// How many fixtures per team. 8 rounds covers a typical junior
// season's first half — enough for the dashboard to feel populated
// without burying real games if the coach starts using one of these
// teams for actual data.
const ROUNDS = 8;

// Sport-specific opponent + venue lists. Bland but plausibly local.
// First entry is treated as the "home" venue so half the games look
// like home games even though the schema doesn't model home/away.
const OPPONENTS = {
  afl: [
    "Northside Lions",
    "Eastside Hawks",
    "Westside Magpies",
    "Southside Demons",
    "Riverside Tigers",
    "Hillside Cats",
    "Bayside Eagles",
    "Lakeside Saints",
  ],
  netball: [
    "Northside Stingrays",
    "Eastside Phoenix",
    "Westside Storm",
    "Southside Comets",
    "Riverside Rays",
    "Hillside Jets",
    "Bayside Pulse",
    "Lakeside Firebirds",
  ],
};

const VENUES = {
  afl: [
    "Bulls Home Ground",       // home venue
    "Northside Reserve",
    "Eastside Oval",
    "Westside Park",
    "Southside Reserve",
    "Riverside Oval",
    "Hillside Park",
    "Bayside Reserve",
  ],
  netball: [
    "Bulls Indoor Centre",     // home venue
    "Northside Stadium",
    "Eastside Courts",
    "Westside Sports Centre",
    "Southside Courts",
    "Riverside Stadium",
    "Hillside Courts",
    "Bayside Centre",
  ],
};

// First match of the season — next upcoming Saturday at 9am local.
// Subsequent rounds are +7 days each. Saturday = day 6 (JS getDay).
function nextSaturday9am() {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  const dow = d.getDay();
  // Days to add to land on the NEXT Saturday. If it's already
  // Saturday and before 9am, today still works; otherwise jump
  // forward.
  let add = (6 - dow + 7) % 7;
  if (dow === 6 && d.getHours() < 9) add = 0;
  if (add === 0 && dow !== 6) add = 7;
  d.setDate(d.getDate() + add);
  return d;
}

function buildSchedule(sport, round) {
  // round is 1-indexed.
  const opps = OPPONENTS[sport];
  const venues = VENUES[sport];
  const opponent = opps[(round - 1) % opps.length];
  // Alternate home/away: odd rounds at home (venues[0]), even
  // rounds at the opponent's venue index.
  const isHome = round % 2 === 1;
  const location = isHome ? venues[0] : venues[round % venues.length];
  return { opponent, location };
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local.prod",
  );
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
  console.log(
    `Owner: ${owner.full_name ?? "(no name)"} <${owner.email}> ${owner.id}`,
  );
  console.log(`Mode:  ${DRY_RUN ? "DRY RUN (no writes)" : "WRITE"}`);
  console.log("");

  // 2. Pull all of stevejb's teams. Filter down to Bulls-seeded
  //    samples by name prefix — Stevejb owns several real teams
  //    (Brunswick Bears, Prahran Prawns, his actual junior squad)
  //    and we don't want to graft demo fixtures onto those. The
  //    Bulls seed names every team `Bulls Footy {AgeGroup}` or
  //    `Bulls Netball {AgeGroup}`, so the prefix filter is exact.
  const { data: allTeams, error: teamsErr } = await admin
    .from("teams")
    .select("id, name, sport")
    .eq("created_by", owner.id)
    .order("created_at");
  if (teamsErr) {
    console.error("Teams lookup failed:", teamsErr.message);
    process.exit(1);
  }
  const teams = (allTeams ?? []).filter(
    (t) => typeof t.name === "string" && t.name.startsWith("Bulls "),
  );
  console.log(
    `Found ${allTeams?.length ?? 0} teams owned by ${OWNER_EMAIL}; ${teams.length} match the Bulls sample prefix.`,
  );
  console.log("");

  // 3. Bulk-count existing games per team in one query so we can
  //    skip teams that already have fixtures.
  const teamIds = (teams ?? []).map((t) => t.id);
  const gamesByTeam = new Map();
  if (teamIds.length > 0) {
    const { data: gameRows } = await admin
      .from("games")
      .select("team_id")
      .in("team_id", teamIds);
    for (const row of gameRows ?? []) {
      gamesByTeam.set(row.team_id, (gamesByTeam.get(row.team_id) ?? 0) + 1);
    }
  }

  const firstSat = nextSaturday9am();
  console.log(
    `First fixture scheduled for ${firstSat.toISOString()} (next Saturday 9am local-ish).`,
  );
  console.log("");

  // 4. For each team, insert ROUNDS games if it has none.
  let touchedTeams = 0;
  let skippedTeams = 0;
  let gamesInserted = 0;
  for (const team of teams ?? []) {
    const existing = gamesByTeam.get(team.id) ?? 0;
    if (existing > 0) {
      console.log(
        `⏭   ${team.sport.padEnd(8)} "${team.name}" — already has ${existing} games, skipping`,
      );
      skippedTeams++;
      continue;
    }

    const sport = team.sport === "netball" ? "netball" : "afl";
    const rows = [];
    for (let r = 1; r <= ROUNDS; r++) {
      const when = new Date(firstSat);
      when.setDate(when.getDate() + (r - 1) * 7);
      const { opponent, location } = buildSchedule(sport, r);
      rows.push({
        team_id: team.id,
        opponent,
        scheduled_at: when.toISOString(),
        location,
        round_number: r,
        status: "upcoming",
        created_by: owner.id,
      });
    }

    if (DRY_RUN) {
      console.log(
        `+   ${sport.padEnd(8)} "${team.name}" → would insert ${rows.length} games`,
      );
      touchedTeams++;
      gamesInserted += rows.length;
      continue;
    }

    const { error: insErr } = await admin.from("games").insert(rows);
    if (insErr) {
      console.error(`✗   ${sport} "${team.name}" game insert failed: ${insErr.message}`);
      continue;
    }
    console.log(`✓   ${sport.padEnd(8)} "${team.name}" → ${rows.length} games`);
    touchedTeams++;
    gamesInserted += rows.length;
  }

  console.log("");
  console.log(
    `Summary: ${touchedTeams} teams seeded, ${skippedTeams} skipped, ${gamesInserted} games inserted.`,
  );
}

run().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
