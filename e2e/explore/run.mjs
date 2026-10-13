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
// Claude Haiku 5.5 explores and judges. Sonnet 5.5 rejects the forced
// "done" tool call Stagehand makes at the end of a run, and the 4.5
// snapshot is gone.
const modelName = flag("model", "anthropic/claude-haiku-5-5");
// act()/observe() send a temperature, which current Claude models
// reject, so the clicks themselves go through a model that takes one.
const actModel = flag("act-model", modelName);
const headed = flag("headed", "true") !== "false";
// --as=coach: start signed in as a brand-new coach (fresh account, no
// teams), the way a real first-timer lands after the email link.
// Without it the agent starts wherever --url points (runner links).
const as = flag("as", "");
// --seed=NAME (with --as=coach): the coach already has a team, squad and
// a game today, so a game-day mission starts where a Saturday does.
const seed = flag("seed", "");

// ─── Load mission prompt ───────────────────────────────────────
const missionPath = resolve(__dirname, "missions", `${mission}.md`);
if (!existsSync(missionPath)) {
  console.error(`Mission file not found: ${missionPath}`);
  console.error(`Available missions: ${listMissions().join(", ")}`);
  process.exit(1);
}
const missionPrompt = readFileSync(missionPath, "utf8");

// Resolve which provider key to use based on the model's `provider/`
// prefix. Stagehand v3 routes by AISDK provider, so the api key has
// to match the model — passing an Anthropic key with a Google model
// would silently fall through to AISDK's default env-var lookup.
function resolveApiKey(model) {
  if (model.startsWith("anthropic/")) return process.env.ANTHROPIC_API_KEY;
  if (model.startsWith("openai/") || model.startsWith("gpt-"))
    return process.env.OPENAI_API_KEY;
  if (model.startsWith("google/") || model.startsWith("gemini-"))
    return process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  // Unprefixed legacy model name — fall back through provider order.
  return (
    process.env.ANTHROPIC_API_KEY ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.OPENAI_API_KEY
  );
}

// Shells launched by Claude Code inherit an ANTHROPIC_BASE_URL for the
// CLI's own traffic; the AI SDK honours it, so the project's key went
// to the wrong endpoint ("Not Found"). Talk to Anthropic directly
// unless --anthropic-base-url says otherwise.
const anthropicBaseUrl = flag("anthropic-base-url", "");
if (anthropicBaseUrl) process.env.ANTHROPIC_BASE_URL = anthropicBaseUrl;
else delete process.env.ANTHROPIC_BASE_URL;

const apiKey = resolveApiKey(modelName);
if (!apiKey) {
  console.error(
    `No API key in env for model "${modelName}". Set ANTHROPIC_API_KEY, ` +
      `OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY (in .env.local or shell).`,
  );
  process.exit(1);
}

console.log(`▶ Mission: ${mission}`);
console.log(`▶ Start URL: ${startUrl}`);
console.log(`▶ Model: ${modelName} (clicks: ${actModel})`);
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
  modelName: actModel,
  modelClientOptions: { apiKey: resolveApiKey(actModel) },
  verbose: 1,
  localBrowserLaunchOptions: {
    headless: !headed,
    // Mobile viewport — matches the real coach context (phone on the
    // sideline). The Playwright e2e config also runs at Pixel 7.
    viewport: { width: 412, height: 915 },
  },
});

await stagehand.init();

