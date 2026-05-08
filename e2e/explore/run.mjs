// ─── Stagehand exploration runner ──────────────────────────────
// Drives a Stagehand agent against the local dev server with a
// natural-language mission. The agent navigates, clicks, fills
// forms, and reports back what it found. Use this for usability
// audits, exploratory testing, or "act like a confused user and
// see what breaks" sessions.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-... node e2e/explore/run.mjs
//   ANTHROPIC_API_KEY=sk-... node e2e/explore/run.mjs --mission=game-day-flow
//   ANTHROPIC_API_KEY=sk-... node e2e/explore/run.mjs --url=http://localhost:3000/run/<token>
//
// Cost: ~$0.10–0.50 per run with Claude Sonnet 4.5 at maxSteps=25.
// Reports land in e2e/explore/reports/<timestamp>.md.

import { Stagehand } from "@browserbasehq/stagehand";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Auto-load .env.local so ANTHROPIC_API_KEY (and any other vars the
// runner might reach for later) don't have to be exported every
// session. Mirrors Next.js's own behaviour for the dev server. We
// only set keys that aren't already in process.env so an explicit
// shell export still wins.
(() => {
  const envPath = resolve(__dirname, "..", "..", ".env.local");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    // Truthy check, NOT `!== undefined`. Some shells (e.g. the
    // Claude Code wrapper) export `ANTHROPIC_API_KEY=""` to prevent
    // accidental key reuse — and an `!== undefined` guard would skip
    // it, leaving the script stuck on "Need ANTHROPIC_API_KEY". An
    // explicit non-empty export still wins.
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

// ─── CLI args ──────────────────────────────────────────────────
function flag(name, defaultValue) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : defaultValue;
}

const mission = flag("mission", "coach-onboarding");
const startUrl = flag("url", "http://localhost:3000/login");
const maxSteps = parseInt(flag("max-steps", "25"), 10);
// Stagehand v3's agent uses AISDK provider routing — model names need
// a `provider/model` prefix (e.g. "anthropic/claude-sonnet-4-5-20250929").
// Default to the latest Sonnet snapshot from the CUA-supported list so
// it works in both DOM and hybrid modes.
const modelName = flag("model", "anthropic/claude-sonnet-4-5-20250929");
const headed = flag("headed", "true") !== "false";

// ─── Load mission prompt ───────────────────────────────────────
const missionPath = resolve(__dirname, "missions", `${mission}.md`);
if (!existsSync(missionPath)) {
  console.error(`Mission file not found: ${missionPath}`);
  console.error(`Available missions: ${listMissions().join(", ")}`);
  process.exit(1);
}
const missionPrompt = readFileSync(missionPath, "utf8");

if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
  console.error(
    "Need ANTHROPIC_API_KEY (or OPENAI_API_KEY for GPT models) in env.",
  );
  process.exit(1);
}

console.log(`▶ Mission: ${mission}`);
console.log(`▶ Start URL: ${startUrl}`);
console.log(`▶ Model: ${modelName}`);
console.log(`▶ Max steps: ${maxSteps}\n`);

// ─── Bootstrap Stagehand ───────────────────────────────────────
// Stagehand v3 splits model config: the constructor's modelName /
// modelClientOptions feeds act()/extract()/observe() (legacy direct
// calls), while the agent has its OWN model config passed at
// stagehand.agent({ model }) time. We wire both so either path
// works — and if a future version drops the legacy plumbing the
// agent side is still configured.
const stagehand = new Stagehand({
  env: "LOCAL",
  modelName,
  modelClientOptions: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY,
  },
  verbose: 1,
  localBrowserLaunchOptions: {
    headless: !headed,
    // Mobile viewport — matches the real coach context (phone on the
    // sideline). The Playwright e2e config also runs at Pixel 7.
    viewport: { width: 412, height: 915 },
  },
});

await stagehand.init();

// Stagehand v3 dropped the top-level `stagehand.page` accessor —
// pages now hang off `stagehand.context`. `newPage(url)` opens a
// page already navigated to the start URL, which we then thread
// into the agent via `execute({ page })` so the agent acts on
// this page instead of opening its own.
const page = await stagehand.context.newPage(startUrl);

// ─── Run the agent ─────────────────────────────────────────────
// v3 fields are `systemPrompt` (not v2's `instructions`) and `model`
// (the agent's own model config — separate from the constructor's
// legacy modelName). AgentModelConfig is `{ modelName }` plus
// arbitrary keys, so we pass apiKey there to override AISDK's
// default env-var lookup.
const agent = stagehand.agent({
  systemPrompt:
    "You are an exploratory tester for a junior football and netball app. " +
    "You think like a volunteer coach using the app for the first time. " +
    "You're MORE interested in usability, broken flows, and confusing UI " +
    "than in completing the task perfectly. Report what you observe " +
    "alongside the actions you took.",
  model: {
    modelName,
    apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY,
  },
});

const result = await agent.execute({
  instruction: missionPrompt,
  maxSteps,
  page,
});

// ─── Capture report ────────────────────────────────────────────
const reportsDir = resolve(__dirname, "reports");
mkdirSync(reportsDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = resolve(reportsDir, `${ts}-${mission}.md`);

const lines = [
  `# Stagehand exploration — ${mission}`,
  ``,
  `- **Start URL**: ${startUrl}`,
  `- **Model**: ${modelName}`,
  `- **Max steps**: ${maxSteps}`,
  `- **Completed**: ${result.completed ? "yes" : "no"}`,
  `- **Success**: ${result.success ? "yes" : "no"}`,
  ``,
  `## Mission`,
  ``,
  missionPrompt,
  ``,
  `## Final report`,
  ``,
  result.message ?? "(no message)",
  ``,
  `## Action log`,
  ``,
];

for (const action of result.actions ?? []) {
  lines.push(`- **${action.type ?? "action"}**: ${JSON.stringify(action)}`);
}

if (result.usage) {
  lines.push(``, `## Token usage`, ``);
  lines.push(`- input_tokens: ${result.usage.input_tokens}`);
  lines.push(`- output_tokens: ${result.usage.output_tokens}`);
  if (result.usage.reasoning_tokens) {
    lines.push(`- reasoning_tokens: ${result.usage.reasoning_tokens}`);
  }
}

writeFileSync(reportPath, lines.join("\n"), "utf8");
console.log(`\n✓ Report written to ${reportPath}`);

await stagehand.close();

// ─── Helpers ───────────────────────────────────────────────────
function listMissions() {
  const fs = require("node:fs");
  const dir = resolve(__dirname, "missions");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}
