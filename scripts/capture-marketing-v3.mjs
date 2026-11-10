// ─── Marketing screenshots, live v3 ──────────────────────────
// Shoots each sport page's tour from the real app: for every sport, a
// team and a game are seeded in the LOCAL database, the game is played
// through the UI on a phone (390 × 844 at 2×, light theme), and six
// moments are captured into public/marketing/screenshots/<slug>/:
//
//   live.png      mid-period, the next sub a few seconds off
//   pairs.png     the pairs sheet open (netball: its quarter plan)
//   scoring.png   "Who scored?" open after tapping the score button
//   break.png     the first break
//   fulltime.png  the full-time review, before Finish game
//   stats.png     the team's Stats page after the game
//   actions.png   a kid picked on the field, then More (the homepage)
//   runner.png    the parent's game-day link, signed out (the homepage)
//
// Everything seeded (a capture coach, the teams, games and kids) is
// deleted at the end, pass or fail. Names are made up.
//
// Needs a production build of this checkout served locally, with
// .env.test loaded (NEXT_PUBLIC_SUPABASE_URL must be http://127.0.0.1:…;
// anything else is refused):
//
//   node scripts/capture-marketing-v3.mjs --base=http://localhost:3750
//   node scripts/capture-marketing-v3.mjs --only=break            # one state, every sport
//   node scripts/capture-marketing-v3.mjs --sport=afl,netball      # some sports
//   node scripts/capture-marketing-v3.mjs --out=/tmp/shots         # somewhere else
//
// A state that can't be reached is reported and skipped (its old file
// stays); a debug screenshot of where it stuck goes next to the output.

import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
// The e2e factories and the sports registry are TypeScript; jiti loads
// them with the app's "@/" alias.
const jiti = require("jiti")(import.meta.url, { alias: { "@": path.join(ROOT, "src") } });
const { createAdminClient } = jiti(path.join(ROOT, "e2e/fixtures/supabase.ts"));
const { makeTeam, makeGame } = jiti(path.join(ROOT, "e2e/fixtures/factories.ts"));
const { getAgeGroupConfig } = jiti(path.join(ROOT, "src/lib/sports/index.ts"));

function flag(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

// The tour's six, then two the homepage uses: a kid's More sheet
// (actions) and the parent's game-day link (runner).
const STATES = ["live", "pairs", "scoring", "break", "fulltime", "stats", "actions", "runner"];
// The live screen's words for ending and starting a period.
const END = /^End (Q\d|H\d|game|1st half|2nd half|half \d|period \d|the period)$/i;
const START = /^start ((q|h|p)\d|2nd half|half \d|period \d)\b/i;
// The siren's own sheet, at time: its End button or "Select team for Q2".
const SIREN = /^(End (Q\d|H\d|game|1st half|2nd half|half \d|period \d|the period)|Select team for .+)$/i;

const BASE = flag("base", process.env.CAPTURE_BASE ?? "http://localhost:3750");
const OUT = path.resolve(flag("out", path.join(ROOT, "public/marketing/screenshots")));
const only = new Set(flag("only", STATES.join(",")).split(","));
for (const s of only) if (!STATES.includes(s)) throw new Error(`Unknown state "${s}". States: ${STATES.join(", ")}`);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^http:\/\/127\.0\.0\.1:\d+/.test(url) || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`Refusing: NEXT_PUBLIC_SUPABASE_URL must be a local http://127.0.0.1 Supabase (got "${url || "unset"}").`);
  process.exit(2);
}
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+/.test(BASE)) {
  console.error(`Refusing: --base must be a local server (got ${BASE}).`);
  process.exit(2);
}

