// Wires git's hooksPath to the tracked .githooks directory so the
// pre-push lint gate (and any future hooks) fire automatically.
//
// Runs as the `prepare` npm script — `npm install` triggers it, so
// every fresh clone + every worktree picks up the hook without the
// developer doing anything.
//
// Defensive against three cases where wiring a hook would be wrong:
//   1. Not in a git checkout (e.g. tarball install, CI Docker image
//      that copies node_modules in) — `git rev-parse` errors.
//   2. CI environment (GitHub Actions, Vercel, etc.) — hooks here
//      are noise; CI runs lint as its own step. Detected via the
//      common `CI` env var.
//   3. User explicitly disabled hooks for this repo — they may have
//      `core.hooksPath` set to something else on purpose. We only
//      set it if it's unset OR already pointing at .githooks.

import { execSync } from "node:child_process";

function silentlyExit(reason) {
  // Stay silent on the common "this isn't relevant" cases so
  // `npm install` output stays clean. Vercel installs run dozens
  // of times a day; no value in noisy "skipped" messages.
  process.exit(0);
}

if (process.env.CI) silentlyExit("CI environment");

// Confirm we're inside a git checkout — `prepare` can run from a
// tarball install where there is no .git, in which case git itself
// errors out and there's nothing useful for the hook to do.
try {
  execSync("git rev-parse --git-dir", { stdio: "ignore" });
} catch {
  silentlyExit("not a git checkout");
}

// Read current setting. If it's already pointing at .githooks we're
// done. If it's pointing somewhere else, respect the user's choice
// and don't clobber it.
let current = "";
try {
  current = execSync("git config --get core.hooksPath", {
    stdio: ["ignore", "pipe", "ignore"],
  })
    .toString()
    .trim();
} catch {
  // Unset — `git config --get` exits 1, which the try/catch swallows.
}

if (current === ".githooks") {
  process.exit(0);
}

if (current && current !== ".githooks") {
  // User has their own hooksPath. Don't overwrite.
  console.log(
    `[install-git-hooks] core.hooksPath is set to "${current}" — leaving it alone.`,
  );
  process.exit(0);
}

try {
  execSync("git config core.hooksPath .githooks", { stdio: "ignore" });
  console.log("[install-git-hooks] Wired core.hooksPath → .githooks");
} catch (err) {
  // Non-fatal — the developer can run the command manually if they
  // want hooks. Don't break their `npm install` over it.
  console.warn(
    `[install-git-hooks] Could not set core.hooksPath: ${err.message}`,
  );
}
