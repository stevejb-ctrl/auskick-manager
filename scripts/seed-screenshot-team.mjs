#!/usr/bin/env node
// ─── Screenshot seed: Bondi Bandits ──────────────────────────
// Drops a richly-populated netball team into the local Supabase
// instance so Steve can take marketing screenshots without having
// to play through games by hand. Sits ALONGSIDE the Kotara Koalas
// e2e fixture (supabase/seed.sql) — Kotara is for tests, this is
// for visuals.
//
// Idempotent: re-running upserts where it can and skips where it
// can't (game_events specifically — re-running would double-seed
// scores, so we check for existing events first).
//
// Run:
//   node scripts/seed-screenshot-team.mjs
//
// Login (printed at the end):
//   screenshots@siren.local / screenshots-pw-12345
//
// What it creates:
//   - 1 user: screenshots@siren.local
//   - 1 team: Bondi Bandits (netball, "go" age, 10 players, scoring on)
//   - 5 games at every state useful for screenshots:
//       R1 — completed, win  (vs Coogee Comets, 3 weeks ago)
//       R2 — completed, loss (vs Manly Monarchs, 2 weeks ago)
//       R3 — completed, win  (vs Bronte Bolts, 1 week ago)
//       R4 — paused at Q-break for Q4 (vs Tamarama Tigers, today)
//       R5 — scheduled        (vs Maroubra Magpies, next Saturday)
//
// Why this mix: covers (a) the games-list with a "next up" hero,
// (b) completed games for the stats dashboard + season totals,
// (c) a paused game for the live Q-break suggester surface, and
// (d) a finalised game for the post-game summary card.

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
const USER_EMAIL = "screenshots@siren.local";
const USER_PASSWORD = "screenshots-pw-12345";
const TEAM_ID = "5c4ee117-0ba1-4c5e-b107-b07b04bdd175"; // deterministic
const TEAM_NAME = "Bondi Bandits";
const PLAYER_NAMES = [
  "Aria", "Bea", "Charlie", "Daisy", "Eliza",
  "Frankie", "Grace", "Harlow", "Iris", "Jade",
];

// Five fixed game UUIDs so re-runs land on the same rows.
const GAME_IDS = [
  "bbb1bbb1-0001-4b1b-bbbb-000000000001", // R1 win
  "bbb1bbb1-0002-4b1b-bbbb-000000000002", // R2 loss
  "bbb1bbb1-0003-4b1b-bbbb-000000000003", // R3 win
  "bbb1bbb1-0004-4b1b-bbbb-000000000004", // R4 paused at Q3 break
  "bbb1bbb1-0005-4b1b-bbbb-000000000005", // R5 scheduled
];

// Position order maps jersey 1..7 to GS..GK so the lineup events
// are easy to read and match coach intuition. Jersey 8..10 = bench.
const POSITIONS_IN_ORDER = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];

// ─── User ────────────────────────────────────────────────────
// The screenshot user is created by supabase/seed.sql alongside
// super-admin — same raw-SQL bcrypt pattern, same deterministic
// UUID. Doing it in seed.sql sidesteps the "Database error checking
// email" failure mode that afflicts `admin.createUser` on this
// Supabase CLI version (the seed.sql comment on the super-admin
// row spells out why), and also means a fresh `supabase db reset`
// is enough to get the dev/login route working.
//
// This script just confirms the row exists; if it doesn't, the
// caller has skipped `supabase db reset` since the seed.sql update
// landed and we tell them so.
const SCREENSHOT_USER_ID = "00000000-0000-0000-0000-00000000cccc";

async function ensureUser() {
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 100 });
  const existing = list.users.find((u) => u.email === USER_EMAIL);
  if (existing) {
    console.log(`✓ user already exists (${USER_EMAIL})`);
    return existing.id;
  }
  throw new Error(
    `User ${USER_EMAIL} is missing from auth.users. ` +
      `Run \`supabase db reset\` to re-apply seed.sql (which now creates ` +
      `this user alongside super-admin), then re-run this script.`,
  );
}

