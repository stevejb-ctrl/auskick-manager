#!/usr/bin/env node
// ─── RL season seed: Bluehaven Blue JRL ───────────────────────
// Drops a rugby-league team into the local Supabase instance with
// six completed games' worth of vest_assigned events so the lineup
// picker's per-candidate "FR n · DH n" hint has real season data
// to display. Sits alongside Bondi Bandits (netball screenshots)
// and Kotara Koalas (test fixture in seed.sql).
//
// Idempotent: re-running upserts where it can and skips event
// inserts when the game already has events seeded.
//
// Run:
//   node scripts/seed-rl-bluehaven.mjs
//
// Login (use the existing super-admin account):
//   super-admin@siren.test / test-pw-12345
//
// What it creates:
//   - 1 team: Bluehaven Blue JRL (rugby_league, U10, 13 players)
//   - Owner / admin: the super-admin user from seed.sql
//   - 6 completed games (R1–R6, weekly going back ~6 weeks) with
//     vest_assigned events covering both halves
//   - 1 upcoming game (R7, next Saturday) ready for the lineup
//     picker so the coach can see "FR 4 · DH 0" etc. under each
//     candidate
//
// The vest distribution across the 6 historical games is
// deliberately uneven so the picker's "balance the load" hint is
// useful — Jack (#1) has worn FR 4 times with 0 DH stints, Lachie
// (#2) has done DH 3 times and FR once, while Tane (#12) and
// Reece (#13) have never worn either vest. Manually selecting
// either vest should show those tallies under each candidate.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ─── Env loading ─────────────────────────────────────────────
function loadEnv(file) {
  try {
    return Object.fromEntries(
      readFileSync(path.join(repoRoot, file), "utf8")
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i), l.slice(i + 1)];
        }),
    );
  } catch {
    return {};
  }
}
const env = { ...loadEnv(".env.local"), ...loadEnv(".env.test") };
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
      "Make sure you've started the local Supabase stack (`supabase start`).",
  );
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Constants ───────────────────────────────────────────────
// Super-admin user from seed.sql — already created with a
// confirmed email + bcrypt password. Reusing it lets the script
// avoid the `admin.createUser` flake on this Supabase CLI version
// (see the comment on the screenshots seed for the gory details).
const OWNER_ID = "00000000-0000-0000-0000-00000000bbbb";
const OWNER_EMAIL = "super-admin@siren.test";

const TEAM_ID = "bbbb1111-0000-4000-8000-000000000001"; // deterministic
const TEAM_NAME = "Bluehaven Blue JRL";

// 13 players — first name + last initial style, jersey 1..13.
const PLAYER_NAMES = [
  ["Jack", "Lachie", "Cooper", "Hunter", "Mason",
   "Riley", "Sam", "Eli", "Charlie", "Noah",
   "Archie", "Tane", "Reece"],
];
const PLAYER_IDS = Array.from({ length: 13 }, (_, i) => {
  // bb01..bb0d → deterministic per player so re-runs are stable.
  return `bbbb2222-0000-4000-8000-00000000${(i + 1).toString(16).padStart(4, "0")}`;
});

// 7 games: 6 completed (R1..R6, oldest → newest), 1 upcoming (R7).
const GAME_IDS = Array.from({ length: 7 }, (_, i) => {
  return `bbbb3333-0000-4000-8000-00000000000${i + 1}`;
});

// Per-game vest schedule. Distributed unevenly so the picker has
// meaningful numbers to surface:
//   p1 (Jack)   → FR 4× (overworked first receiver)
//   p2 (Lachie) → FR 1×, DH 3× (gets the DH most weeks)
//   p3 (Cooper) → DH 2×
//   p4 (Hunter) → DH 2×
//   p5 (Mason)  → DH 1×
//   p6 (Riley)  → FR 1×
//   p7 (Sam)    → FR 2×
//   p8 (Eli)    → DH 1×
//   p9 (Charlie)→ FR 2×
//   p10 (Noah)  → DH 1×
//   p11 (Archie)→ FR 1×, DH 1×
//   p12 (Tane)  → never wears either — fresh candidate
//   p13 (Reece) → never wears either — fresh candidate
const VEST_SCHEDULE = [
  // [frH1, dhH1, frH2, dhH2]
  ["p1", "p2", "p3", "p4"], // R1
  ["p1", "p5", "p6", "p2"], // R2
  ["p7", "p2", "p1", "p8"], // R3
  ["p9", "p3", "p7", "p2"], // R4
  ["p1", "p10", "p11", "p3"], // R5
  ["p2", "p11", "p9", "p4"], // R6 — closest to today, picker shows this clearest
];

