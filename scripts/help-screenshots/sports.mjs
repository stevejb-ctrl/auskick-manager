// ─── Sport hub screenshots ───────────────────────────────────
// Plays each sport's demo game (seed.mjs, sport-teams.mjs) through the
// live screen on a phone (390 × 844 at 2×, light theme) and shoots the
// moments its help hub (/help/<slug>) shows, into
// public/help-screenshots/<slug>/:
//
//   live.png      mid-period, the next sub a few seconds off
//   pairs.png     the pairs sheet with a sub due (netball: its Plan Q2 sheet)
//   scoring.png   "Who scored?" after tapping the score button
//   break.png     the first break
//   fulltime.png  the full-time review, before Finish game
//
// Then it puts each game back as the seed left it (upcoming, nothing
// recorded), so the demo accounts stay as seeded.
//
//   1. Serve a production build of this checkout locally with .env.test
//      loaded (never .env.local): next build && next start -p 3712
//   2. node scripts/help-screenshots/seed.mjs
//   3. HELP_SHOTS_BASE=http://localhost:3712 SHARP_DIR=<dir> \
//        node scripts/help-screenshots/sports.mjs [--sport=netball,afl] [--only=break]
//   4. Update src/lib/help/screenshots.ts with any new sizes; its test
//      says which.
//
// The game's clock is sped up after the first period (clock_multiplier),
// so a sport takes about five minutes. A state that can't be reached is
// reported and skipped (its old file stays).
import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO, STATE_DIR, SPORTS_COACH, admin, must, setGameEvents } from "./lib.mjs";
import { SPORT_TEAMS } from "./sport-teams.mjs";

function flag(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const STATES = ["live", "pairs", "scoring", "break", "fulltime"];
const only = new Set(flag("only", STATES.join(",")).split(","));
for (const s of only) if (!STATES.includes(s)) throw new Error(`Unknown state "${s}". States: ${STATES.join(", ")}`);
const wanted = flag("sport", "");
const sports = wanted ? SPORT_TEAMS.filter((s) => wanted.split(",").includes(s.slug)) : SPORT_TEAMS;

const BASE = process.env.HELP_SHOTS_BASE ?? "http://localhost:3712";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+/.test(BASE)) {
  console.error(`Refusing: HELP_SHOTS_BASE must be a local server (got ${BASE}).`);
  process.exit(2);
}
const OUT = path.join(REPO, "public", "help-screenshots");
const ids = JSON.parse(readFileSync(path.join(STATE_DIR, "help-ids.json"), "utf8"));
if (!ids.sports) throw new Error("No sport teams in help-ids.json: run seed.mjs first.");

function loadSharp() {
  const from = process.env.SHARP_DIR ? path.join(process.env.SHARP_DIR, "package.json") : import.meta.url;
  try {
    return createRequire(from)("sharp");
  } catch {
    console.error("sharp not found: npm i --prefix <dir> sharp@0.33, then set SHARP_DIR=<dir>");
    process.exit(1);
  }
}
const sharp = loadSharp();

// The live screen's words for ending and starting a period.
const END = /^End (Q\d|H\d|P\d|game|1st half|2nd half|half \d|period \d|the period)$/i;
const START = /^start ((q|h|p)\d|2nd half|half \d|period \d)\b/i;
const SIREN = /^(End (Q\d|H\d|P\d|game|1st half|2nd half|half \d|period \d|the period)|Select team for .+)$/i;
// Every first-visit hint and walkthrough, already seen.
const SEEN = [
  "league-walkthrough-seen", "nb-walkthrough-seen", "gm-walkthrough-seen", "touch-walkthrough-seen",
  "soccer-walkthrough-seen", "basketball-walkthrough-seen", "lineup-confirm-hint", "swapcard-carry-hint",
  "scorer-sheet-hint", "dock-swap-hint",
];
const log = (...a) => console.log(...a);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: "light",
  reducedMotion: "reduce",
  locale: "en-AU",
  timezoneId: "Australia/Melbourne",
  serviceWorkers: "block",
});
await context.addInitScript((keys) => {
  try {
    for (const k of keys) localStorage.setItem(k, "1");
    localStorage.setItem("siren-longpress-seen-v1", "true");
  } catch {}
  const add = () => {
    const s = document.createElement("style");
    s.textContent = `[data-testid^="feedback-fab"], nextjs-portal { display: none !important; }
      *, *::before, *::after { caret-color: transparent !important; }`;
    document.head.appendChild(s);
  };
  if (document.head) add();
  else document.addEventListener("DOMContentLoaded", add);
}, SEEN);
const page = await context.newPage();
page.setDefaultTimeout(15_000);