// ── The sports ───────────────────────────────────────────────
// Age groups with scores on, so the scoring shots have a scorebug.
// Touch and Oztag are mixed teams (half girls, half boys).
const SPORTS = [
  { slug: "netball", sport: "netball", age: "11u", team: "Hawthorn Hornets", opponent: "Kew Kestrels", bench: 3 },
  { slug: "afl", sport: "afl", age: "U11", team: "Coburg Cubs", opponent: "Brunswick Bats", bench: 3 },
  { slug: "rugby-league", sport: "rugby_league", age: "U9", team: "Werribee Wolves", opponent: "Altona Hawks", bench: 3 },
  { slug: "soccer", sport: "soccer", age: "U12", team: "Kingsway United", opponent: "Coogee Crabs", bench: 3 },
  { slug: "basketball", sport: "basketball", age: "U12", team: "Dandenong Dingoes", opponent: "Frankston Flyers", bench: 3 },
  { slug: "rugby-union", sport: "rugby_union", age: "U9", team: "Randwick Rams", opponent: "Manly Marlins", bench: 3 },
  { slug: "touch-football", sport: "touch", age: "U11", team: "Cronulla Crocs", opponent: "Kogarah Kites", bench: 3, mixed: { mixed_max_boys: 3, mixed_min_girls: 1, mixed_min_boys: 1 } },
  { slug: "oztag", sport: "oztag", age: "U10", team: "Penrith Possums", opponent: "Blacktown Bandits", bench: 3, mixed: { mixed_max_boys: 4, mixed_min_girls: 2, mixed_min_boys: 1 } },
  { slug: "hockey", sport: "hockey", age: "U11", team: "Camberwell Comets", opponent: "Box Hill Bats", bench: 3 },
  { slug: "futsal", sport: "futsal", age: "U12", team: "Footscray Flames", opponent: "Sunshine Strikers", bench: 3 },
];
const wanted = flag("sport", "");
const sports = wanted ? SPORTS.filter((s) => wanted.split(",").includes(s.slug) || wanted.split(",").includes(s.sport)) : SPORTS;

const NAMES = [
  "Ava Nguyen", "Lachlan Smith", "Mia Patel", "Oliver Brown", "Isla Wilson", "Noah Taylor",
  "Ruby Martin", "Jack Anderson", "Zara Thompson", "Leo White", "Chloe Harris", "Hamish Clarke",
  "Matilda King", "Archie Walker", "Sienna Hall", "Cooper Young", "Grace Allen", "Hudson Wright",
];

// Every first-visit hint and walkthrough, already seen.
const SEEN = [
  "league-walkthrough-seen", "nb-walkthrough-seen", "gm-walkthrough-seen", "touch-walkthrough-seen",
  "soccer-walkthrough-seen", "basketball-walkthrough-seen", "lineup-confirm-hint", "swapcard-carry-hint",
  "scorer-sheet-hint", "dock-swap-hint",
];

const admin = createAdminClient();
const log = (...a) => console.log(...a);

// ── The capture coach ────────────────────────────────────────
// A run that was killed leaves its coach and teams behind: clear them first.
{
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data.users.filter((u) => /^marketing-capture-\d+@siren\.test$/.test(u.email ?? ""))) {
    await admin.from("teams").delete().eq("created_by", u.id);
    await admin.auth.admin.deleteUser(u.id);
    log(`Cleared a killed run's coach (${u.email}).`);
  }
}
const email = `marketing-capture-${Date.now()}@siren.test`;
const password = `Capture-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const { data: made, error: userErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (userErr) throw userErr;
const ownerId = made.user.id;
const teamIds = [];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: "light",
  reducedMotion: "reduce",
});
await context.addInitScript((keys) => {
  try {
    for (const k of keys) localStorage.setItem(k, "1");
    localStorage.setItem("siren-longpress-seen-v1", "true");
  } catch {}
}, SEEN);
const page = await context.newPage();
page.setDefaultTimeout(15_000);

const failures = [];
try {
  await signIn();
  for (const s of sports) {
    try {
      await captureSport(s);
    } catch (e) {
      failures.push(`${s.slug}: ${e.message.split("\n")[0]}`);
      log(`✗ ${s.slug}: ${e.message.split("\n")[0]}`);
      log((e.stack ?? "").split("\n").filter((l) => l.includes("capture-marketing-v3")).slice(0, 2).join("\n"));
      await debugShot(s, "error");
    }
  }
} finally {
  await browser.close();
  for (const id of teamIds) await admin.from("teams").delete().eq("id", id);
  await admin.auth.admin.deleteUser(ownerId);
  log(`Deleted the ${teamIds.length} seeded team(s) and the capture coach.`);
}
if (failures.length) {
  console.error(`\nNot captured:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}

// ── Steps ────────────────────────────────────────────────────

async function signIn() {
  await page.goto(`${BASE}/login`);
  await page.getByTestId("login-mode-toggle").click();
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/(dashboard|teams|welcome|onboarding)/, { timeout: 60_000 });
}