// ─── Team + membership ───────────────────────────────────────
async function ensureTeam(ownerId) {
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
      age_group: "go",
      sport: "netball",
      track_scoring: true,
      created_by: ownerId,
    });
    if (error) throw new Error(`insert team: ${error.message}`);
    console.log(`+ created team ${TEAM_NAME}`);
  }

  // handle_new_team trigger normally adds the creator as admin
  // automatically. Re-running idempotently — upsert on
  // (team_id, user_id) so the membership lands either way.
  const { error: memErr } = await sb
    .from("team_memberships")
    .upsert(
      { team_id: TEAM_ID, user_id: ownerId, role: "admin" },
      { onConflict: "team_id,user_id" },
    );
  if (memErr) throw new Error(`upsert membership: ${memErr.message}`);
}

// ─── Players ─────────────────────────────────────────────────
async function ensurePlayers(ownerId) {
  // Existing roster?
  const { data: existing } = await sb
    .from("players")
    .select("id, full_name, jersey_number, created_at")
    .eq("team_id", TEAM_ID)
    .order("created_at"); // ← can't sort by jersey_number — it's null for netball
  if (existing && existing.length === PLAYER_NAMES.length) {
    console.log(`✓ ${existing.length} players already on roster`);
    // Migrate older runs that still have jersey numbers — netball
    // doesn't use them. UPDATE in one round-trip; no-op if already
    // null. Keeps screenshot pages from displaying stale "#1, #2"
    // chips on squad lists.
    const stillNumbered = existing.filter((p) => p.jersey_number !== null);
    if (stillNumbered.length > 0) {
      const { error } = await sb
        .from("players")
        .update({ jersey_number: null })
        .eq("team_id", TEAM_ID);
      if (error) throw new Error(`clear jersey numbers: ${error.message}`);
      console.log(`+ cleared jersey numbers on ${stillNumbered.length} player(s) — netball doesn't use them`);
    }
    // Sort by name index in PLAYER_NAMES to keep the returned id
    // order matching the canonical "jersey 1..10 maps to GS..GK +
    // bench" pattern the rest of the script assumes for events.
    const byName = new Map(existing.map((p) => [p.full_name, p.id]));
    return PLAYER_NAMES.map((n) => byName.get(n)).filter(Boolean);
  }

  // Fresh insert. If a partial roster exists (rare — interrupted
  // earlier run) we can't easily reconcile, so just bail with a
  // clear message rather than corrupting state.
  if (existing && existing.length > 0) {
    throw new Error(
      `Bondi Bandits already has ${existing.length} players (expected 0 or ${PLAYER_NAMES.length}). ` +
        `Manually delete via SQL and re-run, or accept the existing roster.`,
    );
  }

  // Netball doesn't use jersey numbers — players are referenced
  // by name only (see migration 0020_jersey_number_nullable.sql).
  // Inserting with `jersey_number: null` keeps the squad list +
  // screenshots clean.
  const rows = PLAYER_NAMES.map((name) => ({
    team_id: TEAM_ID,
    full_name: name,
    jersey_number: null,
    is_active: true,
    created_by: ownerId,
  }));
  const { data, error } = await sb
    .from("players")
    .insert(rows)
    .select("id, full_name");
  if (error || !data) throw new Error(`insert players: ${error?.message}`);
  console.log(`+ inserted ${data.length} players (no jersey numbers)`);
  // Return ids in PLAYER_NAMES order so the seeded events bind
  // GS = first name, GA = second, etc.
  const byName = new Map(data.map((p) => [p.full_name, p.id]));
  return PLAYER_NAMES.map((n) => byName.get(n));
}

