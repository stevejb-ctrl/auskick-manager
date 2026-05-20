// One-off diagnostic for the Bulls Footy chip-mode debug.
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

const { data: teams } = await admin
  .from("teams")
  .select(
    "id, name, chip_a_label, chip_b_label, chip_c_label, chip_a_mode, chip_b_mode, chip_c_mode",
  )
  .like("name", "Bulls %")
  .order("name");
for (const t of teams ?? []) {
  console.log(
    `${t.name.padEnd(40)}  a=[${t.chip_a_label ?? "·"}|${t.chip_a_mode ?? "·"}]  b=[${t.chip_b_label ?? "·"}|${t.chip_b_mode ?? "·"}]  c=[${t.chip_c_label ?? "·"}|${t.chip_c_mode ?? "·"}]`,
  );
}
