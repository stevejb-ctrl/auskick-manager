#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * One-off helper: lists teams + games in Supabase so you can pick
 * which ones to feature in the marketing screenshots.
 *
 * Reads `.env.local` for `NEXT_PUBLIC_SUPABASE_URL` and
 * `SUPABASE_SERVICE_ROLE_KEY`. Bypasses RLS — read-only, never
 * commit secrets, service-role key stays local.
 *
 * Usage:  node scripts/list-capture-candidates.mjs
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tiny .env.local loader — we don't want to pull in dotenv just for this.
function loadEnvLocal() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Pull teams with a squad-size > 0 and at least one game.
  const { data: teams, error: teamErr } = await supabase
    .from("teams")
    .select("id, name, age_group, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (teamErr) throw teamErr;

  for (const team of teams ?? []) {
    const [{ count: playerCount }, { data: games }] = await Promise.all([
      supabase
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("team_id", team.id),
      supabase
        .from("games")
        .select("id, opponent, round_number, scheduled_at, status, share_token")
        .eq("team_id", team.id)
        .order("scheduled_at", { ascending: false })
        .limit(5),
    ]);

    if (!games || games.length === 0) continue;
    console.log(
      `\n• ${team.name}  [${team.age_group ?? "?"}]  ${playerCount ?? 0} players`,
    );
    console.log(`  TEAM_ID=${team.id}`);
    for (const g of games) {
      const when = g.scheduled_at
        ? new Date(g.scheduled_at).toISOString().slice(0, 10)
        : "?";
      console.log(
        `    - ${when}  R${g.round_number ?? "?"}  vs ${g.opponent ?? "?"}  [${g.status}]`,
      );
      console.log(`      GAME_ID=${g.id}`);
      console.log(`      RUN_TOKEN=${g.share_token}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