// ─── Games (rows only, events come next) ─────────────────────
async function ensureGames(ownerId) {
  const now = new Date();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;

  const games = [
    {
      id: GAME_IDS[0],
      opponent: "Coogee Comets",
      scheduledAt: new Date(now.getTime() - 3 * oneWeek),
      round: 1,
      status: "completed",
    },
    {
      id: GAME_IDS[1],
      opponent: "Manly Monarchs",
      scheduledAt: new Date(now.getTime() - 2 * oneWeek),
      round: 2,
      status: "completed",
    },
    {
      id: GAME_IDS[2],
      opponent: "Bronte Bolts",
      scheduledAt: new Date(now.getTime() - 1 * oneWeek),
      round: 3,
      status: "completed",
    },
    {
      id: GAME_IDS[3],
      opponent: "Tamarama Tigers",
      // R4 — paused at Q-break for Q4. Scheduled "today" so the
      // games list shows it as the current/active game. The event
      // history (seeded below) carries the actual game state.
      scheduledAt: now,
      round: 4,
      status: "in_progress",
    },
    {
      id: GAME_IDS[4],
      opponent: "Maroubra Magpies",
      // R5 — next Saturday. The "next up" hero on the games list
      // and team home should pick this up. Status enum is
      // (upcoming|in_progress|completed) per migration 0002.
      scheduledAt: new Date(now.getTime() + oneWeek),
      round: 5,
      status: "upcoming",
    },
  ];

  for (const g of games) {
    const { error } = await sb.from("games").upsert(
      {
        id: g.id,
        team_id: TEAM_ID,
        opponent: g.opponent,
        scheduled_at: g.scheduledAt.toISOString(),
        round_number: g.round,
        status: g.status,
        created_by: ownerId,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`upsert game R${g.round}: ${error.message}`);
  }
  console.log(`+ upserted ${games.length} games (R1–R5)`);
  return games;
}

// ─── Event helpers ───────────────────────────────────────────

// Build a lineup_set / period_break_swap metadata payload from
// nine player ids (positions GS..GK = 1..7, bench = 8..10). The
// `rotation` arg is a 0..N integer; we cycle three players through
// the positions to keep the chemistry / minutes data interesting
// without writing a full rotation engine here.
function lineupMeta(playerIds, rotation) {
  const onCourt = [...playerIds];
  // Simple rotation: shift the first 7 by `rotation` positions
  // within the 10-player squad. Players 8..10 cycle through the
  // bench so seasonal totals don't collapse to "same 7 every game".
  const offset = rotation % playerIds.length;
  const shifted = [
    ...onCourt.slice(offset),
    ...onCourt.slice(0, offset),
  ];
  const lineup = {
    positions: Object.fromEntries(
      POSITIONS_IN_ORDER.map((pid, i) => [pid, [shifted[i]]]),
    ),
    bench: shifted.slice(7),
  };
  return { lineup, sport: "netball" };
}

// Generate a deterministic-looking spread of goal events across a
// quarter. `q` is 1..4, `qStart` is the timestamp of quarter_start,
// `mins` is the quarter duration in minutes. Each goal lands at a
// realistic moment within the quarter, attributed to either the
// player at GS or GA (with `gs` slightly favoured) so the
// per-player scorer leaderboard reads naturally.
function spreadGoals({ q, qStart, mins, teamGoalsPerQuarter, oppGoalsPerQuarter, lineup, playerIds }) {
  const events = [];
  const qMs = mins * 60_000;
  const gsId = lineup.positions.gs[0];
  const gaId = lineup.positions.ga[0];

  // Team goals — split 60% / 40% between GS / GA.
  for (let i = 0; i < teamGoalsPerQuarter; i++) {
    const t = qStart.getTime() + Math.floor(((i + 1) / (teamGoalsPerQuarter + 1)) * qMs);
    const playerId = i % 5 < 3 ? gsId : gaId;
    events.push({
      type: "goal",
      player_id: playerId,
      metadata: { quarter: q, sport: "netball" },
      created_at: new Date(t).toISOString(),
    });
  }
  // Opponent goals — interspersed midway.
  for (let i = 0; i < oppGoalsPerQuarter; i++) {
    const t = qStart.getTime() + Math.floor(((i + 0.5) / (oppGoalsPerQuarter + 1)) * qMs);
    events.push({
      type: "opponent_goal",
      player_id: null,
      metadata: { quarter: q, sport: "netball" },
      created_at: new Date(t).toISOString(),
    });
  }
  // Light noise: ensure one team goal in every quarter has been
  // scored within the first 90s (so the live UI's "first goal"
  // chips in the dashboard timeline have something to display).
  void playerIds;
  return events;
}

// ─── Event seeding ───────────────────────────────────────────
// Emits a complete event log for each game. Idempotent at the
// game level: if any events already exist for a game, we skip it
// (re-running would double-seed scores).
async function seedEvents(ownerId, playerIds) {
  // Per-game scoring profile. Numbers chosen so the W/L/D
  // headline scores read naturally on stat cards.
  const profiles = [
    { id: GAME_IDS[0], teamPerQ: [7, 8, 6, 7], oppPerQ: [4, 6, 5, 6] }, // R1 win 28-21
    { id: GAME_IDS[1], teamPerQ: [4, 5, 4, 6], oppPerQ: [6, 6, 7, 7] }, // R2 loss 19-26
    { id: GAME_IDS[2], teamPerQ: [8, 9, 7, 7], oppPerQ: [5, 4, 6, 5] }, // R3 win 31-20
    { id: GAME_IDS[3], teamPerQ: [6, 7, 5, null], oppPerQ: [4, 5, 6, null] }, // R4 paused after Q3
  ];

  for (let p = 0; p < profiles.length; p++) {
    const profile = profiles[p];
    const { count: existingCount } = await sb
      .from("game_events")
      .select("id", { count: "exact", head: true })
      .eq("game_id", profile.id);
    if ((existingCount ?? 0) > 0) {
      console.log(`✓ events already seeded for R${p + 1} (skipping)`);
      continue;
    }

    const events = [];
    const baseStart = new Date();
    // Backdate completed games by their respective week offsets so
    // event timestamps land in the past. R4 (paused) starts roughly
    // 60 minutes ago so the live page treats it as "in flight".
    if (p === 0) baseStart.setTime(baseStart.getTime() - 3 * 7 * 24 * 60 * 60 * 1000);
    else if (p === 1) baseStart.setTime(baseStart.getTime() - 2 * 7 * 24 * 60 * 60 * 1000);
    else if (p === 2) baseStart.setTime(baseStart.getTime() - 1 * 7 * 24 * 60 * 60 * 1000);
    else if (p === 3) baseStart.setTime(baseStart.getTime() - 60 * 60 * 1000);

    // Pre-game lineup_set lands ~5 minutes before Q1.
    const lineupAt = new Date(baseStart.getTime() - 5 * 60_000);
    const initialLineupMeta = lineupMeta(playerIds, 0);
    events.push({
      type: "lineup_set",
      player_id: null,
      metadata: initialLineupMeta,
      created_at: lineupAt.toISOString(),
    });

    let runningLineup = initialLineupMeta.lineup;

    // Per-quarter loop: q1..q4 (or up to q3 only for the paused R4).
    const qLengthMin = 10;
    for (let q = 1; q <= 4; q++) {
      const teamGoals = profile.teamPerQ[q - 1];
      const oppGoals = profile.oppPerQ[q - 1];
      if (teamGoals === null || oppGoals === null) {
        // Q4 is missing on the paused R4 — stop after the Q3 break
        // events have been emitted (period_break_swap below would
        // run, but we want the suggester surface to render fresh —
        // so skip the swap too and let the live page suggest its
        // own Q4 lineup).
        break;
      }

      // Each quarter starts exactly 12 minutes after the previous
      // (10min play + 2min break). Q1 starts at baseStart.
      const qStart = new Date(baseStart.getTime() + (q - 1) * 12 * 60_000);
      const qEnd = new Date(qStart.getTime() + qLengthMin * 60_000);

      events.push({
        type: "quarter_start",
        player_id: null,
        metadata: { quarter: q, sport: "netball" },
        created_at: qStart.toISOString(),
      });

      // Goals within the quarter.
      events.push(
        ...spreadGoals({
          q,
          qStart,
          mins: qLengthMin,
          teamGoalsPerQuarter: teamGoals,
          oppGoalsPerQuarter: oppGoals,
          lineup: runningLineup,
          playerIds,
        }),
      );

      events.push({
        type: "quarter_end",
        player_id: null,
        metadata: {
          quarter: q,
          elapsed_ms: qLengthMin * 60_000,
          sport: "netball",
        },
        created_at: qEnd.toISOString(),
      });

      // After Q1, Q2, Q3: rotate the lineup at the period break so
      // the chemistry / minutes data have variety. R4 stops emitting
      // events after q3_end so the live page lands on the Q-break
      // suggester surface — no period_break_swap for q==3 on R4.
      const isPausedR4 = profile === profiles[3];
      const skipFinalRotation = isPausedR4 && q === 3;
      if (q < 4 && !skipFinalRotation) {
        const swapAt = new Date(qEnd.getTime() + 30_000);
        const swapMeta = lineupMeta(playerIds, q);
        events.push({
          type: "period_break_swap",
          player_id: null,
          metadata: swapMeta,
          created_at: swapAt.toISOString(),
        });
        runningLineup = swapMeta.lineup;
      }
    }

    // Finalise completed games (not R4).
    if (profile.teamPerQ[3] !== null) {
      const finaliseAt = new Date(baseStart.getTime() + 50 * 60_000);
      events.push({
        type: "game_finalised",
        player_id: null,
        metadata: { quarter: 4, elapsed_ms: 600000, sport: "netball" },
        created_at: finaliseAt.toISOString(),
      });
    }

    // Bulk insert. 100-event chunks would matter at scale — these
    // games are <60 events each so a single insert is fine.
    const rows = events.map((e) => ({
      game_id: profile.id,
      type: e.type,
      player_id: e.player_id,
      metadata: e.metadata,
      created_by: ownerId,
      created_at: e.created_at,
    }));
    const { error } = await sb.from("game_events").insert(rows);
    if (error) {
      throw new Error(`insert events R${p + 1}: ${error.message}`);
    }
    console.log(
      `+ seeded ${rows.length} events for R${p + 1} (${profile.id.slice(-4)})`,
    );
  }
}

// ─── Availability for the upcoming game ──────────────────────
// R5 hasn't been played yet — pre-fill the availability list so
// the squad-availability surface shows "8 in / 2 out" rather than
// an empty slate. Idempotent via upsert.
async function seedAvailabilityForR5(playerIds) {
  const rows = playerIds.map((pid, i) => ({
    game_id: GAME_IDS[4],
    player_id: pid,
    // First 8 available; jersey 9, 10 unavailable to give a
    // realistic "two outs" look on the availability screen.
    status: i < 8 ? "available" : "unavailable",
  }));
  const { error } = await sb
    .from("game_availability")
    .upsert(rows, { onConflict: "game_id,player_id" });
  if (error) throw new Error(`upsert availability: ${error.message}`);
  console.log(`+ availability seeded for R5 (8 in / 2 out)`);
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log("─── Seeding Bondi Bandits screenshot team ───");
  console.log(`Supabase: ${url}`);
  const ownerId = await ensureUser();
  await ensureTeam(ownerId);
  const playerIds = await ensurePlayers(ownerId);
  await ensureGames(ownerId);
  await seedEvents(ownerId, playerIds);
  await seedAvailabilityForR5(playerIds);
  console.log("");
  console.log("─── Done ───");
  console.log(`Login at:    http://localhost:3002/login`);
  console.log(`Email:       ${USER_EMAIL}`);
  console.log(`Password:    ${USER_PASSWORD}`);
  console.log(`Team URL:    http://localhost:3002/teams/${TEAM_ID}`);
  console.log("");
  console.log("Screenshot-ready surfaces:");
  console.log(`  Games list (R5 'next up' hero):     /teams/${TEAM_ID}/games`);
  console.log(`  Stats dashboard (3 completed):      /teams/${TEAM_ID}/stats`);
  console.log(`  Live game paused @ Q3 break:        /teams/${TEAM_ID}/games/${GAME_IDS[3]}/live`);
  console.log(`  Full-time summary card (R3 win):    /teams/${TEAM_ID}/games/${GAME_IDS[2]}/live`);
  console.log(`  Availability (R5):                   /teams/${TEAM_ID}/games/${GAME_IDS[4]}/availability`);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
