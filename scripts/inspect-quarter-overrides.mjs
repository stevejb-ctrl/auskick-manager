// One-off diagnostic: list every AFL team / game with a non-NULL
// quarter_length_seconds override. AFL doesn't expose a UI for
// setting this (QuarterLengthInput is netball-only), so any
// override that exists is either a leftover from netball→AFL
// sport swap, a direct DB set, or a PlayHQ import quirk.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log("─── AFL teams with non-null quarter_length_seconds ───");
const { data: teams } = await admin
  .from("teams")
  .select("id, name, age_group, sport, quarter_length_seconds")
  .eq("sport", "afl")
  .not("quarter_length_seconds", "is", null);
for (const t of teams ?? []) {
  console.log(
    `  ${t.name.padEnd(40)}  age=${(t.age_group ?? "?").padEnd(12)}  q=${t.quarter_length_seconds}s (${(t.quarter_length_seconds / 60).toFixed(1)} min)`,
  );
}
console.log(`  ${teams?.length ?? 0} teams.`);
console.log("");

console.log("─── Games with non-null quarter_length_seconds ───");
const { data: games } = await admin
  .from("games")
  .select("id, opponent, team_id, quarter_length_seconds")
  .not("quarter_length_seconds", "is", null);
const teamLookup = new Map();
const teamIdsForLookup = [...new Set((games ?? []).map((g) => g.team_id))];
if (teamIdsForLookup.length > 0) {
  const { data: lookups } = await admin
    .from("teams")
    .select("id, name, sport, age_group")
    .in("id", teamIdsForLookup);
  for (const t of lookups ?? []) teamLookup.set(t.id, t);
}
let aflCount = 0;
for (const g of games ?? []) {
  const t = teamLookup.get(g.team_id);
  if (t?.sport !== "afl") continue;
  aflCount++;
  console.log(
    `  ${(t?.name ?? "?").padEnd(40)}  age=${(t?.age_group ?? "?").padEnd(12)}  vs ${(g.opponent ?? "?").padEnd(28)}  q=${g.quarter_length_seconds}s (${(g.quarter_length_seconds / 60).toFixed(1)} min)`,
  );
}
console.log(`  ${aflCount} AFL games.`);