async function seed(s) {
  const team = await makeTeam(admin, { ownerId, sport: s.sport, ageGroup: s.age, name: s.team });
  teamIds.push(team.id);
  await admin.from("teams").update({ track_scoring: true, ...(s.mixed ?? {}) }).eq("id", team.id);
  const cfg = getAgeGroupConfig(s.sport, s.age);
  const squad = cfg.defaultOnFieldSize + s.bench;
  const { data: players, error } = await admin
    .from("players")
    .insert(
      NAMES.slice(0, squad).map((full_name, i) => ({
        team_id: team.id,
        full_name,
        jersey_number: i + 1,
        is_active: true,
        created_by: ownerId,
        ...(s.mixed ? { mixed_group: i % 2 ? "boy" : "girl" } : {}),
      })),
    )
    .select("id, full_name");
  if (error) throw new Error(`players: ${error.message}`);
  const game = await makeGame(admin, {
    teamId: team.id,
    ownerId,
    opponent: s.opponent,
    scheduledAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    roundNumber: 6,
  });
  // The first period runs at real time with a sub every minute, so its
  // shots come round quickly; the rest of the game is sped up (speed()).
  await admin.from("games").update({ sub_interval_seconds: 60, clock_multiplier: 1 }).eq("id", game.id);
  await admin
    .from("game_availability")
    .insert(players.map((p) => ({ game_id: game.id, player_id: p.id, status: "available", updated_by: ownerId })));
  return { team, game, players, cfg, live: `${BASE}/teams/${team.id}/games/${game.id}/live` };
}

async function captureSport(s) {
  log(`▶ ${s.slug}`);
  const g = await seed(s);
  const dir = path.join(OUT, s.slug);
  fs.mkdirSync(dir, { recursive: true });
  const shoot = async (state) => {
    if (!only.has(state)) return;
    await settle();
    await page.screenshot({ path: path.join(dir, `${state}.png`) });
    log(`  ✓ ${state}`);
  };
  const inPlay = ["live", "pairs", "scoring", "actions", "runner"].some((st) => only.has(st));
  const afterBreak = only.has("fulltime") || only.has("stats");
  const periods = g.cfg.periodCount;
  const periodS = g.cfg.periodSeconds;

  await page.goto(g.live);
  await kickOff();
  const kickoffAt = Date.now();

  if (inPlay || afterBreak) {
    // A goal each way early on, so the scorebug has a score.
    await score(g, true);
    await score(g, false);
  }
  if (inPlay) {
    if (only.has("scoring")) {
      await openScorer(g);
      await shoot("scoring");
      await pickScorer();
    }
    if (only.has("actions")) {
      await openKidActions();
      await shoot("actions");
      await closeSheet();
    }
    if (only.has("runner")) await shootRunner(g, dir);
    // The live screen with the next sub under half a minute off.
    if (only.has("live")) {
      await nextSubWithin(30);
      await shoot("live");
    }
    if (only.has("pairs") && (await rollingSubs())) {
      // Let the sub fall due with the screen open (it only fires then).
      await page.getByTestId("info-line").filter({ hasText: /sub due/i }).waitFor({ timeout: 70_000 });
      await openPairs();
      await shoot("pairs");
      await page.getByTestId("swapcard-apply-all").click();
      await writesSaved();
    }
  }

  // On to the period's last minute (the clock sped up so it lands there),
  // where netball plans the next quarter, then the first break.
  const realS = (Date.now() - kickoffAt) / 1000;
  await speed(g, Math.max(1, (periodS - 150) / realS), g.cfg.subIntervalSeconds);
  if (only.has("pairs") && !(await rollingSubs())) {
    await openPairs();
    await shoot("pairs");
    await closeSheet();
  }
  await endPeriod();
  await waitForBreak();
  await shoot("break");
  if (!afterBreak) return;

  // The rest of the game, each period about 40 s: subs as they fall due,
  // a score halfway, then the end.
  await speed(g, periodS / 40, g.cfg.subIntervalSeconds);
  for (let q = 2; q <= periods; q++) {
    await startFromBreak();
    const start = Date.now();
    let scored = false;
    while (Date.now() - start < 37_000) {
      try {
        if (await page.getByTestId("info-line").filter({ hasText: /sub due/i }).count()) await makeSubs();
        if (!scored && Date.now() - start > 15_000) scored = (await score(g, q % 2 === 0)) !== false;
      } catch {
        // The siren came early: end the period below.
        break;
      }
      await page.waitForTimeout(700);
    }
    await endPeriod();
    if (q < periods) await waitForBreak();
  }
  const finish = page.getByRole("button", { name: /finish game/i });
  await finish.waitFor({ timeout: 20_000 });
  await shoot("fulltime");
  await finish.click();
  await page.waitForTimeout(2_000);
  if (only.has("stats")) {
    // The first stats read backfills the season's minutes: give it time.
    await page.goto(`${BASE}/teams/${g.team.id}/stats`, { timeout: 60_000 });
    await page.waitForLoadState("load");
    await shoot("stats");
  }
}

/** Rolling subs: the info line counts down to the next one (netball's doesn't). */
async function rollingSubs() {
  const info = page.getByTestId("info-line");
  return (await info.count()) > 0 && /next sub|sub due/i.test((await info.first().textContent()) ?? "");
}