// Per-game opponent + result. Friendly local-junior names.
const GAME_OPPONENTS = [
  { round: 1, opponent: "Riverside Reds", win: true },
  { round: 2, opponent: "Coastal Storm", win: false },
  { round: 3, opponent: "Mountain Wolves", win: true },
  { round: 4, opponent: "Harbour Hawks", win: true },
  { round: 5, opponent: "Forest Falcons", win: false },
  { round: 6, opponent: "Lakeside Lions", win: true },
];

// ─── User / team / membership ─────────────────────────────────
async function ensureOwnerExists() {
  const { data } = await sb.auth.admin.getUserById(OWNER_ID);
  if (!data?.user) {
    throw new Error(
      `Super-admin user ${OWNER_EMAIL} (${OWNER_ID}) not found in auth.users. ` +
        `Run \`supabase db reset\` to re-apply seed.sql first.`,
    );
  }
  console.log(`✓ owner ${OWNER_EMAIL} exists`);
}

async function ensureTeam() {
  const { data: existing } = await sb
    .from("teams")
    .select("id")
    .eq("id", TEAM_ID)
    .maybeSingle();
  if (existing) {
    console.log(`✓ team ${TEAM_NAME} already exists`);
  } else {
    const { error } = await sb.from("teams").insert({
      id: TEAM_ID,
      name: TEAM_NAME,
      age_group: "U10",
      sport: "rugby_league",
      track_scoring: true,
      created_by: OWNER_ID,
    });
    if (error) throw new Error(`insert team: ${error.message}`);
    console.log(`+ created team ${TEAM_NAME}`);
  }

  const { error: memErr } = await sb
    .from("team_memberships")
    .upsert(
      { team_id: TEAM_ID, user_id: OWNER_ID, role: "admin" },
      { onConflict: "team_id,user_id" },
    );
  if (memErr) throw new Error(`upsert membership: ${memErr.message}`);
  console.log(`✓ membership: ${OWNER_EMAIL} is admin of ${TEAM_NAME}`);
}

// ─── Players ─────────────────────────────────────────────────
async function ensurePlayers() {
  const names = PLAYER_NAMES[0];
  const rows = PLAYER_IDS.map((id, i) => ({
    id,
    team_id: TEAM_ID,
    full_name: `${names[i]} B`, // shared last initial keeps the tile shortname tidy
    jersey_number: i + 1,
    is_active: true,
    created_by: OWNER_ID,
  }));
  const { error } = await sb
    .from("players")
    .upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`upsert players: ${error.message}`);
  console.log(`✓ 13 players upserted (Jack #1 … Reece #13)`);
}

// ─── Games + events ───────────────────────────────────────────
const HALF_MS = 20 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function playerIdFromKey(key) {
  // "p1" → PLAYER_IDS[0], etc.
  const n = parseInt(key.slice(1), 10);
  return PLAYER_IDS[n - 1];
}

