// ─── One-shot: prod runner-token URLs for both sports ──────────
// Companion to `fresh-explore-token.mjs`. That script reads
// `.env.local` and outputs a localhost URL — fine for dev. This
// variant reads `.env.local.prod`, finds (or accepts) a team
// per sport, creates one upcoming game per sport, and prints
// both **production** runner-token URLs at once.
//
// Usage:
//   node scripts/fresh-explore-tokens-prod.mjs
//
// Optional overrides:
//   --afl-team-id=<uuid>     defaults to SCREENSHOT_TEAM_ID
//   --netball-team-id=<uuid> defaults to first sport='netball' team found
//   --base-url=https://...   defaults to https://www.sirenfooty.com.au
//   --opponent="Stagehand Test"  appended to each game's opponent label
//
// Output (stdout):
//   AFL_URL=https://www.sirenfooty.com.au/run/<token>
//   NETBALL_URL=https://www.sirenfooty.com.au/run/<token>
//
// Status notes go to stderr.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local.prod (NOT .env.local). Truthy guard so a shell
// `export ANTHROPIC_API_KEY=""` doesn't shadow the real value.
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

function flag(name, defaultValue) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : defaultValue;
}

const aflTeamIdFlag = flag("afl-team-id", process.env.SCREENSHOT_TEAM_ID);
const netballTeamIdFlag = flag("netball-team-id", null);
const baseUrl = flag("base-url", "https://www.sirenfooty.com.au").replace(/\/$/, "");
const opponentLabel = flag("opponent", "Stagehand Test Opponents");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local.prod");
  process.exit(1);
}
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Resolve the team for a sport: caller override → demo team for sport
// → first team for sport. Returns { id, name, sport, age_group, created_by }.
async function resolveTeam(sport, override) {
  if (override) {
    const { data, error } = await admin
      .from("teams")
      .select("id, name, sport, age_group, created_by")
      .eq("id", override)
      .single();
    if (error || !data) {
      throw new Error(`Team ${override} not found: ${error?.message ?? "missing"}`);
    }
    if (data.sport !== sport) {
      throw new Error(
        `Team ${override} is sport='${data.sport}', not '${sport}'. Pass the right --${sport}-team-id.`,
      );
    }
    return data;
  }
  // Prefer the seeded demo team for the sport (is_demo=true), then
  // fall back to any team for the sport.
  const { data: demos } = await admin
    .from("teams")
    .select("id, name, sport, age_group, created_by, is_demo")
    .eq("sport", sport)
    .eq("is_demo", true)
    .limit(1);
  if (demos && demos.length > 0) return demos[0];
  const { data: anyTeam } = await admin
    .from("teams")
    .select("id, name, sport, age_group, created_by")
    .eq("sport", sport)
    .limit(1);
  if (anyTeam && anyTeam.length > 0) return anyTeam[0];
  throw new Error(`No ${sport} team found in prod`);
}

// Insert an upcoming game for the given team. Returns share_token.
// Also seeds default-available rows for every active squad member —
// mirrors the production game-creation paths via the same convention
// `seedDefaultAvailability` in `src/lib/games/seedDefaultAvailability.ts`
// enforces. Without this, Stagehand agents land on the runner-token
// URL and have to tap "Mark available" N times before they can start.
async function createSandboxGame(team, opponentSuffix) {
  const scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: game, error } = await admin
    .from("games")
    .insert({
      team_id: team.id,
      opponent: `${opponentSuffix} (${team.sport})`,
      scheduled_at: scheduledAt,
      created_by: team.created_by,
      // 60× clock + 900s sub interval mirrors fresh-explore-token's
      // sandbox config — Q1 plays out in seconds.
      clock_multiplier: 60,
      sub_interval_seconds: 900,
    })
    .select("id, share_token, opponent, scheduled_at")
    .single();
  if (error || !game) throw new Error(`Insert failed: ${error?.message}`);

  // Default-available — same as production. Can't import the TS
  // helper from a .mjs script, so inline the equivalent logic.
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

  return game;
}

async function run() {
  console.error(`Creating prod sandbox games (base=${baseUrl})…`);
  console.error("");

  const aflTeam = await resolveTeam("afl", aflTeamIdFlag);
  console.error(`AFL team:     ${aflTeam.name} (${aflTeam.age_group}, ${aflTeam.id})`);
  const aflGame = await createSandboxGame(aflTeam, opponentLabel);
  console.error(`AFL game id:  ${aflGame.id}`);

  const netballTeam = await resolveTeam("netball", netballTeamIdFlag);
  console.error(`Netball team: ${netballTeam.name} (${netballTeam.age_group}, ${netballTeam.id})`);
  const netballGame = await createSandboxGame(netballTeam, opponentLabel);
  console.error(`Netball game id: ${netballGame.id}`);
  console.error("");

  // stdout is the machine-readable section — easy to grep / eval.
  console.log(`AFL_URL=${baseUrl}/run/${aflGame.share_token}`);
  console.log(`NETBALL_URL=${baseUrl}/run/${netballGame.share_token}`);
}

run().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
