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
import { createServer } from "node:net";
import http from "node:http";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(repoRoot, ".env.test");

/**
 * Probe whether port 3000 is bindable. Returns:
 *   - { occupied: false } — port is free
 *   - { occupied: true }  — something is listening
 *
 * Uses an ephemeral net.createServer().listen(3000) attempt — never
 * accepts a connection, never logs anything itself, just resolves a
 * promise based on the `error` vs `listening` event.
 */
function probePort3000() {
  return new Promise((resolve, reject) => {
    const tester = createServer();
    tester.unref();
    tester.once("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        resolve({ occupied: true });
      } else {
        reject(err);
      }
    });
    tester.once("listening", () => {
      tester.close(() => resolve({ occupied: false }));
    });
    tester.listen(3000, "127.0.0.1");
  });
}

/**
 * When port 3000 is occupied, classify the occupant: dev server
 * (Next.js) or hostile process. Issues a single HTTP GET to
 * http://127.0.0.1:3000/ and inspects:
 *   - the X-Powered-By: Next.js response header (canonical signal)
 *   - body containing the Next.js __next root div (fallback if the
 *     header is disabled via next.config.js)
 *
 * Returns:
 *   - { isDevServer: true }
 *   - { isDevServer: false, reason: "..." }
 */
function classifyPort3000Occupant() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port: 3000, path: "/", timeout: 3000 },
      (res) => {
        const poweredBy = res.headers["x-powered-by"] || "";
        const isNextHeader = /next\.js/i.test(poweredBy);

        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
          if (body.length > 4096) {
            // Headers checked; bail on body collection to keep probe fast.
            res.destroy();
          }
        });
        res.on("end", () => finish());
        res.on("close", () => finish());

        let resolved = false;
        function finish() {
          if (resolved) return;
          resolved = true;
          const isNextBody = /id="__next"|__next_f|<div id="__next/.test(body);
          if (isNextHeader || isNextBody) {
            resolve({ isDevServer: true });
          } else {
            resolve({
              isDevServer: false,
              reason: `port 3000 responded but X-Powered-By="${poweredBy}" and no __next markers in body`,
            });
          }
        }
      },
    );
    req.on("error", (err) => {
      resolve({
        isDevServer: false,
        reason: `port 3000 occupied but HTTP probe failed: ${err.message}`,
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ isDevServer: false, reason: "port 3000 HTTP probe timed out (3s)" });
    });
  });
}

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

// 1.5 Probe port 3000 BEFORE booting Supabase. If a dev server is
//     already running we'll reuse it (Playwright's playwright.config.ts
//     has reuseExistingServer: !process.env.CI). If port 3000 is held
//     by something else, abort here with a clear message — silently
//     letting Playwright spawn its own dev server against an occupied
//     port is the worst-case failure mode (cold-compile races + the
//     20s "Timed out waiting for webServer" hang we hit in Phase 4
//     plans 04-02 / 04-03).
console.log("→ Probing port 3000");
const probe = await probePort3000();
if (probe.occupied) {
  const classify = await classifyPort3000Occupant();
  if (classify.isDevServer) {
    console.log(
      "→ Existing Next.js dev server detected on port 3000 — Playwright will reuse it (skipping cold-start).",
    );
    // Note: we don't set any env var here — playwright.config.ts already
    // has reuseExistingServer: !process.env.CI in webServer config.
    // Setting CI=1 would FORCE-spawn a new server, which is the opposite
    // of what we want. Just log and continue.
  } else {
    console.error(
      `→ Port 3000 is occupied by a non-dev-server process: ${classify.reason}`,
    );
    console.error("  Free port 3000 before retrying. Suggested commands:");
    if (process.platform === "win32") {
      console.error(
        "    PowerShell: Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force",
      );
    } else {
      console.error("    bash:       lsof -ti :3000 | xargs kill -9");
    }
    process.exit(1);
  }
} else {
  console.log("→ Port 3000 is free; Playwright will spawn its own dev server.");
}

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

// 3. Reapply migrations + seed on a clean schema. `--yes` skips
//    the interactive prompt that would hang in CI.
console.log("→ Resetting local DB (migrations + seed)");
const resetCode = run("supabase", ["db", "reset", "--yes"]);
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
