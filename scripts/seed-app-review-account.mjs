// Seed (or re-seed) the App Store / Play Store reviewer test account.
//
// Both Apple and Google require demo credentials so a reviewer can
// walk the happy path without going through real-account signup
// (and without needing access to an Apple Developer account to test
// Sign in with Apple). This script provisions:
//
//   appreview@sirenfooty.com.au
//     Password: SirenReview2026!
//
// with:
//   - A team called "Fitzroy Falcons" (AFL, U10).
//   - 12 active players (named after team-tactical roles — Captain,
//     Forward, Defender, etc — so the reviewer can tell who's who).
//   - Three games:
//       Round 1 — completed (so reviewer can see the post-game recap)
//       Round 2 — in-progress (so reviewer can see a live match)
//       Round 3 — upcoming (so reviewer can mark availability + kick off)
//
// Idempotent: every run blows away any existing account with this
// email and rebuilds from scratch. That keeps the state deterministic
// between review submissions and re-runs when the reviewer leaves
// scratch data behind.
//
// Usage:
//   node scripts/seed-app-review-account.mjs
//
// Required in .env.local:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

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

const REVIEW_EMAIL = "appreview@sirenfooty.com.au";
const REVIEW_PASSWORD = "SirenReview2026!";
const REVIEW_NAME = "App Review";
// Suburb + animal pattern matches how real Aussie junior clubs are
// named (e.g. Fitzroy Lions, Coburg Tigers). Reads as a plausible
// inner-north Melbourne U10 side rather than placeholder demo data,
// which matters for both reviewer credibility and marketing
// screenshots.
const TEAM_NAME = "Fitzroy Falcons";
const AGE_GROUP = "U10";
// Opponents — alliterative inner-north suburb + animal, none of
// which clash with real AFL/VFL senior clubs.
const OPPONENT_COMPLETED = "Brunswick Bears";
const OPPONENT_LIVE = "Coburg Cougars";
const OPPONENT_UPCOMING = "Northcote Nighthawks";

// 12 active players. Single-word names that PlayerTile will render
// as-is (no last-initial abbreviation), so the names the reviewer
// sees match what the suggester / recap describes. Jersey numbers
// 1-12 to keep the lineup picker readable.
const PLAYERS = [
  { name: "Hugo", num: 1 },
  { name: "Maya", num: 2 },
  { name: "Theo", num: 3 },
  { name: "Ava", num: 4 },
  { name: "Levi", num: 5 },
  { name: "Zara", num: 6 },
  { name: "Otis", num: 7 },
  { name: "Indi", num: 8 },
  { name: "Sam", num: 9 },
  { name: "Frankie", num: 10 },
  { name: "Ruby", num: 11 },
  { name: "Mateo", num: 12 },
];

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUser(email) {
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
    );
    if (hit) return hit;
    if (data.users.length < perPage) return null;
    page++;
  }
}

async function wipeExisting() {
  const existing = await findUser(REVIEW_EMAIL);
  if (!existing) return;
  console.log(`Wiping existing account ${existing.id}…`);

  // Drop any teams this user solely admins — cascades players, games,
  // events, etc. Mirrors the production purge logic so we don't end
  // up with orphan rows.
  const { data: memberships } = await admin
    .from("team_memberships")
    .select("team_id, role")
    .eq("user_id", existing.id);
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
      if (error) console.error(`  team delete: ${error.message}`);
    }
  }

  const { error } = await admin.auth.admin.deleteUser(existing.id);
  if (error && !/not[_ ]found/i.test(error.message)) {
    throw new Error(`deleteUser: ${error.message}`);
  }
}

async function createReviewUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: REVIEW_EMAIL,
    password: REVIEW_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: REVIEW_NAME },
  });
  if (error || !data.user) {
    throw new Error(`createUser: ${error?.message ?? "no user"}`);
  }
  return data.user.id;
}

async function createTeam(ownerId) {
  // Two-step insert/select — the handle_new_team trigger adds the
  // creator as an admin AFTER INSERT, so a chained .select() would
  // hit the RLS gate before the membership exists. See migration
  // 0001 for the long version.
  const { error: insErr } = await admin.from("teams").insert({
    name: TEAM_NAME,
    age_group: AGE_GROUP,
    created_by: ownerId,
    track_scoring: true,
  });
  if (insErr) throw new Error(`team insert: ${insErr.message}`);
  const { data, error } = await admin
    .from("teams")
    .select("id")
    .eq("name", TEAM_NAME)
    .eq("created_by", ownerId)
    .single();
  if (error || !data) throw new Error(`team fetch: ${error?.message}`);
  return data.id;
}