async function ensureGames() {
  const now = Date.now();
  // R1..R6 completed, weekly going back. R7 next Saturday.
  for (let i = 0; i < 7; i++) {
    const gameId = GAME_IDS[i];
    const isUpcoming = i === 6;
    const scheduled = new Date(
      now + (isUpcoming ? WEEK_MS : -((6 - i) * WEEK_MS)),
    );
    const opponent = isUpcoming
      ? "Sunshine Surfers"
      : GAME_OPPONENTS[i].opponent;
    const status = isUpcoming ? "upcoming" : "completed";
    const { error } = await sb.from("games").upsert(
      {
        id: gameId,
        team_id: TEAM_ID,
        opponent,
        scheduled_at: scheduled.toISOString(),
        round_number: i + 1,
        status,
        on_field_size: 11,
        created_by: OWNER_ID,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`upsert game R${i + 1}: ${error.message}`);
  }
  console.log(`✓ 7 games upserted (R1–R6 completed, R7 upcoming)`);
}

async function seedEventsForCompletedGames() {
  // For each completed game, emit a minimal-but-realistic event
  // log: lineup_set, two halves with quarter_start/end + vest
  // assignments + a try or two, then game_finalised.
  for (let g = 0; g < 6; g++) {
    const gameId = GAME_IDS[g];
    const result = GAME_OPPONENTS[g];

    // Skip if we already seeded events for this game.
    const { count } = await sb
      .from("game_events")
      .select("id", { count: "exact", head: true })
      .eq("game_id", gameId);
    if ((count ?? 0) > 0) {
      console.log(`✓ R${g + 1} events already seeded (${count} rows) — skipping`);
      continue;
    }

    // Game scheduled at (today - (6-g) weeks) 9am.
    const scheduled = new Date(
      Date.now() - (6 - g) * WEEK_MS,
    );
    scheduled.setHours(9, 0, 0, 0);
    const tsBase = scheduled.getTime();
    let ts = tsBase;
    const stamp = () => {
      // Increment by 1s on every event so the timestamps sort
      // unambiguously inside the same game.
      ts += 1000;
      return new Date(ts).toISOString();
    };

    // Field = first 11 players, bench = last 2. Same lineup each
    // game keeps the data simple; vests rotate.
    const lineup = {
      forwards: PLAYER_IDS.slice(0, 5),
      backs: PLAYER_IDS.slice(5, 11),
      bench: PLAYER_IDS.slice(11),
    };

    const events = [];
    events.push({
      game_id: gameId,
      type: "lineup_set",
      metadata: { lineup, sport: "rugby_league" },
      created_by: OWNER_ID,
      created_at: stamp(),
    });

    const schedule = VEST_SCHEDULE[g];

    // H1
    events.push({
      game_id: gameId,
      type: "quarter_start",
      metadata: { quarter: 1, sport: "rugby_league" },
      created_by: OWNER_ID,
      created_at: stamp(),
    });
    events.push({
      game_id: gameId,
      type: "vest_assigned",
      player_id: playerIdFromKey(schedule[0]),
      metadata: { vest: "fr", period: 1, replacement: false, sport: "rugby_league" },
      created_by: OWNER_ID,
      created_at: stamp(),
    });
    events.push({
      game_id: gameId,
      type: "vest_assigned",
      player_id: playerIdFromKey(schedule[1]),
      metadata: { vest: "dh", period: 1, replacement: false, sport: "rugby_league" },
      created_by: OWNER_ID,
      created_at: stamp(),
    });
    // 2 tries + 1 conversion in H1 for us, 1 try for them
    // (just enough to keep the scoreboard non-trivial).
    for (let t = 0; t < 2; t++) {
      events.push({
        game_id: gameId,
        type: "try",
        player_id: PLAYER_IDS[(t + g) % 11],
        metadata: { quarter: 1, elapsed_ms: 5_000 + t * 6_000_000, sport: "rugby_league" },
        created_by: OWNER_ID,
        created_at: stamp(),
      });
    }
    events.push({
      game_id: gameId,
      type: "conversion_attempt",
      player_id: playerIdFromKey(schedule[0]),
      metadata: { made: true, quarter: 1, elapsed_ms: 6_005_000, sport: "rugby_league" },
      created_by: OWNER_ID,
      created_at: stamp(),
    });
    events.push({
      game_id: gameId,
      type: "opponent_try",
      metadata: { quarter: 1, elapsed_ms: 12_000_000, sport: "rugby_league" },
      created_by: OWNER_ID,
      created_at: stamp(),
    });
    events.push({
      game_id: gameId,
      type: "quarter_end",
      metadata: { quarter: 1, elapsed_ms: HALF_MS, sport: "rugby_league" },
      created_by: OWNER_ID,
      created_at: stamp(),
    });

    // H2
    events.push({
      game_id: gameId,
      type: "quarter_start",
      metadata: { quarter: 2, sport: "rugby_league" },
      created_by: OWNER_ID,
      created_at: stamp(),
    });
    events.push({
      game_id: gameId,
      type: "vest_assigned",
      player_id: playerIdFromKey(schedule[2]),
      metadata: { vest: "fr", period: 2, replacement: false, sport: "rugby_league" },
      created_by: OWNER_ID,
      created_at: stamp(),
    });
    events.push({
      game_id: gameId,
      type: "vest_assigned",
      player_id: playerIdFromKey(schedule[3]),
      metadata: { vest: "dh", period: 2, replacement: false, sport: "rugby_league" },
      created_by: OWNER_ID,
      created_at: stamp(),
    });
    // H2 scoring — vary by win/loss so the final scorelines look real.
    const usTriesH2 = result.win ? 3 : 1;
    const themTriesH2 = result.win ? 1 : 3;
    for (let t = 0; t < usTriesH2; t++) {
      events.push({
        game_id: gameId,
        type: "try",
        player_id: PLAYER_IDS[(t + g + 3) % 11],
        metadata: { quarter: 2, elapsed_ms: 3_000_000 + t * 5_000_000, sport: "rugby_league" },
        created_by: OWNER_ID,
        created_at: stamp(),
      });
    }
    for (let t = 0; t < themTriesH2; t++) {
      events.push({
        game_id: gameId,
        type: "opponent_try",
        metadata: { quarter: 2, elapsed_ms: 2_000_000 + t * 5_000_000, sport: "rugby_league" },
        created_by: OWNER_ID,
        created_at: stamp(),
      });
    }
    events.push({
      game_id: gameId,
      type: "quarter_end",
      metadata: { quarter: 2, elapsed_ms: HALF_MS, sport: "rugby_league" },
      created_by: OWNER_ID,
      created_at: stamp(),
    });
    events.push({
      game_id: gameId,
      type: "game_finalised",
      metadata: { elapsed_ms: HALF_MS, sport: "rugby_league" },
      created_by: OWNER_ID,
      created_at: stamp(),
    });

    const { error } = await sb.from("game_events").insert(events);
    if (error) {
      throw new Error(`insert R${g + 1} events: ${error.message}`);
    }
    console.log(`+ R${g + 1} vs ${result.opponent} — ${events.length} events`);
  }
}

// ─── Availability for R7 ──────────────────────────────────────
async function seedAvailabilityForUpcoming() {
  const upcomingId = GAME_IDS[6];
  const rows = PLAYER_IDS.map((id) => ({
    game_id: upcomingId,
    player_id: id,
    status: "available",
    updated_by: OWNER_ID,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await sb
    .from("game_availability")
    .upsert(rows, { onConflict: "game_id,player_id" });
  if (error) throw new Error(`upsert availability: ${error.message}`);
  console.log(`✓ marked all 13 players available for R7`);
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log("Seeding Bluehaven Blue JRL — RL season-stats fixture\n");
  await ensureOwnerExists();
  await ensureTeam();
  await ensurePlayers();
  await ensureGames();
  await seedEventsForCompletedGames();
  await seedAvailabilityForUpcoming();
  console.log("\n──────────────────────────────────────────────");
  console.log("Done.");
  console.log("");
  console.log("Login:  super-admin@siren.test / test-pw-12345");
  console.log(`Team:   ${TEAM_NAME}`);
  console.log("URL:    /teams/" + TEAM_ID + "/games/" + GAME_IDS[6] + "/availability");
  console.log("");
  console.log("Vest-history distribution (across R1–R6):");
  console.log("  Jack #1   FR 4 / DH 0   — overworked first receiver");
  console.log("  Lachie #2 FR 1 / DH 3   — go-to DH");
  console.log("  Cooper #3 FR 0 / DH 2");
  console.log("  Hunter #4 FR 0 / DH 2");
  console.log("  Mason #5  FR 0 / DH 1");
  console.log("  Riley #6  FR 1 / DH 0");
  console.log("  Sam #7    FR 2 / DH 0");
  console.log("  Eli #8    FR 0 / DH 1");
  console.log("  Charlie #9 FR 2 / DH 0");
  console.log("  Noah #10  FR 0 / DH 1");
  console.log("  Archie #11 FR 1 / DH 1");
  console.log("  Tane #12  FR 0 / DH 0   — never worn either");
  console.log("  Reece #13 FR 0 / DH 0   — never worn either");
  console.log("──────────────────────────────────────────────");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