const failures = [];
try {
  await signIn();
  for (const s of sports) {
    const g = { ...s, ...ids.sports[s.slug] };
    try {
      await resetGame(g);
      await captureSport(g);
    } catch (e) {
      failures.push(`${s.slug}: ${e.message.split("\n")[0]}`);
      log(`✗ ${s.slug}: ${e.message.split("\n")[0]}`);
      try {
        await page.screenshot({ path: path.join(STATE_DIR, `${s.slug}-error-debug.png`) });
        log(`  debug: ${path.join(STATE_DIR, `${s.slug}-error-debug.png`)}`);
      } catch {}
    } finally {
      // Back as seeded: upcoming, nothing recorded, the real clock.
      await resetGame(g, { scheduled: true }).catch((e) => log(`  reset ${s.slug}: ${e.message}`));
    }
  }
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(`\nNot captured:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}

// ── Steps ────────────────────────────────────────────────────

async function signIn() {
  await page.goto(`${BASE}/login`);
  await page.getByTestId("login-mode-toggle").click();
  await page.getByTestId("login-email").fill(SPORTS_COACH.email);
  await page.getByTestId("login-password").fill(SPORTS_COACH.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/(dashboard|teams|welcome|onboarding)/, { timeout: 60_000 });
}

/**
 * Clear the game's events and set it upcoming. For the capture the
 * first period runs at real time with a sub every minute; afterwards
 * (scheduled) it goes back to the seed's interval and today at 9.
 */
async function resetGame(g, { scheduled = false } = {}) {
  await setGameEvents(g.gameId, ids.sportsCoachId, [], "upcoming");
  const at = new Date();
  if (scheduled) at.setHours(9, 0, 0, 0);
  else at.setTime(Date.now() - 5 * 60_000);
  await must(
    admin
      .from("games")
      .update({
        clock_multiplier: 1,
        sub_interval_seconds: scheduled ? g.subIntervalSeconds : 60,
        scheduled_at: at.toISOString(),
      })
      .eq("id", g.gameId),
    "reset game",
  );
}

async function captureSport(g) {
  log(`▶ ${g.slug}`);
  const dir = path.join(OUT, g.slug);
  mkdirSync(dir, { recursive: true });
  const shoot = async (state) => {
    if (!only.has(state)) return;
    await settle();
    await save(await page.screenshot(), path.join(dir, `${state}.png`), `${g.slug}/${state}`);
  };
  const { data: team } = await admin.from("teams").select("name").eq("id", g.teamId).single();
  g.teamName = team.name;
  const cfg = await ageConfig(g);
  const inPlay = ["live", "pairs", "scoring"].some((st) => only.has(st));
  const afterBreak = only.has("fulltime");

  await page.goto(`${BASE}/teams/${g.teamId}/games/${g.gameId}/live`);
  await kickOff();
  const kickoffAt = Date.now();
  if (inPlay || afterBreak) {
    await score(g, true);
    await score(g, false);
  }
  if (inPlay) {
    if (only.has("scoring")) {
      await openScorer(g);
      await shoot("scoring");
      await pickScorer();
    }
    if (only.has("live")) {
      await nextSubWithin(30);
      await shoot("live");
    }
    if (only.has("pairs") && (await rollingSubs())) {
      await page.getByTestId("info-line").filter({ hasText: /sub due/i }).waitFor({ timeout: 70_000 });
      await openPairs();
      await shoot("pairs");
      await page.getByTestId("swapcard-apply-all").click();
      await writesSaved();
    }
  }

  const realS = (Date.now() - kickoffAt) / 1000;
  await speed(g, Math.max(1, (cfg.periodSeconds - 150) / realS), cfg.subIntervalSeconds);
  if (only.has("pairs") && !(await rollingSubs())) {
    await openPairs();
    await shoot("pairs");
    await closeSheet();
  }
  await endPeriod();
  await waitForBreak();
  await shoot("break");
  if (!afterBreak) return;

  await speed(g, cfg.periodSeconds / 40, cfg.subIntervalSeconds);
  for (let q = 2; q <= cfg.periodCount; q++) {
    await startFromBreak();
    const start = Date.now();
    let scored = false;
    while (Date.now() - start < 37_000) {
      try {
        if (await page.getByTestId("info-line").filter({ hasText: /sub due/i }).count()) await makeSubs();
        if (!scored && Date.now() - start > 15_000) scored = (await score(g, q % 2 === 0)) !== false;
      } catch {
        break;
      }
      await page.waitForTimeout(700);
    }
    await endPeriod();
    if (q < cfg.periodCount) await waitForBreak();
  }
  await page.getByRole("button", { name: /finish game/i }).waitFor({ timeout: 20_000 });
  await shoot("fulltime");
}

/** The age group's periods and interval, from the app's sport registry. */
async function ageConfig(g) {
  const jiti = createRequire(import.meta.url)("jiti")(import.meta.url, { alias: { "@": path.join(REPO, "src") } });
  const { getAgeGroupConfig } = jiti(path.join(REPO, "src/lib/sports/index.ts"));
  return getAgeGroupConfig(g.sport, g.age);
}

/** Palette PNG: the help pages' screenshots stay small (helpScreenshots.test.ts). */
async function save(buf, file, name) {
  const out = await sharp(buf)
    .png({ palette: true, quality: 90, colours: 256, effort: 10, compressionLevel: 9, dither: 0.6 })
    .toBuffer();
  writeFileSync(file, out);
  const m = await sharp(out).metadata();
  log(`  ✓ ${name}.png ${m.width}×${m.height} ${(out.length / 1024).toFixed(0)} KB`);
}

async function rollingSubs() {
  const info = page.getByTestId("info-line");
  return (await info.count()) > 0 && /next sub|sub due/i.test((await info.first().textContent()) ?? "");
}

async function nextSubWithin(secs) {
  const info = page.getByTestId("info-line");
  if (!(await rollingSubs())) return;
  for (let i = 0; i < 300; i++) {
    const m = /next sub\D*(\d+):(\d\d)/i.exec((await info.textContent()) ?? "");
    if (m && Number(m[1]) * 60 + Number(m[2]) <= secs) return;
    await page.waitForTimeout(250);
  }
}

async function kickOff() {
  await page.getByRole("button", { name: /^ready$/i }).click({ timeout: 30_000 });
  await page.getByRole("button", { name: /^clock — .+, not started$/i }).waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: /^start (q|h|p)1$/i }).click();
  await page.getByRole("button", { name: /^start .+ now$/i }).click();
  await page.getByRole("button", { name: /^clock — .+, running/i }).waitFor({ timeout: 20_000 });
  await skipAsides();
}

async function skipAsides() {
  await page.waitForTimeout(600);
  const skip = page.getByRole("button", { name: /^skip$/i });
  if (await skip.count()) await skip.first().click().catch(() => {});
}

async function speed(g, multiplier, subS) {
  await writesSaved();
  await admin.from("games").update({ clock_multiplier: multiplier, sub_interval_seconds: subS }).eq("id", g.gameId);
  await page.reload();
  await page
    .getByRole("button", { name: /^clock — /i })
    .or(page.getByRole("button", { name: START }))
    .filter({ visible: true })
    .first()
    .waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
}

async function score(g, ours) {
  const add = scoreButton(g, ours);
  if (!(await add.count())) return false;
  await add.click();
  if (ours) await pickScorer();
  await writesSaved();
}

function scoreButton(g, ours) {
  const team = escape(ours ? g.teamName : g.opponent);
  const name = ours
    ? new RegExp(`^(Add .+, ${team}|Record an? .+ for our team)$`)
    : new RegExp(`^(Add .+, ${team}|Record opponent .+)$`);
  return page.getByRole("button", { name }).and(page.getByRole("button", { name: /^(?!Add 1 point,)(?!Add a girl's try)/ })).first();
}

async function openScorer(g) {
  await scoreButton(g, true).click();
  await page.getByRole("dialog", { name: /who scored|^record /i }).waitFor();
}

async function pickScorer() {
  const sheet = page.getByRole("dialog", { name: /who scored|^record /i });
  await sheet.waitFor();
  const first = new RegExp(SPORT_TEAMS.flatMap((s) => s.squad.map((n) => n.split(" ")[0])).join("|"));
  await sheet.locator("button").filter({ hasText: first }).first().click();
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
  await page.getByRole("button", { name: /plan q\d/i }).first().click();
  await page.getByRole("dialog").first().waitFor();
}

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

async function closeSheet() {
  const dialog = page.getByRole("dialog").last();
  const close = dialog.getByRole("button", { name: /^(close|cancel|done)$/i }).last();
  if (await close.count()) await close.click();
  else await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(300);
}

async function endPeriod() {
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

async function settle() {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1_200);
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