async function createPlayers(teamId, ownerId) {
  const rows = PLAYERS.map((p) => ({
    team_id: teamId,
    full_name: p.name,
    jersey_number: p.num,
    is_active: true,
    created_by: ownerId,
  }));
  const { data, error } = await admin.from("players").insert(rows).select("id");
  if (error) throw new Error(`players insert: ${error.message}`);
  return data.map((r) => r.id);
}

async function createGame(teamId, ownerId, opts) {
  const { data, error } = await admin
    .from("games")
    .insert({
      team_id: teamId,
      opponent: opts.opponent,
      scheduled_at: opts.scheduledAt,
      round_number: opts.round,
      on_field_size: 9,
      status: opts.status,
      notes: opts.notes ?? null,
      created_by: ownerId,
    })
    .select("id, share_token")
    .single();
  if (error || !data) throw new Error(`game insert: ${error?.message}`);
  return { id: data.id, shareToken: data.share_token };
}

async function markAllAvailable(gameId, playerIds, ownerId) {
  const rows = playerIds.map((pid) => ({
    game_id: gameId,
    player_id: pid,
    status: "available",
    updated_by: ownerId,
  }));
  const { error } = await admin.from("game_availability").insert(rows);
  if (error) throw new Error(`availability: ${error.message}`);
}

async function seedQuarterEvents(gameId, ownerId, playerIds, opts) {
  // Push a lineup_set + quarter_start so the game has a real
  // in-progress shape. Optionally add some scoring events on top so
  // the live-game UI has something to render.
  const lineup = {
    back: playerIds.slice(0, 3),
    mid: playerIds.slice(3, 6),
    fwd: playerIds.slice(6, 9),
    bench: playerIds.slice(9, 12),
  };
  const now = new Date();
  const lineupTs = new Date(now.getTime() - opts.elapsedMs).toISOString();
  await admin.from("game_events").insert([
    {
      game_id: gameId,
      type: "lineup_set",
      metadata: { lineup },
      created_by: ownerId,
      created_at: lineupTs,
    },
    {
      game_id: gameId,
      type: "quarter_start",
      metadata: { quarter: 1 },
      created_by: ownerId,
      created_at: lineupTs,
    },
  ]);

  // Optional scoring noise so the recap looks real.
  for (const ev of opts.events ?? []) {
    const ts = new Date(
      new Date(lineupTs).getTime() + ev.atMs,
    ).toISOString();
    await admin.from("game_events").insert({
      game_id: gameId,
      type: ev.type,
      player_id: ev.playerId ?? null,
      metadata: ev.metadata ?? {},
      created_by: ownerId,
      created_at: ts,
    });
  }
}