/** Wait until the info line's next sub is `secs` or fewer seconds off. */
async function nextSubWithin(secs) {
  const info = page.getByTestId("info-line");
  if (!(await rollingSubs())) return;
  for (let i = 0; i < 300; i++) {
    const m = /next sub\D*(\d+):(\d\d)/i.exec((await info.textContent()) ?? "");
    if (m && Number(m[1]) * 60 + Number(m[2]) <= secs) return;
    await page.waitForTimeout(250);
  }
}

/** A kid on the field picked, then More: switch, injured, went home, lend. */
async function openKidActions() {
  const field = page.getByRole("region", { name: /^on (field|court)$/i }).first();
  const scope = (await field.count()) ? field : page;
  // The field comes before the bench, so the first tile is on it
  // (player-tile-…, league-player-tile-…).
  await scope.locator("[data-testid*='player-tile-']").first().click();
  await page.getByTestId("kid-bar-more").click();
  await page.getByRole("dialog").last().waitFor();
}

/** The game-day link a parent is sent, opened on a phone with no account. */
async function shootRunner(g, dir) {
  const parent = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light", reducedMotion: "reduce" });
  await parent.addInitScript((keys) => {
    try {
      for (const k of keys) localStorage.setItem(k, "1");
      localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {}
  }, SEEN);
  const p = await parent.newPage();
  try {
    await p.goto(`${BASE}/run/${g.game.share_token}`);
    await p.getByRole("button", { name: /^clock — .+, running/i }).waitFor({ timeout: 30_000 });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(1_500);
    await p.screenshot({ path: path.join(dir, "runner.png") });
    log("  ✓ runner");
  } finally {
    await parent.close();
  }
}

/** The picker's Ready, then Start Q1 / H1 and its "now". */
async function kickOff() {
  await page.getByRole("button", { name: /^ready$/i }).click({ timeout: 30_000 });
  await page.getByRole("button", { name: /^clock — .+, not started$/i }).waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: /^start (q|h|p)1$/i }).click();
  await page.getByRole("button", { name: /^start .+ now$/i }).click();
  await page.getByRole("button", { name: /^clock — .+, running/i }).waitFor({ timeout: 20_000 });
  await skipAsides();
}

/** Asides that wait on the coach (rugby's "Who kicks off?"): skipped. */
async function skipAsides() {
  await page.waitForTimeout(600);
  const skip = page.getByRole("button", { name: /^skip$/i });
  if (await skip.count()) await skip.first().click().catch(() => {});
}

/**
 * Run the game's clock `multiplier` times real time from here on, with
 * subs every `subS` game seconds, and reload so the screen reads them.
 * The period's game time is (now − its start) × multiplier, so a jump
 * in speed moves the clock on too.
 */
async function speed(g, multiplier, subS) {
  await writesSaved();
  await admin.from("games").update({ clock_multiplier: multiplier, sub_interval_seconds: subS }).eq("id", g.game.id);
  await page.reload();
  await page
    .getByRole("button", { name: /^clock — /i })
    .or(page.getByRole("button", { name: START }))
    .filter({ visible: true })
    .first()
    .waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
}

/** A score for us (the first kid on the scorer sheet) or for them. */
async function score(g, ours) {
  const add = scoreButton(g, ours);
  // The bar shows the swaps instead while a sub is due.
  if (!(await add.count())) return false;
  await add.click();
  if (ours) await pickScorer();
  await writesSaved();
}

/** The bar's first score button for us or them ("Add goal, Hawks"; rugby's "Record a try for our team"). */
function scoreButton(g, ours) {
  const team = escape(ours ? g.team.name : opponentName(g));
  const name = ours
    ? new RegExp(`^(Add .+, ${team}|Record an? .+ for our team)$`)
    : new RegExp(`^(Add .+, ${team}|Record opponent .+)$`);
  // Basketball's +1 / +2 / +3: a basket (2 points) rather than a free throw.
  return page.getByRole("button", { name }).and(page.getByRole("button", { name: /^(?!Add 1 point,)/ })).first();
}

async function openScorer(g) {
  await scoreButton(g, true).click();
  await page.getByRole("dialog", { name: /who scored|^record /i }).waitFor();
}

