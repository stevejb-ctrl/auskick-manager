// Quick inspector: dumps the seeded demo data so we can see what
// the DB actually contains vs what's appearing on screen.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(here, "..", ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: team } = await admin
  .from("teams")
  .select("id, name, age_group")
  .eq("name", "Fitzroy Falcons")
  .maybeSingle();

console.log(`TEAM: ${team.name} (${team.age_group}) — id=${team.id}`);

const { data: players } = await admin
  .from("players")
  .select("jersey_number, full_name, is_active")
  .eq("team_id", team.id)
  .order("jersey_number");
console.log(`\nPLAYERS (${players.length} active):`);
for (const p of players) console.log(`  #${p.jersey_number} ${p.full_name}`);

const { data: games } = await admin
  .from("games")
  .select("id, opponent, status, on_field_size, round_number")
  .eq("team_id", team.id)
  .order("round_number");
console.log(`\nGAMES:`);
for (const g of games) {
  console.log(`  R${g.round_number} vs ${g.opponent} — status=${g.status} on_field=${g.on_field_size}`);
  const { data: events } = await admin
    .from("game_events")
    .select("type, metadata")
    .eq("game_id", g.id)
    .eq("type", "lineup_set")
    .order("created_at", { ascending: false })
    .limit(1);
  if (events?.[0]?.metadata?.lineup) {
    const ln = events[0].metadata.lineup;
    const counts = Object.fromEntries(
      Object.entries(ln).map(([k, v]) => [k, Array.isArray(v) ? v.length : "?"]),
    );
    console.log(`    lineup_set: ${JSON.stringify(counts)}`);
  } else {
    console.log(`    (no lineup_set event)`);
  }
}
