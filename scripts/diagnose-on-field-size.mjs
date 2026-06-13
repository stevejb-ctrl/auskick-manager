// Inspect every game for the "Newcastle City Blues Navy" team.
// Show on_field_size + event-count summary + lineup_set payload counts.

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
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: teams } = await admin
  .from("teams")
  .select("id, name, age_group, sport")
  .ilike("name", "%Newcastle%Blues%");
console.log(`Newcastle teams (${teams?.length ?? 0}):`);
for (const t of teams ?? []) {
  console.log(`  ${t.id}  ${t.name}  age=${t.age_group} sport=${t.sport ?? "afl"}`);
}
const teamIds = (teams ?? []).map((t) => t.id);
if (teamIds.length === 0) process.exit(0);

const { data: games } = await admin
  .from("games")
  .select(
    "id, team_id, opponent, scheduled_at, status, on_field_size, sub_interval_seconds, created_at"
  )
  .in("team_id", teamIds)
  .order("created_at", { ascending: false });
console.log(`\nAll games (${games?.length ?? 0}):`);

for (const g of games ?? []) {
  const t = (teams ?? []).find((x) => x.id === g.team_id);
  console.log(
    `\n${g.id}  scheduled=${g.scheduled_at}  created=${g.created_at}\n  team=${t?.name ?? "?"}  vs ${g.opponent}  status=${g.status}  on_field=${g.on_field_size}  sub_interval_s=${g.sub_interval_seconds}`
  );

  const { data: events } = await admin
    .from("game_events")
    .select("id, type, metadata, player_id, created_at")
    .eq("game_id", g.id)
    .order("created_at", { ascending: true });

  const counts = {};
  for (const ev of events ?? []) counts[ev.type] = (counts[ev.type] ?? 0) + 1;
  const total = events?.length ?? 0;
  console.log(`  events (${total}): ${Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(", ") || "(none)"}`);

  const ls = (events ?? []).find((e) => e.type === "lineup_set");
  if (ls?.metadata?.lineup) {
    const L = ls.metadata.lineup;
    const onField =
      (L.back?.length ?? 0) +
      (L.hback?.length ?? 0) +
      (L.mid?.length ?? 0) +
      (L.hfwd?.length ?? 0) +
      (L.fwd?.length ?? 0);
    const bench = L.bench?.length ?? 0;
    console.log(
      `  lineup_set @ ${ls.created_at}: on_field=${onField} bench=${bench}  zones={back:${L.back?.length ?? 0}, hback:${L.hback?.length ?? 0}, mid:${L.mid?.length ?? 0}, hfwd:${L.hfwd?.length ?? 0}, fwd:${L.fwd?.length ?? 0}}`
    );
  }

  // Show subs/loans timeline if present.
  const subs = (events ?? []).filter((e) => e.type === "sub");
  if (subs.length > 0) {
    console.log(`  ${subs.length} sub events: first @ ${subs[0].created_at}, last @ ${subs[subs.length - 1].created_at}`);
  }
  const loans = (events ?? []).filter((e) => e.type === "player_loan");
  for (const l of loans) {
    console.log(`  player_loan @ ${l.created_at}: player=${l.player_id} loaned=${l.metadata?.loaned}`);
  }
}
