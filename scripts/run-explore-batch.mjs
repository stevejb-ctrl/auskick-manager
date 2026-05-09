// ─── Sequential explore batch runner ──────────────────────────
// Usability test runner: provisions a fresh game per mission and
// runs them serially against the local dev server. Sequential is
// deliberate — Stagehand drives a real browser against the
// in-process dev server, and parallel runs would race the same
// game state.
//
// Usage:
//   node scripts/run-explore-batch.mjs
//
// Configure `MISSIONS` below. Each entry picks a team (AFL or
// netball — UUIDs match the seeded test teams) and a mission .md
// from e2e/explore/missions/.

import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// Auto-load .env.local for SCREENSHOT_TEAM_ID and any provisioner
// secrets the child process script also reads. Mirrors the loader
// in scripts/fresh-explore-token.mjs (truthy check so the Claude
// Code wrapper's empty exports don't shadow real values).
(() => {
  const envPath = resolve(repoRoot, ".env.local");
  if (!existsSync(envPath)) return;
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

// CLI: --port=NNNN overrides the dev-server port (default 3000).
// Useful when port 3000 is occupied and Next moved to 3001/3003/etc.
function flag(name, defaultValue) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : defaultValue;
}
const port = flag("port", "3000");

// Team IDs:
//   - AFL Brunswick Bears (SCREENSHOT_TEAM_ID in .env.local)
//   - Netball "Holly" team (hardcoded UUID — same as the prior
//     Stagehand runs)
const AFL_TEAM = process.env.SCREENSHOT_TEAM_ID;
const NETBALL_TEAM = "7dabc8f2-fbda-4138-af64-e39195aa6f4e";

if (!AFL_TEAM) {
  console.error(
    "Missing SCREENSHOT_TEAM_ID in .env.local. AFL missions will fail.",
  );
}

// Each mission declares which provisioner it needs:
//   "fresh"      → upcoming game, no events (pre-game flow tests)
//   "finalised"  → completed game, status=completed, GameSummaryCard
//                  is the landing surface (post-game-share)
//   "ft-review"  → Q4 quarter_end written but game_finalised NOT yet,
//                  FullTimeReview is the landing surface (score-
//                  reconciler tests the new per-Q breakdown table
//                  + Fix-scores panel that live on this surface)
const MISSIONS = [
  { name: "parent-fairness-afl", team: AFL_TEAM, sport: "afl", provisioner: "fresh" },
  { name: "parent-fairness-netball", team: NETBALL_TEAM, sport: "netball", provisioner: "fresh" },
  { name: "post-game-share", team: AFL_TEAM, sport: "afl", provisioner: "finalised" },
  { name: "score-reconciler", team: AFL_TEAM, sport: "afl", provisioner: "ft-review" },
];

function run(cmd, args, opts = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(cmd, args, {
      cwd: repoRoot,
      stdio: opts.captureStdout ? ["inherit", "pipe", "inherit"] : "inherit",
      shell: true,
    });
    let stdout = "";
    if (opts.captureStdout) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
    }
    child.on("exit", (code) => {
      if (code === 0) resolveRun(stdout);
      else rejectRun(new Error(`${cmd} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function provisionGame(teamId, provisioner) {
  // Pick the right script + flags. fresh-explore-token leaves the
  // game in `upcoming` state with no events. finalised-explore-
  // token seeds a full event log; --state=finalised vs ft-review
  // controls whether game_finalised + status=completed land or not.
  const script =
    provisioner === "fresh"
      ? "scripts/fresh-explore-token.mjs"
      : "scripts/finalised-explore-token.mjs";
  const args = [script, `--team-id=${teamId}`, `--port=${port}`];
  if (provisioner !== "fresh") {
    args.push(`--state=${provisioner}`);
  }
  const out = await run("node", args, { captureStdout: true });
  // Script prints the URL on the LAST non-empty line.
  const lines = out.trim().split(/\r?\n/).filter(Boolean);
  const url = lines[lines.length - 1].trim();
  if (!url.startsWith("http")) {
    throw new Error(`provision script did not print a URL — got: ${out}`);
  }
  return url;
}

console.log(`▶ Running ${MISSIONS.length} missions sequentially\n`);

const results = [];
for (const m of MISSIONS) {
  console.log(`\n▶▶▶ Mission: ${m.name} (sport=${m.sport})`);
  let url;
  try {
    url = await provisionGame(m.team, m.provisioner);
    console.log(`    URL: ${url}`);
  } catch (err) {
    console.error(`    FAILED to provision: ${err.message}`);
    results.push({ mission: m.name, status: "provision_failed" });
    continue;
  }

  try {
    await run("node", [
      "e2e/explore/run.mjs",
      `--mission=${m.name}`,
      `--url=${url}`,
      "--max-steps=30",
      // Gemini Flash is what the prior successful runs used. The
      // Anthropic default in run.mjs (claude-sonnet-4-5-20250929)
      // currently 404s on Stagehand's agent route — Gemini is the
      // working path right now.
      "--model=google/gemini-2.5-flash",
    ]);
    results.push({ mission: m.name, status: "ok" });
  } catch (err) {
    console.error(`    FAILED: ${err.message}`);
    results.push({ mission: m.name, status: "failed" });
  }
}

console.log("\n\n═══ Batch complete ═══");
for (const r of results) {
  console.log(`  ${r.status === "ok" ? "✓" : "✗"}  ${r.mission}`);
}