// ─── Optional: a fresh coach account, signed in ────────────────
// The /login flow is email-first with a magic link the agent can't
// click, so (like e2e/tests/onboarding.spec.ts) we create a confirmed
// user with the admin SDK and sign in with the password fallback.
// The password is random and never printed; the email goes in the
// report so the account's data can be inspected afterwards.
let coachEmail = null;
let seededStart = null;
if (as === "coach") {
  const { createClient } = await import("@supabase/supabase-js");
  const { randomBytes } = await import("node:crypto");
  // The local stack the dev server runs on (scripts/dev-local.mjs reads
  // .env.test). NOT .env.local: that holds production values.
  const testEnv = {};
  const testEnvPath = resolve(__dirname, "..", "..", ".env.test");
  if (existsSync(testEnvPath)) {
    for (const line of readFileSync(testEnvPath, "utf8").split(/\r?\n/)) {
      const eq = line.indexOf("=");
      if (!line || line.startsWith("#") || eq < 1) continue;
      testEnv[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^"|"$/g, "");
    }
  }
  const supaUrl = testEnv.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = testEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !serviceKey) {
    console.error("--as=coach needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.test");
    process.exit(1);
  }
  if (!["localhost", "127.0.0.1"].includes(new URL(supaUrl).hostname)) {
    console.error(`--as=coach only creates accounts on a local Supabase; .env.test points at ${new URL(supaUrl).host}.`);
    process.exit(1);
  }
  const admin = createClient(supaUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  coachEmail = `stagehand-${mission}-${Date.now()}@siren.test`;
  const password = randomBytes(18).toString("base64url");
  const { error: createErr } = await admin.auth.admin.createUser({ email: coachEmail, password, email_confirm: true });
  if (createErr) {
    console.error(`Couldn't create the coach account: ${createErr.message}`);
    process.exit(1);
  }
  const origin = new URL(startUrl).origin;
  const loginPage = await stagehand.context.newPage(`${origin}/login`);
  await loginPage.waitForSelector('[data-testid="login-mode-toggle"]', { timeout: 30_000 });
  // The toggle only works once React has hydrated; a click before that
  // is lost, so retry until the password field shows.
  for (let i = 0; i < 10; i++) {
    await loginPage.locator('[data-testid="login-mode-toggle"]').click();
    const shown = await loginPage
      .waitForSelector('[data-testid="login-password"]', { timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (shown) break;
  }
  // Keystrokes, not fill(): the inputs are React-controlled.
  await loginPage.locator('[data-testid="login-email"]').click();
  await loginPage.locator('[data-testid="login-email"]').type(coachEmail);
  await loginPage.locator('[data-testid="login-password"]').click();
  await loginPage.locator('[data-testid="login-password"]').type(password);
  await loginPage.locator('[data-testid="login-submit"]').click();
  for (let i = 0; i < 60 && loginPage.url().includes("/login"); i++) await loginPage.waitForTimeout(500);
  if (loginPage.url().includes("/login")) {
    console.error("Sign-in didn't leave /login.");
    process.exit(1);
  }
  console.log(`▶ Signed in as ${coachEmail}`);
  await loginPage.close();
  if (seed) seededStart = await seedTeam(admin, coachEmail, seed, origin);
}

// Stagehand v3 dropped the top-level `stagehand.page` accessor —
// pages now hang off `stagehand.context`. `newPage(url)` opens a
// page already navigated to the start URL, which we then thread
// into the agent via `execute({ page })` so the agent acts on
// this page instead of opening its own.
const page = await stagehand.context.newPage(
  seededStart ?? (as === "coach" && startUrl.endsWith("/login") ? startUrl.replace(/\/login$/, "/dashboard") : startUrl),
);

// ─── Run the agent ─────────────────────────────────────────────
// v3 fields are `systemPrompt` (not v2's `instructions`) and `model`
// (the agent's own model config — separate from the constructor's
// legacy modelName). AgentModelConfig is `{ modelName }` plus
// arbitrary keys, so we pass apiKey there to override AISDK's
// default env-var lookup.
const agent = stagehand.agent({
  // hybrid: coordinate clicks from screenshots plus the aria tree, so a
  // usability run sees what a coach sees. "dom" is Stagehand legacy.
  mode: flag("mode", "hybrid"),
  systemPrompt:
    "You are an exploratory tester for a junior football and netball app. " +
    "You think like a volunteer coach using the app for the first time. " +
    "You're MORE interested in usability, broken flows, and confusing UI " +
    "than in completing the task perfectly. Report what you observe " +
    "alongside the actions you took.",
  model: { modelName, apiKey },
  // The tool calls behind each click/type (see actModel above).
  executionModel: { modelName: actModel, apiKey: resolveApiKey(actModel) },
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
  `- **Model**: ${modelName} (clicks: ${actModel})`,
  `- **Max steps**: ${maxSteps}`,
  ...(coachEmail ? [`- **Coach account**: ${coachEmail}${seed ? ` (seed: ${seed})` : ""}`] : []),
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

/**
 * Game-day seeds for --seed: a team owned by the fresh coach, a squad,
 * How we play choices, and a game starting soon with everyone
 * available. Quarters run 8× fast (as fresh-explore-token.mjs) so the
 * agent reaches a break. Returns the team's Today tab URL.
 */
async function seedTeam(admin, email, name, origin) {
  // Each seed: the team, its How we play, a squad, and the game the
  // mission plays. Options:
  //   start      today (Today tab) | runner (share link) | game (game page)
  //   gameIn     minutes until the game (default 30; a day = 1440)
  //   pastGames  finished games with events, so stats and season balance
  //              have something to show
  //   morning    netball: a game already played this morning (carnival)
  //   prefs      [squad index, { position_key | line, kind }]
  //   onField    the game's on-field size (else the column default)
  const SEEDS = {
    "afl-u12-gameday": {
      team: { name: "Bayside Bandicoots", age_group: "U12", sport: "afl" },
      playbook: { strategy: "preferred-lines" },
      squad: 17,
    },
    "afl-u15-gameday": {
      team: { name: "Brunswick Bears", age_group: "U15", sport: "afl" },
      playbook: { strategy: "set-positions" },
      squad: 20,
    },
    "netball-11u-gameday": {
      team: { name: "Hawthorn Hornets", age_group: "11u", sport: "netball" },
      playbook: { strategy: "position-by-position" },
      squad: 9,
    },
    "afl-u10-runner": {
      team: { name: "Coburg Cubs", age_group: "U10", sport: "afl" },
      playbook: null,
      squad: 15,
      start: "runner",
    },
    "afl-u13-tomorrow": {
      team: { name: "Kew Kookaburras", age_group: "U13", sport: "afl" },
      playbook: { strategy: "set-positions" },
      squad: 18,
      gameIn: 20 * 60,
      prefs: [
        [0, { position_key: "ff", kind: "home" }],
        [1, { position_key: "fb", kind: "home" }],
        [2, { position_key: "c", kind: "home" }],
        [3, { position_key: "r", kind: "home" }],
      ],
    },
    "afl-u12-season": {
      team: { name: "Bayside Bandicoots", age_group: "U12", sport: "afl" },
      playbook: { strategy: "preferred-lines", season_balance: "balanced" },
      squad: 16,
      pastGames: 3,
      gameIn: 3 * 24 * 60,
      prefs: [[4, { line: "fwd", kind: "home" }]],
    },
    "league-u11-gameday": {
      team: { name: "Werribee Wolves", age_group: "U11", sport: "rugby_league" },
      playbook: { strategy: "named-positions", vest_strategy: "fixed-order" },
      squad: 15,
      prefs: [
        [2, { position_key: "hk", kind: "home" }],
        [6, { position_key: "fb", kind: "home" }],
      ],
    },
    // International laws: 13-a-side, penalty and field goals, no vests
    // or kicking rotations.
    "league-u13-gameday": {
      team: { name: "Werribee Wolves", age_group: "U13", sport: "rugby_league" },
      playbook: { strategy: "named-positions" },
      squad: 17,
      onField: 13,
      prefs: [
        [1, { position_key: "hk", kind: "home" }],
        [8, { position_key: "hb", kind: "home" }],
      ],
    },
    "netball-11u-carnival": {
      team: { name: "Preston Panthers", age_group: "11u", sport: "netball" },
      playbook: {
        strategy: "by-thirds",
        season_balance: "off",
        rules: [{ id: "carnival", kind: "every-line-per-day", params: {}, strength: "prefer", enabled: true, source: "pack:netball-carnival-day" }],
      },
      squad: 10,
      morning: true,
      gameIn: 10,
    },
  };
  const s = SEEDS[name];
  if (!s) {
    console.error(`Unknown --seed=${name}. Seeds: ${Object.keys(SEEDS).join(", ")}`);
    process.exit(1);
  }
  const NAMES = [
    "Ava Nguyen", "Lachlan Smith", "Mia Patel", "Oliver Brown", "Isla Wilson", "Noah Taylor",
    "Ruby Martin", "Jack Anderson", "Zara Thompson", "Leo White", "Chloe Harris", "Hamish Clarke",
    "Matilda King", "Archie Walker", "Sienna Hall", "Cooper Young", "Grace Allen", "Hudson Wright",
    "Eloise Scott", "Max Green", "Harper Baker", "Toby Adams",
  ];
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const ownerId = users.users.find((u) => u.email === email).id;
  // Insert, then read back: an AFTER INSERT trigger makes the coach a
  // member, which the select policy needs.
  // Scoring on, as the wizard defaults it, so missions can record goals.
  const { error: teamErr } = await admin.from("teams").insert({ ...s.team, track_scoring: true, created_by: ownerId });
  if (teamErr) throw new Error(`seed team: ${teamErr.message}`);
  const { data: team } = await admin.from("teams").select("id").eq("created_by", ownerId).single();
  if (s.playbook) await admin.from("team_playbooks").insert({ team_id: team.id, ...s.playbook });
  const { data: players } = await admin
    .from("players")
    .insert(
      NAMES.slice(0, s.squad).map((full_name, i) => ({
        team_id: team.id,
        full_name,
        jersey_number: i + 1,
        is_active: true,
        created_by: ownerId,
      })),
    )
    .select("id, jersey_number")
    .order("jersey_number");
  const ids = players.map((p) => p.id);
  for (const [i, pref] of s.prefs ?? []) {
    await admin.from("player_position_prefs").insert({ team_id: team.id, player_id: ids[i], ...pref });
  }

  // Finished games: one lineup per quarter, rotating who sits, a goal or two.
  const minsAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();
  async function playedGame(opponent, startMinsAgo, quarters, lineupFor) {
    const { data: past, error } = await admin
      .from("games")
      .insert({
        team_id: team.id,
        opponent,
        scheduled_at: minsAgo(startMinsAgo + 10),
        created_by: ownerId,
        status: "completed",
      })
      .select("id")
      .single();
    if (error) throw new Error(`seed past game: ${error.message}`);
    const events = [];
    let t = startMinsAgo;
    for (let q = 1; q <= quarters; q++) {
      const { lineup, type } = lineupFor(q);
      events.push({ game_id: past.id, type, metadata: q === 1 || type === "lineup_set" ? { lineup } : { quarter: q, lineup, sport: "netball", midQuarterSubs: [] }, created_by: ownerId, created_at: minsAgo(t + 0.05) });
      events.push({ game_id: past.id, type: "quarter_start", metadata: { quarter: q }, created_by: ownerId, created_at: minsAgo(t) });
      events.push({ game_id: past.id, type: "quarter_end", metadata: { quarter: q, elapsed_ms: 10 * 60_000 }, created_by: ownerId, created_at: minsAgo(t - 10) });
      t -= 12;
    }
    events.push({ game_id: past.id, type: "game_finalised", metadata: { quarter: quarters }, created_by: ownerId, created_at: minsAgo(t) });
    await admin.from("game_events").insert(events);
  }
  if (s.pastGames) {
    // AFL, 12 on: three lines of four, the rest on the bench, rotating.
    for (let gNo = 0; gNo < s.pastGames; gNo++) {
      await playedGame(["Elwood Eels", "Hampton Hawks", "Mentone Magpies"][gNo % 3], (s.pastGames - gNo) * 7 * 24 * 60, 4, (q) => {
        const shift = (gNo * 4 + q) % ids.length;
        const order = [...ids.slice(shift), ...ids.slice(0, shift)];
        return {
          type: "lineup_set",
          lineup: { back: order.slice(0, 4), hback: [], mid: order.slice(4, 8), hfwd: [], fwd: order.slice(8, 12), bench: order.slice(12) },
        };
      });
    }
  }
  if (s.morning) {
    // Netball carnival: this morning's game, two quarters. Everyone has a
    // turn in attack except the first kid (centre, then defence).
    const keys = ["gs", "ga", "wa", "c", "wd", "gd", "gk"];
    const lineupOf = (order) => ({ positions: Object.fromEntries(keys.map((k, i) => [k, [order[i]]])), bench: order.slice(7) });
    const [a, b, c, d, e, f, g, h, i2, j] = ids;
    await playedGame("Thornbury Thunder", 150, 2, (q) =>
      q === 1
        ? { type: "lineup_set", lineup: lineupOf([b, c, d, a, e, f, g, h, i2, j]) }
        : { type: "period_break_swap", lineup: lineupOf([h, i2, j, b, c, d, a, e, f, g]) },
    );
  }

  const { data: game, error: gameErr } = await admin
    .from("games")
    .insert({
      team_id: team.id,
      opponent: "Sandringham Sharks",
      scheduled_at: new Date(Date.now() + (s.gameIn ?? 30) * 60_000).toISOString(),
      round_number: (s.pastGames ?? 0) + 4,
      created_by: ownerId,
      clock_multiplier: 8,
      // Past the quarter, so "Sub due" doesn't fire within seconds at 8x.
      sub_interval_seconds: 900,
      ...(s.onField ? { on_field_size: s.onField } : {}),
    })
    .select("id, share_token")
    .single();
  if (gameErr) throw new Error(`seed game: ${gameErr.message}`);
  await admin.from("game_availability").insert(
    ids.map((pid) => ({ game_id: game.id, player_id: pid, status: "available", updated_by: ownerId })),
  );
  console.log(`▶ Seeded ${s.team.name} (${name})`);
  if (s.start === "runner") return `${origin}/run/${game.share_token}`;
  if (s.start === "game") return `${origin}/teams/${team.id}/games/${game.id}`;
  return `${origin}/teams/${team.id}`;
}
function listMissions() {
  const fs = require("node:fs");
  const dir = resolve(__dirname, "missions");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}
