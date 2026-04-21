#!/usr/bin/env node
// Wraps `playwright test` with the pre-flight bootstrap the e2e suite
// needs:
//   1. Load `.env.test` into process.env so Playwright + the Next.js
//      dev server see the local Supabase URL/keys + test credentials.
//   2. Make sure the local Supabase stack is running. We call
//      `supabase status` first — if the stack is already up (common
//      during development), we don't pay the 20s cold-start cost.
//   3. `supabase db reset --no-confirm` to reapply every migration and
//      seed.sql on a fresh schema. Per-test isolation is handled by
//      the factories; this reset gets us to a known baseline.
//   4. Hand control to `playwright test` with whatever extra args the
//      caller passed (e.g. `npm run e2e -- --ui`).
//
// Shell-agnostic so the same entry point works on macOS, Linux, and
// Steve's Windows dev box (which is why we're not a bash script).

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(repoRoot, ".env.test");

// 1. Minimal .env.test loader. We don't pull in `dotenv` just for this —
//    the format we need is trivial: `KEY=value`, one per line, `#` for
//    comments, blank lines ignored. Matches what .env.test.example ships.
function loadEnvFile(file) {
  if (!existsSync(file)) {
    console.error(
      `Missing ${file}. Copy .env.test.example → .env.test to get started.`
    );
    process.exit(1);
  }
  const text = readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip matching surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Don't clobber values the caller already set (e.g. CI overrides).
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(envFile);

// 2. Boot (or confirm) the local Supabase stack. `status` exits non-zero
//    when nothing is running, which is our signal to `start`.
function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: repoRoot,
    shell: process.platform === "win32",
    ...opts,
  });
  return result.status ?? 1;
}

console.log("→ Checking local Supabase status");
const statusCode = run("supabase", ["status"], { stdio: "ignore" });
if (statusCode !== 0) {
  console.log("→ Starting local Supabase (first run can take ~30s)");
  const startCode = run("supabase", ["start"]);
  if (startCode !== 0) {
    console.error(
      "supabase start failed. Is Docker running? Is the CLI installed?"
    );
    process.exit(startCode);
  }
}

// 3. Reapply migrations + seed on a clean schema. `--no-confirm` skips
//    the interactive prompt that would hang in CI.
console.log("→ Resetting local DB (migrations + seed)");
const resetCode = run("supabase", ["db", "reset", "--no-confirm"]);
if (resetCode !== 0) {
  console.error("supabase db reset failed — aborting before Playwright.");
  process.exit(resetCode);
}

// 4. Hand off to Playwright. Pass through any extra args after the
//    script name so `npm run e2e -- --ui --debug` works as expected.
const extraArgs = process.argv.slice(2);
console.log("→ Running Playwright", extraArgs.length ? extraArgs.join(" ") : "");
const playwrightCode = run("npx", ["playwright", "test", ...extraArgs]);
process.exit(playwrightCode);
