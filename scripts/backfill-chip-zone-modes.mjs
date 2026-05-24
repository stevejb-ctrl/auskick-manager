// Backfill chip_*_mode columns for teams where the label clearly
// indicates the intended zone mode — but the save action's old
// normaliser silently rewrote the mode to "split".
//
// History (Steve 2026-05-20): updateTeamChipSettings used to do
//   const normMode = v => v === "group" ? "group" : "split"
// which collapsed forward/centre/back picks to "split" before
// they hit the DB. Fixed in `a0001a9` via @/lib/chips
// normalizeChipMode, but existing rows still need correcting.
//
// Heuristic: case-insensitive label match against the three zone
// names. Only updates rows where the LABEL is the canonical
// English word — won't touch a chip labeled "older / younger" or
// anything else freeform.
//
//   chip_a_label = "Forward"     → chip_a_mode = "forward"
//   chip_a_label = "Centre"      → chip_a_mode = "centre"
//   chip_a_label = "Center"      → chip_a_mode = "centre" (US spelling)
//   chip_a_label = "Back"        → chip_a_mode = "back"
//   chip_a_label = "Fwd"         → chip_a_mode = "forward"
//   chip_a_label = "Bck"         → chip_a_mode = "back"
//
// Only updates rows where current mode is "split" AND new mode
// differs — won't overwrite an explicit "group" pick, won't no-op.
// Idempotent: re-running after the data's correct is a no-op.
//
// Usage:
//   node scripts/backfill-chip-zone-modes.mjs
//   node scripts/backfill-chip-zone-modes.mjs --dry-run

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

const DRY_RUN = process.argv.includes("--dry-run");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Map a label string to a zone mode, or null if unrecognised.
function modeFor(label) {
  if (typeof label !== "string") return null;
  const norm = label.trim().toLowerCase();
  if (norm === "forward" || norm === "forwards" || norm === "fwd") {
    return "forward";
  }
  if (
    norm === "centre" ||
    norm === "center" ||
    norm === "midfield" ||
    norm === "mid" ||
    norm === "centres" ||
    norm === "centers"
  ) {
    return "centre";
  }
  if (
    norm === "back" ||
    norm === "backs" ||
    norm === "bck" ||
    norm === "defence" ||
    norm === "defense"
  ) {
    return "back";
  }
  return null;
}

console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "WRITE"}`);
console.log("");

const { data: teams, error } = await admin
  .from("teams")
  .select(
    "id, name, chip_a_label, chip_b_label, chip_c_label, chip_a_mode, chip_b_mode, chip_c_mode",
  );
if (error) {
  console.error("Teams fetch failed:", error.message);
  process.exit(1);
}

let touched = 0;
let skipped = 0;
for (const t of teams ?? []) {
  const inferA = modeFor(t.chip_a_label);
  const inferB = modeFor(t.chip_b_label);
  const inferC = modeFor(t.chip_c_label);

  // Only patch rows where the inferred mode differs from current
  // AND current is "split" (so we don't trample an explicit
  // "group" pick that happens to share a label).
  const patch = {};
  if (inferA && t.chip_a_mode === "split" && inferA !== t.chip_a_mode) {
    patch.chip_a_mode = inferA;
  }
  if (inferB && t.chip_b_mode === "split" && inferB !== t.chip_b_mode) {
    patch.chip_b_mode = inferB;
  }
  if (inferC && t.chip_c_mode === "split" && inferC !== t.chip_c_mode) {
    patch.chip_c_mode = inferC;
  }

  if (Object.keys(patch).length === 0) {
    skipped++;
    continue;
  }

  const diff = Object.entries(patch)
    .map(([col, mode]) => `${col.slice(5, 6).toUpperCase()}: split→${mode}`)
    .join("  ");
  console.log(`${(DRY_RUN ? "+" : "✓")}   ${t.name.padEnd(36)}  ${diff}`);

  if (DRY_RUN) {
    touched++;
    continue;
  }

  const { error: updErr } = await admin
    .from("teams")
    .update(patch)
    .eq("id", t.id);
  if (updErr) {
    console.error(`  ✗ update failed: ${updErr.message}`);
    continue;
  }
  touched++;
}

console.log("");
console.log(`Summary: ${touched} ${DRY_RUN ? "would patch" : "patched"}, ${skipped} skipped.`);