/** On "Who scored?": the first kid. */
async function pickScorer() {
  const sheet = page.getByRole("dialog", { name: /who scored|^record /i });
  await sheet.waitFor();
  const kid = sheet.locator("button").filter({ hasText: new RegExp(NAMES.map((n) => n.split(" ")[0]).join("|")) }).first();
  await kid.click();
  // Rugby asks for the conversion next: the first kicker, made.
  await page.waitForTimeout(900);
  const kicking = page.getByRole("dialog").filter({ hasText: /who's kicking/i });
  if (await kicking.count()) await kicking.getByRole("button", { name: /made/i, disabled: false }).first().click();
  await page.getByRole("dialog").first().waitFor({ state: "hidden", timeout: 8_000 }).catch(() => {});
}

async function openPairs() {
  const info = page.getByTestId("info-line");
  if (await rollingSubs()) {
    await info.click();
    await page.getByRole("dialog").first().waitFor();
    return;
  }
  // Netball has no rolling subs: its plan for the next quarter.
  await page.getByRole("button", { name: /plan q\d/i }).first().click();
  await page.getByRole("dialog").first().waitFor();
}

/** Every suggested swap, from the pairs sheet, if there are any. */
async function makeSubs() {
  const info = page.getByTestId("info-line");
  if (!(await rollingSubs())) return;
  await info.click();
  const all = page.getByTestId("swapcard-apply-all");
  try {
    await all.waitFor({ timeout: 5_000 });
    await all.click();
    await page.getByRole("dialog").filter({ has: all }).waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
  } catch {
    await closeSheet();
  }
  await writesSaved();
}

/** Close whatever sheet is open: its Close or Cancel, else Escape. */
async function closeSheet() {
  const dialog = page.getByRole("dialog").last();
  const close = dialog.getByRole("button", { name: /^(close|cancel|done)$/i }).last();
  if (await close.count()) await close.click();
  else await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(300);
}

/**
 * End the period: the hooter's own "End Q1" if it's up, else ⋯ → End Q1
 * (End 1st half…), then the confirm's End. Nothing if it has ended.
 */
async function endPeriod() {
  // The siren can sound mid-way (its sheet then covers the menu), so try again.
  for (let tries = 0; tries < 3; tries++) {
    await page.waitForTimeout(500);
    if (await atBreakOrFullTime()) return;
    try {
      const siren = page.getByRole("dialog").getByRole("button", { name: SIREN });
      if (await siren.count()) {
        await siren.last().click({ timeout: 5_000 });
      } else {
        await page.getByRole("button", { name: "Game menu" }).click({ timeout: 5_000 });
        await page.getByRole("dialog", { name: "Game menu" }).getByRole("button", { name: END }).click({ timeout: 5_000 });
      }
      const confirm = page.getByRole("dialog", { name: /^End .+ now\?$/ });
      await confirm.waitFor({ timeout: 4_000 }).catch(() => {});
      if (await confirm.count()) await confirm.getByRole("button", { name: /^End / }).last().click();
      await writesSaved();
      await page.getByRole("button", { name: START }).or(page.getByRole("button", { name: /finish game/i })).first().waitFor({ timeout: 10_000 });
      return;
    } catch {
      await page.keyboard.press("Escape");
    }
  }
  throw new Error("couldn't end the period");
}

async function atBreakOrFullTime() {
  return (
    (await page.getByRole("button", { name: START }).count()) > 0 ||
    (await page.getByRole("button", { name: /finish game/i }).count()) > 0
  );
}

async function waitForBreak() {
  await page.getByRole("button", { name: START }).first().waitFor({ timeout: 20_000 });
}

async function startFromBreak() {
  await page.getByRole("button", { name: START }).first().click();
  const anyway = page.getByRole("button", { name: "Start anyway" });
  const now = page.getByRole("button", { name: /^start .+ now$/i });
  await anyway.or(now).first().waitFor();
  await ((await anyway.isVisible()) ? anyway : now).click();
  await page.getByRole("button", { name: /^clock — .+, running/i }).waitFor({ timeout: 20_000 });
  await skipAsides();
}

/** Every write this phone queued, saved (lib/live/writeQueue). */
async function writesSaved() {
  for (let i = 0; i < 80; i++) {
    const n = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem("siren-write-queue-v1");
        return raw ? JSON.parse(raw)?.state?.queue?.length ?? 0 : 0;
      } catch {
        return 0;
      }
    });
    if (n === 0) return;
    await page.waitForTimeout(250);
  }
  throw new Error("live writes didn't save");
}

/** Fonts in, toasts and slides over. */
async function settle() {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1_200);
}

async function debugShot(s, what) {
  try {
    const p = path.join(OUT, `${s.slug}-${what}-debug.png`);
    await page.screenshot({ path: p });
    log(`  debug: ${p}`);
  } catch {}
}

function opponentName(g) {
  return g.game.opponent ?? SPORTS.find((x) => x.team === g.team.name)?.opponent ?? "";
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