async function main() {
  console.log(`Seeding App Review account: ${REVIEW_EMAIL}`);
  await wipeExisting();

  const ownerId = await createReviewUser();
  console.log(`  user_id: ${ownerId}`);

  const teamId = await createTeam(ownerId);
  console.log(`  team_id: ${teamId}`);

  const playerIds = await createPlayers(teamId, ownerId);
  console.log(`  players: ${playerIds.length}`);

  // Round 1 — completed. Reviewer sees the GameSummaryCard.
  const r1 = await createGame(teamId, ownerId, {
    opponent: OPPONENT_COMPLETED,
    scheduledAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    round: 1,
    status: "completed",
    notes: "Demo game — round 1, completed.",
  });
  await markAllAvailable(r1.id, playerIds, ownerId);
  await seedQuarterEvents(r1.id, ownerId, playerIds, {
    elapsedMs: 48 * 60_000, // four 12-min quarters ago
    events: [
      { type: "goal", playerId: playerIds[6], atMs: 5 * 60_000, metadata: { quarter: 1, elapsed_ms: 5 * 60_000 } },
      { type: "behind", playerId: playerIds[8], atMs: 9 * 60_000, metadata: { quarter: 1, elapsed_ms: 9 * 60_000 } },
      { type: "opponent_goal", atMs: 11 * 60_000, metadata: { quarter: 1, elapsed_ms: 11 * 60_000 } },
      { type: "quarter_end", atMs: 12 * 60_000, metadata: { quarter: 1, elapsed_ms: 12 * 60_000 } },
      { type: "quarter_start", atMs: 12 * 60_000, metadata: { quarter: 2 } },
      { type: "goal", playerId: playerIds[7], atMs: 20 * 60_000, metadata: { quarter: 2, elapsed_ms: 8 * 60_000 } },
      { type: "quarter_end", atMs: 24 * 60_000, metadata: { quarter: 2, elapsed_ms: 12 * 60_000 } },
      { type: "quarter_start", atMs: 24 * 60_000, metadata: { quarter: 3 } },
      { type: "behind", playerId: playerIds[6], atMs: 30 * 60_000, metadata: { quarter: 3, elapsed_ms: 6 * 60_000 } },
      { type: "quarter_end", atMs: 36 * 60_000, metadata: { quarter: 3, elapsed_ms: 12 * 60_000 } },
      { type: "quarter_start", atMs: 36 * 60_000, metadata: { quarter: 4 } },
      { type: "goal", playerId: playerIds[8], atMs: 42 * 60_000, metadata: { quarter: 4, elapsed_ms: 6 * 60_000 } },
      { type: "quarter_end", atMs: 48 * 60_000, metadata: { quarter: 4, elapsed_ms: 12 * 60_000 } },
      { type: "game_finalised", atMs: 48 * 60_000, metadata: { team_score: { goals: 3, behinds: 2 }, opponent_score: { goals: 1, behinds: 0 } } },
    ],
  });
  console.log(`  round 1 (completed): ${r1.id}`);

  // Round 2 — in_progress. Mid-second-quarter, score 1.1 - 0.0.
  const r2 = await createGame(teamId, ownerId, {
    opponent: OPPONENT_LIVE,
    scheduledAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
    round: 2,
    status: "in_progress",
    notes: "Demo game — round 2, live mid-Q2.",
  });
  await markAllAvailable(r2.id, playerIds, ownerId);
  await seedQuarterEvents(r2.id, ownerId, playerIds, {
    elapsedMs: 18 * 60_000,
    events: [
      { type: "goal", playerId: playerIds[6], atMs: 4 * 60_000, metadata: { quarter: 1, elapsed_ms: 4 * 60_000 } },
      { type: "behind", playerId: playerIds[7], atMs: 8 * 60_000, metadata: { quarter: 1, elapsed_ms: 8 * 60_000 } },
      { type: "quarter_end", atMs: 12 * 60_000, metadata: { quarter: 1, elapsed_ms: 12 * 60_000 } },
      { type: "quarter_start", atMs: 12 * 60_000, metadata: { quarter: 2 } },
    ],
  });
  console.log(`  round 2 (in_progress): ${r2.id}`);

  // Round 3 — upcoming. Reviewer can mark availability, start the
  // game, tap through the lineup picker, kick off Q1.
  const r3 = await createGame(teamId, ownerId, {
    opponent: OPPONENT_UPCOMING,
    scheduledAt: new Date(Date.now() + 6 * 86_400_000).toISOString(),
    round: 3,
    status: "upcoming",
    notes: "Demo game — round 3, upcoming. Tap 'Start game' to walk the kickoff flow.",
  });
  await markAllAvailable(r3.id, playerIds, ownerId);
  console.log(`  round 3 (upcoming):    ${r3.id}`);

  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log(" APP REVIEW CREDENTIALS — paste into App Store Connect /");
  console.log(" Play Console under 'App Review Information' / 'Demo'");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`   Email:    ${REVIEW_EMAIL}`);
  console.log(`   Password: ${REVIEW_PASSWORD}`);
  console.log(`   Sign-in:  email + password (toggle on /login page)`);
  console.log("");
  console.log(" Suggested reviewer walkthrough:");
  console.log(`   1. Sign in → lands on ${TEAM_NAME} team page.`);
  console.log("   2. Open the completed round 1 game → see the recap.");
  console.log("   3. Open the in-progress round 2 game → see the live UI.");
  console.log("   4. Open round 3 (upcoming) → 'Start game' to walk the");
  console.log("      availability + lineup-picker + kickoff flow.");
  console.log("   5. Avatar menu → 'My account' → demonstrates the");
  console.log("      account-deletion affordance (do NOT confirm — that");
  console.log("      schedules the demo account for purge).");
  console.log("═══════════════════════════════════════════════════════");
}

await main();
