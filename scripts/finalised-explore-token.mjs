// ─── Finalised-game runner-token URL for Stagehand exploration ─
// Like scripts/fresh-explore-token.mjs but seeds an ENTIRE
// completed game — lineup, four quarters of events, scores, and
// (depending on --state) a game_finalised event with status=
// "completed". Use this for missions that exercise post-game
// surfaces:
//   • post-game-share — needs status=completed so the
//     GameSummaryCard renders.
//   • score-reconciler — needs Q4 quarter_end written but NO
//     game_finalised event yet, so the FullTimeReview is
//     showing (the new per-quarter table + Fix-scores panel
//     live on that surface).
//
// Usage:
//   node scripts/finalised-explore-token.mjs
//   node scripts/finalised-explore-token.mjs --state=ft-review
//   node scripts/finalised-explore-token.mjs --port=3003 --team-id=<uuid>
//
// AFL-only for now — netball needs its own lineup_meta + zone
// model; we'll extend when a netball post-game mission lands.
//
// Output: runner-token URL on stdout (status prints on stderr
// so URL=$(node ...) pipelines stay clean).

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Auto-load .env.local. Mirrors the loader in
// scripts/fresh-explore-token.mjs.
(() => {
  const envPath = resolve(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) return;
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

function flag(name, defaultValue) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : defaultValue;
}

const opponent = flag("opponent", "Stagehand Test Opponents");
const port = flag("port", "3000");
const state = flag("state", "finalised"); // "finalised" | "ft-review"

if (state !== "finalised" && state !== "ft-review") {
  console.error(
    `Invalid --state=${state}. Use "finalised" (game_finalised + status=completed) or "ft-review" (Q4 quarter_end, status still in_progress).`,
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const teamId = flag("team-id", process.env.SCREENSHOT_TEAM_ID);
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}
if (!teamId) {
  console.error(
    "Need a team to host the sandbox under. Either set SCREENSHOT_TEAM_ID in .env.local OR pass --team-id=<uuid>.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Team + players ───────────────────────────────────────────
const { data: team, error: teamErr } = await admin
  .from("teams")
  .select("id, name, created_by, age_group, sport")
  .eq("id", teamId)
  .single();
if (teamErr || !team) {
  console.error(
    `Failed to load team ${teamId}: ${teamErr?.message ?? "not found"}`,
  );
  process.exit(1);
}

// Hard-fail on netball for now — the lineup metadata + zone model
// for netball is meaningfully different (positions, thirds,
// goals-only scoring) and shoehorning AFL events into a netball
// game would write nonsense to the DB.
if (team.sport && team.sport !== "afl") {
  console.error(
    `This script currently only seeds AFL games. Team ${team.id} sport=${team.sport}.`,
  );
  process.exit(1);
}

const { data: players, error: playersErr } = await admin
  .from("players")
  .select("id, full_name, jersey_number")
  .eq("team_id", team.id)
  .order("created_at", { ascending: true });
if (playersErr || !players || players.length < 12) {
  console.error(
    `Need ≥12 players to seed a U10 finalised game; team has ${players?.length ?? 0}.`,
  );
  process.exit(1);
}

// ─── Game ─────────────────────────────────────────────────────
// Backdate to "an hour ago" so the post-game share narrative
// reads naturally ("the game finished an hour ago"). The
// scheduled_at and on_field_size mirror the fresh-explore
// provisioner so the dashboard sorts and renders consistently.
const baseStart = new Date(Date.now() - 65 * 60 * 1000); // 65 min ago = ~Q1 kickoff
const onFieldSize = 12;

const { data: game, error: gameErr } = await admin
  .from("games")
  .insert({
    team_id: team.id,
    opponent,
    scheduled_at: baseStart.toISOString(),
    created_by: team.created_by,
    on_field_size: onFieldSize,
    // 60× clock + a long sub interval mirror the e2e setup,
    // though for a fully-pre-seeded game these mostly inform
    // any "what would the live page do if you reloaded mid-Q?"
    // edge cases.
    clock_multiplier: 60,
    sub_interval_seconds: 900,
    status: "in_progress",
  })
  .select("id, share_token")
  .single();
if (gameErr || !game) {
  console.error(`Failed to create game: ${gameErr?.message}`);
  process.exit(1);
}

// ─── Availability (everyone available) ────────────────────────
const availabilityRows = players.map((p) => ({
  game_id: game.id,
  player_id: p.id,
  status: "available",
  updated_by: team.created_by,
}));
{
  const { error } = await admin
    .from("game_availability")
    .insert(availabilityRows);
  if (error) {
    console.error(`Failed to seed availability: ${error.message}`);
    process.exit(1);
  }
}

// ─── Lineup ───────────────────────────────────────────────────
// U10 AFL with on_field_size=12 → zones3 (back/mid/fwd) is the
// most common config. Caps: back=4, mid=4, fwd=4 keeps the
// numbers neat and gives the per-zone time bars something to
// render. Bench gets the remainder.
const playerIds = players.map((p) => p.id);
const lineup = {
  back: playerIds.slice(0, 4),
  mid: playerIds.slice(4, 8),
  fwd: playerIds.slice(8, 12),
  bench: playerIds.slice(12),
};

// ─── Events ───────────────────────────────────────────────────
const events = [];
const ownerId = team.created_by;
const Q_LENGTH_MIN = 12;
const QUARTER_GAP_MIN = 2; // break between quarters

// lineup_set — 5 minutes before Q1 kickoff.
const lineupAt = new Date(baseStart.getTime() - 5 * 60_000);
events.push({
  type: "lineup_set",
  player_id: null,
  metadata: { lineup },
  created_at: lineupAt.toISOString(),
  created_by: ownerId,
});

// Per-quarter scoring profile. Numbers chosen so the headline
// reads as a comfortable home win — gives the GameSummaryCard
// "Bears def Pythons" branch something to render.
const teamGoalsPerQuarter = [2, 1, 3, 1]; // total 7 → 42 pts (no behinds for simplicity)
const teamBehindsPerQuarter = [1, 0, 1, 1]; // total 3 → 45 pts overall
const oppGoalsPerQuarter = [1, 2, 0, 2]; // total 5 → 30 pts
const oppBehindsPerQuarter = [0, 1, 1, 0]; // total 2 → 32 pts overall
// Which on-field player gets credit for each goal — round-robin
// through the forwards and mids so the per-player goal log has
// variety (Tom kicks 2, James 1, Bryson 1, etc.).
const scorerCandidates = [...lineup.fwd, ...lineup.mid];
let scorerCursor = 0;
function nextScorer() {
  const id = scorerCandidates[scorerCursor % scorerCandidates.length];
  scorerCursor++;
  return id;
}

for (let q = 1; q <= 4; q++) {
  const qStartMs =
    baseStart.getTime() + (q - 1) * (Q_LENGTH_MIN + QUARTER_GAP_MIN) * 60_000;
  const qEndMs = qStartMs + Q_LENGTH_MIN * 60_000;
  const qStart = new Date(qStartMs);
  const qEnd = new Date(qEndMs);

  events.push({
    type: "quarter_start",
    player_id: null,
    metadata: { quarter: q },
    created_at: qStart.toISOString(),
    created_by: ownerId,
  });

  // Spread team goals + behinds + opponent goals + behinds
  // across the quarter at evenly-spaced times. The spread keeps
  // the Q-break recap card and the Fix-scores log readable.
  const tg = teamGoalsPerQuarter[q - 1];
  const tb = teamBehindsPerQuarter[q - 1];
  const og = oppGoalsPerQuarter[q - 1];
  const ob = oppBehindsPerQuarter[q - 1];
  const totalScoringEvents = tg + tb + og + ob;
  let evIdx = 0;
  const stepMs = (Q_LENGTH_MIN * 60_000) / Math.max(totalScoringEvents + 1, 1);

  for (let i = 0; i < tg; i++) {
    evIdx++;
    events.push({
      type: "goal",
      player_id: nextScorer(),
      metadata: { quarter: q, kind: "goal" },
      created_at: new Date(qStartMs + evIdx * stepMs).toISOString(),
      created_by: ownerId,
    });
  }
  for (let i = 0; i < tb; i++) {
    evIdx++;
    events.push({
      type: "behind",
      player_id: nextScorer(),
      metadata: { quarter: q, kind: "behind" },
      created_at: new Date(qStartMs + evIdx * stepMs).toISOString(),
      created_by: ownerId,
    });
  }
  for (let i = 0; i < og; i++) {
    evIdx++;
    events.push({
      type: "opponent_goal",
      player_id: null,
      metadata: { quarter: q, kind: "goal" },
      created_at: new Date(qStartMs + evIdx * stepMs).toISOString(),
      created_by: ownerId,
    });
  }
  for (let i = 0; i < ob; i++) {
    evIdx++;
    events.push({
      type: "opponent_behind",
      player_id: null,
      metadata: { quarter: q, kind: "behind" },
      created_at: new Date(qStartMs + evIdx * stepMs).toISOString(),
      created_by: ownerId,
    });
  }

  events.push({
    type: "quarter_end",
    player_id: null,
    metadata: { quarter: q, elapsed_ms: Q_LENGTH_MIN * 60_000 },
    created_at: qEnd.toISOString(),
    created_by: ownerId,
  });
}

// game_finalised + status=completed only when the caller asked
// for the post-game state. score-reconciler wants to LAND on the
// FullTimeReview surface, which means status stays in_progress
// with the Q4 quarter_end as the last event.
if (state === "finalised") {
  // Finalise lands ~30 seconds after Q4 end (the coach reconciles
  // briefly then taps "Finalise game").
  const finaliseAt = new Date(
    baseStart.getTime() +
      (4 * (Q_LENGTH_MIN + QUARTER_GAP_MIN) - QUARTER_GAP_MIN) * 60_000 +
      30_000,
  );
  events.push({
    type: "game_finalised",
    player_id: null,
    metadata: { quarter: 4, elapsed_ms: Q_LENGTH_MIN * 60_000 },
    created_at: finaliseAt.toISOString(),
    created_by: ownerId,
  });
}

// Bulk insert events.
{
  const rows = events.map((e) => ({
    game_id: game.id,
    type: e.type,
    player_id: e.player_id,
    metadata: e.metadata,
    created_by: e.created_by,
    created_at: e.created_at,
  }));
  const { error } = await admin.from("game_events").insert(rows);
  if (error) {
    console.error(`Failed to insert events: ${error.message}`);
    process.exit(1);
  }
}

// Flip status if finalised.
if (state === "finalised") {
  const { error } = await admin
    .from("games")
    .update({ status: "completed" })
    .eq("id", game.id);
  if (error) {
    console.error(`Failed to mark game completed: ${error.message}`);
    process.exit(1);
  }
}

// ─── Output ───────────────────────────────────────────────────
const runnerUrl = `http://localhost:${port}/run/${game.share_token}`;
console.error(`✓ Created ${state} game ${game.id}`);
console.error(`  Team: ${team.name} (${team.age_group})`);
console.error(`  Opponent: ${opponent}`);
console.error(
  `  Score: ${teamGoalsPerQuarter.reduce((a, b) => a + b, 0)}.${teamBehindsPerQuarter.reduce((a, b) => a + b, 0)} vs ${oppGoalsPerQuarter.reduce((a, b) => a + b, 0)}.${oppBehindsPerQuarter.reduce((a, b) => a + b, 0)}`,
);
console.error(`  Events: ${events.length}`);
console.error(``);
console.error(`Runner URL (use with Stagehand --url=...):`);
console.log(runnerUrl);
