// ─── Mark all Bulls sample squads available for all their games ──
// Follow-up to seed-stevejb-games.mjs. The games table defaults to
// no availability rows at all — the schema treats missing rows as
// "unknown" — but the dashboard surfaces unknown as visually
// equivalent to unavailable (greyed-out, "not yet confirmed").
// This script bulk-inserts an "available" row for every (game,
// player) pair in the Bulls sample teams, so each sample team's
// availability list is fully green on first open.
//
// Idempotent: ON CONFLICT (game_id, player_id) DO NOTHING means
// re-running won't overwrite manually-marked-unavailable rows.
//
// Usage:
//   node scripts/seed-stevejb-availability.mjs
//   node scripts/seed-stevejb-availability.mjs --dry-run

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

// Postgrest upsert + onConflict requires the unique index columns.
// (game_id, player_id) is the UNIQUE constraint declared in
// 0002_games_availability.sql, so we name those.
const ONCONFLICT = "game_id,player_id";

async function run() {
  // 1. Owner lookup.
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

  // 2. Pull Bulls teams.
  const { data: allTeams, error: teamsErr } = await admin
    .from("teams")
    .select("id, name")
    .eq("created_by", owner.id)
    .order("created_at");
  if (teamsErr) {
    console.error("Teams lookup failed:", teamsErr.message);
    process.exit(1);
  }
  const teams = (allTeams ?? []).filter(
    (t) => typeof t.name === "string" && t.name.startsWith("Bulls "),
  );
  console.log(`Bulls sample teams: ${teams.length}.`);
  console.log("");

  let totalRowsPlanned = 0;
  let totalRowsInserted = 0;
  for (const team of teams) {
    // Active players for this team.
    const { data: players, error: playersErr } = await admin
      .from("players")
      .select("id")
      .eq("team_id", team.id)
      .eq("is_active", true);
    if (playersErr) {
      console.error(`  ✗ players lookup failed for ${team.name}: ${playersErr.message}`);
      continue;
    }

    // Games for this team. (Upcoming only — we don't want to
    // retroactively mark availability on finished games if any
    // exist, but the seed-games script only writes 'upcoming' so
    // this filter is belt-and-braces.)
    const { data: games, error: gamesErr } = await admin
      .from("games")
      .select("id")
      .eq("team_id", team.id)
      .eq("status", "upcoming");
    if (gamesErr) {
      console.error(`  ✗ games lookup failed for ${team.name}: ${gamesErr.message}`);
      continue;
    }

    const rows = [];
    for (const g of games ?? []) {
      for (const p of players ?? []) {
        rows.push({
          game_id: g.id,
          player_id: p.id,
          status: "available",
          updated_by: owner.id,
        });
      }
    }

    if (rows.length === 0) {
      console.log(`⏭   "${team.name}" — no games or no players, skipping`);
      continue;
    }

    if (DRY_RUN) {
      console.log(
        `+   "${team.name}" → would mark ${rows.length} (game × player) rows available (${(games ?? []).length} games × ${(players ?? []).length} players)`,
      );
      totalRowsPlanned += rows.length;
      continue;
    }

    // Chunk in batches of 500 — Postgrest has a payload limit and
    // a 7-game × 24-player team only produces 168 rows so this
    // is mostly future-proofing.
    const CHUNK = 500;
    let teamInserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { error: upsertErr, count } = await admin
        .from("game_availability")
        .upsert(slice, { onConflict: ONCONFLICT, ignoreDuplicates: true, count: "exact" });
      if (upsertErr) {
        console.error(`  ✗ upsert failed for "${team.name}" chunk: ${upsertErr.message}`);
        break;
      }
      teamInserted += count ?? slice.length;
    }
    console.log(
      `✓   "${team.name}" → ${teamInserted} rows marked available (${(games ?? []).length} games × ${(players ?? []).length} players)`,
    );
    totalRowsInserted += teamInserted;
    totalRowsPlanned += rows.length;
  }

  console.log("");
  if (DRY_RUN) {
    console.log(`Summary: would write ${totalRowsPlanned} availability rows.`);
  } else {
    console.log(
      `Summary: ${totalRowsInserted} availability rows written (planned ${totalRowsPlanned}; difference = rows that already existed).`,
    );
  }
}

run().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
