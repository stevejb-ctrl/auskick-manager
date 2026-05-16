// ─── Fresh runner-token URL for Stagehand exploration ──────────
// Creates a NEW upcoming game against the team referenced by
// SCREENSHOT_TEAM_ID in .env.local, then prints its runner-token
// URL. Each invocation = a fresh sandbox the agent can drive
// through the pre-game → Q1 flow without bumping into a finalised
// state from the last run.
//
// Why a script and not a one-shot DB query: the runner needs an
// in-progress game with a fresh share_token, no events, and no
// game_availability rows (so the runner has to mark availability
// → matches the game-day-flow mission's first step).
//
// Usage:
//   node scripts/fresh-explore-token.mjs
//   node scripts/fresh-explore-token.mjs --opponent="Test Pythons"
//   node scripts/fresh-explore-token.mjs --port=3001
//
// Output: prints the runner-token URL on stdout. Pipe straight
// into Stagehand:
//   URL=$(node scripts/fresh-explore-token.mjs)
//   node e2e/explore/run.mjs --url=$URL --mission=game-day-flow

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Auto-load .env.local. Mirrors the loader in e2e/explore/run.mjs
// (truthy check so the Claude Code wrapper's empty exports don't
// shadow real values from .env.local).
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Default to SCREENSHOT_TEAM_ID (the AFL test team) but accept a
// CLI override so the same script can host netball sandboxes too.
//   node scripts/fresh-explore-token.mjs --team-id=<uuid>
const teamId = flag("team-id", process.env.SCREENSHOT_TEAM_ID);
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}
if (!teamId) {
  console.error(
    "Need a team to host the sandbox under. Either set SCREENSHOT_TEAM_ID " +
      "in .env.local OR pass --team-id=<uuid>. (The team won't be modified, " +
      "just a new game inserted under it.)",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Look up the team's owner — needed for created_by. Service-role
// bypasses RLS so we can read this directly.
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

// Schedule "next week" so the game card sorts as upcoming-but-soon
// and the date line in the UI doesn't render "in 6 months".
const scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const { data: game, error: gameErr } = await admin
  .from("games")
  .insert({
    team_id: team.id,
    opponent,
    scheduled_at: scheduledAt,
    created_by: team.created_by,
    // Steve 2026-05-15: was 60× for Playwright parity with
    // full-game-playthrough.spec.ts — but a Stagehand explore run
    // proved 60× too fast for the LLM-driven agent. At 60× a
    // 12-min Q elapses in ~12 real seconds, and the agent lands
    // on Q-break before its score-flow turn fires. 8× keeps the
    // mission under 5 minutes (12-min Q → 90s) while leaving the
    // agent enough room to score + undo within a single quarter.
    // sub_interval still pushed past quarter length so the
    // SubDueModal stays out of the way during exploratory runs.
    clock_multiplier: 8,
    sub_interval_seconds: 900,
    // sport is on the team, not the game — `games` rows inherit
    // it transitively through team_id. on_field_size defaults to
    // 12 (U10) per migration 0007.
    // status defaults to "upcoming" via the schema.
  })
  .select("id, share_token, opponent, scheduled_at")
  .single();
if (gameErr || !game) {
  console.error(`Failed to create game: ${gameErr?.message}`);
  process.exit(1);
}

// Default-available — matches the production game-creation paths
// (createGame, PlayHQ sync, demo seed) via the convention enforced
// in `src/lib/games/seedDefaultAvailability.ts`. Without this,
// Stagehand agents land on the runner-token URL and have to tap
// "Mark available" N times before they can start the game. Can't
// import the TS helper from a .mjs script, so inline the
// equivalent logic.
const { data: activePlayers } = await admin
  .from("players")
  .select("id")
  .eq("team_id", team.id)
  .eq("is_active", true);
if (activePlayers && activePlayers.length > 0) {
  await admin.from("game_availability").upsert(
    activePlayers.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available",
      updated_by: null,
    })),
    { onConflict: "game_id,player_id", ignoreDuplicates: true },
  );
}

const runnerUrl = `http://localhost:${port}/run/${game.share_token}`;

// Status line goes to stderr so stdout stays clean for shell
// pipelines (URL=$(node ...)).
console.error(`✓ Created sandbox game ${game.id}`);
console.error(`  Team: ${team.name} (${team.age_group})`);
console.error(`  Opponent: ${game.opponent}`);
console.error(`  Scheduled: ${game.scheduled_at}`);
console.error(``);
console.error(`Runner URL (use with Stagehand --url=...):`);
console.log(runnerUrl);
