// Capture the in-app help screenshots (public/help-screenshots/) from a
// local build seeded with realistic AFL, netball and league teams.
//
//   1. Build and serve against the LOCAL Supabase only: export the
//      .env.test values (never .env.local, which is production), then
//      `npx next build && npx next start -p 3107`.
//   2. node scripts/help-screenshots/seed.mjs
//      Wipes and reseeds the two *@siren.test help accounts; nothing
//      else in the DB is touched.
//   3. node scripts/help-screenshots/capture.mjs [name-substring ...]
//   4. Update src/lib/help/screenshots.ts with any new sizes; its test
//      (src/lib/__tests__/helpScreenshots.test.ts) says which.
//
// Each shot writes one file that a help page's HelpFigure shows. Phone
// width (390), light theme, 2x.
//
// sharp compresses the PNGs but isn't a project dependency: install it
// anywhere (`npm i --prefix <dir> sharp@0.33`) and set SHARP_DIR=<dir>.
// HELP_SHOTS_BASE overrides the app URL. The live shots rewrite today's
// games' event logs to put each screen in the state it needs.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { REPO, STATE_DIR, COACH, NEW_COACH } from "./lib.mjs";
import { getBrowser, closeBrowser, BASE, VIEWPORT, signedInContext } from "./browser.mjs";
import { ids, setState } from "./states.mjs";

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
const OUT = path.join(REPO, "public", "help-screenshots");
const RAW = path.join(STATE_DIR, "raw");
mkdirSync(RAW, { recursive: true });

const BG = "#f6f4ef"; // bg-warm behind stitched crops

// ─── Output ──────────────────────────────────────────────────
async function save(buf, name) {
  await sharp(buf).toFile(path.join(RAW, `${name}.png`));
  const out = await sharp(buf)
    .png({ palette: true, quality: 90, colours: 256, effort: 10, compressionLevel: 9, dither: 0.6 })
    .toBuffer();
  // Write the buffer as-is: sharp(out).toFile() would re-encode it and
  // drop the palette, roughly doubling the file.
  writeFileSync(path.join(OUT, `${name}.png`), out);
  const m = await sharp(out).metadata();
  console.log(`✓ ${name}.png ${m.width}×${m.height} ${(out.length / 1024).toFixed(0)} KB`);
}

/** Stack screenshots vertically on the warm background. */
async function stitch(bufs, { gap = 24, pad = 0 } = {}) {
  const metas = await Promise.all(bufs.map((b) => sharp(b).metadata()));
  const width = Math.max(...metas.map((m) => m.width)) + pad * 2;
  const height = metas.reduce((s, m) => s + m.height, 0) + gap * (bufs.length - 1) + pad * 2;
  let y = pad;
  const composite = bufs.map((b, i) => {
    const c = { input: b, left: Math.round((width - metas[i].width) / 2), top: y };
    y += metas[i].height + gap;
    return c;
  });
  return sharp({ create: { width, height, channels: 3, background: BG } }).composite(composite).png().toBuffer();
}

// ─── Page helpers ────────────────────────────────────────────
const HIDE_CSS = `
  [data-testid^="feedback-fab"] { display: none !important; }
  nextjs-portal { display: none !important; }
  *, *::before, *::after { caret-color: transparent !important; }
`;

async function open(user, url, { viewport = VIEWPORT, seen = true } = {}) {
  const { ctx, page } = user
    ? await signedInContext(user, { viewport })
    : await anonContext(viewport);
  await ctx.addInitScript(({ css, seen }) => {
    if (seen) {
      try {
        for (const k of ["siren-longpress-seen-v1", "gm-walkthrough-seen", "league-walkthrough-seen", "nb-walkthrough-seen"]) {
          localStorage.setItem(k, k === "siren-longpress-seen-v1" ? "true" : "1");
        }
      } catch {}
    }
    const add = () => {
      const s = document.createElement("style");
      s.textContent = css;
      document.head.appendChild(s);
    };
    if (document.head) add();
    else document.addEventListener("DOMContentLoaded", add);
  }, { css: HIDE_CSS, seen });
  await page.goto(BASE + url);
  await settle(page);
  return { ctx, page };
}

async function anonContext(viewport) {
  const b = await getBrowser();
  const ctx = await b.newContext({
    viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block",
    locale: "en-AU", timezoneId: "Australia/Melbourne", colorScheme: "light", reducedMotion: "reduce",
  });
  return { ctx, page: await ctx.newPage() };
}

async function settle(page, ms = 900) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

async function tapIfShown(locator, timeout = 2500) {
  try {
    await locator.first().waitFor({ state: "visible", timeout });
    await locator.first().click();
    return true;
  } catch {
    return false;
  }
}

async function scrollToY(page, locator, offset = 80) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("scroll target not found");
  await page.evaluate((y) => window.scrollBy(0, y), box.y - offset);
  await page.waitForTimeout(400);
}

/** Grow the viewport to the document height so sticky bars sit at the end. */
async function fitHeight(page, max = 2400) {
  for (let i = 0; i < 3; i++) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    const vh = page.viewportSize().height;
    if (Math.abs(h - vh) < 2) break;
    await page.setViewportSize({ width: page.viewportSize().width, height: Math.min(h, max) });
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

/** Crop the full-width band covering these players' tiles. */
async function tilesShot(page, names, { padTop = 12, padBottom = 14 } = {}) {
  let top = Infinity;
  let bottom = 0;
  for (const n of names) {
    const tile = page.getByText(n, { exact: true }).first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]");
    const b = await tile.boundingBox();
    top = Math.min(top, b.y);
    bottom = Math.max(bottom, b.y + b.height);
  }
  const vw = page.viewportSize().width;
  return page.screenshot({ clip: { x: 0, y: top - padTop, width: vw, height: bottom - top + padTop + padBottom } });
}

async function viewportShot(page) {
  return page.screenshot({ fullPage: false });
}

/** Element screenshot with `pad` css px of surrounding page. */
async function elementShot(page, locator, { pad = 12, padTop, padBottom } = {}) {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const box = await locator.boundingBox();
  if (!box) throw new Error("element not visible");
  const vw = page.viewportSize().width;
  const top = Math.max(0, box.y - (padTop ?? pad));
  const bottom = box.y + box.height + (padBottom ?? pad);
  return page.screenshot({ clip: { x: 0, y: top, width: vw, height: bottom - top } });
}

/** Screenshot of the page between two y positions (css px, document coords). */
async function rangeShot(page, fromLocator, toLocator, { padTop = 12, padBottom = 12 } = {}) {
  await fromLocator.scrollIntoViewIfNeeded();
  const a = await fromLocator.boundingBox();
  const b = await toLocator.boundingBox();
  const vw = page.viewportSize().width;
  const top = Math.max(0, a.y - padTop);
  return page.screenshot({ clip: { x: 0, y: top, width: vw, height: b.y + b.height + padBottom - top } });
}

/** Full-width crop from the top of `from` to the bottom of `to`. */
async function bandShot(page, from, to, { padTop = 12, padBottom = 12 } = {}) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error("band target not visible");
  const vw = page.viewportSize().width;
  const top = Math.max(0, a.y - padTop);
  return page.screenshot({ clip: { x: 0, y: top, width: vw, height: b.y + b.height + padBottom - top } });
}

const T = {
  afl: () => ids.afl.teamId,
  nb: () => ids.netball.teamId,
  rl: () => ids.league.teamId,
  nc: () => ids.newCoach.teamId,
};
const live = (sport) => {
  const k = { afl: "afl", nb: "netball", rl: "league" }[sport];
  return `/teams/${ids[k].teamId}/games/${ids[k].today}/live`;
};
const gamePage = (sport, i = 2) => {
  const k = { afl: "afl", nb: "netball", rl: "league" }[sport];
  return `/teams/${ids[k].teamId}/games/${ids[k].completed[i]}`;
};
const tile = (page, name) => page.getByRole("button", { name: new RegExp(`^${name},`) }).first();

// ─── Shots ───────────────────────────────────────────────────
// One function per file the help pages show (src/app/help/**: the
// HelpFigure srcs). The live ones are AFL, as the captions say.
const SHOTS = {
  // Dashboard: three teams, one per sport.
  async "overview-landing"() {
    const { ctx, page } = await open(COACH, "/dashboard");
    await save(await viewportShot(page), "overview-landing");
    await ctx.close();
  },

  // The Teams page's figure: the same dashboard, cropped to the team cards.
  async "teams-dashboard"() {
    const { ctx, page } = await open(COACH, "/dashboard", { viewport: { width: 390, height: 610 } });
    await save(await viewportShot(page), "teams-dashboard");
    await ctx.close();
  },

  async "getting-started-signup"() {
    const { ctx, page } = await open(null, "/signup", { viewport: { width: 390, height: 760 } });
    await save(await viewportShot(page), "getting-started-signup");
    await ctx.close();
  },

  async "getting-started-create-team"() {
    const { ctx, page } = await open(NEW_COACH, "/teams/new");
    await page.getByLabel("Team name").fill("Brunswick U10s");
    await page.getByLabel("Team name").blur();
    await fitHeight(page);
    const from = page.getByText("Team name", { exact: true }).first();
    const to = page.getByRole("button", { name: "Continue", exact: true });
    await save(await bandShot(page, from, to, { padTop: 14, padBottom: 28 }), "getting-started-create-team");
    await ctx.close();
  },

  async "getting-started-add-players"() {
    const { ctx, page } = await open(NEW_COACH, `/teams/${T.nc()}/squad`);
    await page.getByPlaceholder("e.g. Sam Smith").fill("Ella Martin");
    await page.getByPlaceholder("Optional").fill("4");
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(300);
    await save(await viewportShot(page), "getting-started-add-players");
    await ctx.close();
  },

  // A new coach's first game: the create form on their own team.
  async "getting-started-create-game"() {
    await createGameShot(NEW_COACH, T.nc(), "getting-started-create-game", {
      opponent: "Kensington Kangaroos", round: "1", at: "2026-11-14T09:00", location: "Ransford Oval",
    });
  },

  async "teams-settings"() {
    const { ctx, page } = await open(COACH, `/teams/${T.afl()}/settings`);
    const name = await elementShot(page, page.locator("text=Team name").first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]"));
    const age = await elementShot(page, page.locator("text=Age group").first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]"));
    const danger = await rangeShot(page, page.getByText("Danger zone", { exact: true }), page.getByRole("button", { name: "Delete team" }), { padBottom: 28 });
    await save(await stitch([name, age, danger], { gap: 0 }), "teams-settings");
    await ctx.close();
  },

  async "squads-player-list"() {
    const { ctx, page } = await open(COACH, `/teams/${T.afl()}/squad`);
    const head = await page.getByText("On the squad", { exact: false }).first().boundingBox();
    await page.evaluate((y) => window.scrollTo(0, y - 96), head.y);
    await page.waitForTimeout(300);
    await save(await viewportShot(page), "squads-player-list");
    await ctx.close();
  },

  async "squads-add-player"() {
    const { ctx, page } = await open(COACH, `/teams/${T.afl()}/squad`, { viewport: { width: 390, height: 560 } });
    await page.getByPlaceholder("e.g. Sam Smith").fill("Willow Grant");
    await page.getByPlaceholder("Optional").fill("16");
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(300);
    const card = page.getByText("Paste a list").locator("xpath=ancestor::*[contains(@class,'rounded-lg')][1]");
    const box = await card.boundingBox();
    await save(await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: box.y + box.height + 16 } }), "squads-add-player");
    await ctx.close();
  },

  async "squads-availability"() {
    const { ctx, page } = await open(COACH, `/teams/${T.afl()}/games/${ids.afl.today}/availability`);
    await save(await viewportShot(page), "squads-availability");
    await ctx.close();
  },

  async "games-list"() {
    const { ctx, page } = await open(COACH, `/teams/${T.afl()}/games`);
    await save(await viewportShot(page), "games-list");
    await ctx.close();
  },

  async "games-create"() {
    await createGameShot(COACH, T.afl(), "games-create", {
      opponent: "Carlton Blues", round: "6", at: "2026-11-21T09:00", location: "Gilpin Park",
    });
  },

  async "games-detail"() {
    const { ctx, page } = await open(COACH, gamePage("afl"));
    await save(await viewportShot(page), "games-detail");
    await ctx.close();
  },

  // The scoring switch on the Team tab, under Game-day extras.
  async "track-scoring-toggle"() {
    const { ctx, page } = await open(COACH, `/teams/${T.afl()}/settings`);
    const head = page.getByText("Game-day extras", { exact: true });
    const card = page.getByText(/^Track goals & behinds$/).first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]");
    await save(await rangeShot(page, head, card, { padTop: 16, padBottom: 16 }), "track-scoring-toggle");
    await ctx.close();
  },

  // ─── Live game (AFL) ───────────────────────────────────────
  // Before the first bounce: the picker's field, bench and Ready.
  async "live-game-lineup-picker"() {
    await setState("afl-pregame");
    const { ctx, page } = await open(COACH, live("afl"));
    await fitHeight(page);
    const from = page.getByText("Season time in zone", { exact: true });
    const ready = page.getByRole("button", { name: "Ready", exact: true });
    await save(await bandShot(page, from, ready, { padTop: 12, padBottom: 24 }), "live-game-lineup-picker");
    await ctx.close();
  },

  // Mid Q2: score, Next sub line, the field, the bench and the bar.
  async "live-game-field"() {
    await setState("afl-q2");
    const { ctx, page } = await open(COACH, live("afl"));
    await save(await viewportShot(page), "live-game-field");
    await ctx.close();
  },

  // A kid tapped: their bar, with + Goal and + Behind for them.
  async "live-game-scoring"() {
    await setState("afl-q2");
    const { ctx, page } = await open(COACH, live("afl"));
    await tile(page, "Mateo Silva").click();
    await page.getByTestId("kid-bar").waitFor();
    await page.waitForTimeout(700);
    await save(await viewportShot(page), "live-game-scoring");
    await ctx.close();
  },

  // Loaded seconds before the sub falls due; the alert fires on screen.
  async "live-game-sub-due"() {
    await setState("afl-subdue");
    const { ctx, page } = await open(COACH, live("afl"));
    await page.getByRole("alert").filter({ hasText: /sub due/i }).waitFor({ timeout: 25_000 });
    await page.waitForTimeout(1500);
    await save(await viewportShot(page), "live-game-sub-due");
    await ctx.close();
  },

  async "live-game-quarter-end"() {
    await setState("afl-q2");
    const { ctx, page } = await open(COACH, live("afl"));
    await page.getByRole("button", { name: /^Clock — / }).click();
    await page.getByText("End Q2 now", { exact: true }).click();
    await page.getByRole("button", { name: "End Q2", exact: true }).waitFor();
    await page.waitForTimeout(700);
    await save(await viewportShot(page), "live-game-quarter-end");
    await ctx.close();
  },

  async "live-game-quarter-break"() {
    await setState("afl-break");
    const { ctx, page } = await open(COACH, live("afl"));
    await page.getByRole("button", { name: "Start Q3", exact: true }).waitFor();
    await save(await viewportShot(page), "live-game-quarter-break");
    await ctx.close();
  },

  // ─── Rotations ─────────────────────────────────────────────
  // The pairs sheet, opened from the Next sub line.
  async "rotations-swap-card"() {
    await setState("afl-q2");
    const { ctx, page } = await open(COACH, live("afl"));
    await page.getByTestId("info-line").click();
    await page.getByTestId("swapcard-apply-all").waitFor();
    await page.waitForTimeout(700);
    const sheet = page.getByRole("dialog").filter({ has: page.getByTestId("swapcard-apply-all") });
    const box = await sheet.boundingBox();
    const vh = page.viewportSize().height;
    await save(await page.screenshot({ clip: { x: 0, y: box.y - 16, width: 390, height: vh - box.y + 16 } }), "rotations-swap-card");
    await ctx.close();
  },

  // Off next / On next on the kids, with the pair numbers: the forward
  // line and the bench.
  async "rotations-player-tile"() {
    await setState("afl-q2");
    const { ctx, page } = await open(COACH, live("afl"));
    const fwd = await bandShot(page, tile(page, "Zara Haddad"), tile(page, "Sam Petrakis"), { padTop: 26, padBottom: 22 });
    const bench = await bandShot(page, tile(page, "Maya Kelly"), tile(page, "Ava Okafor"), { padTop: 6, padBottom: 8 });
    await save(await stitch([fwd, bench], { gap: 8 }), "rotations-player-tile");
    await ctx.close();
  },

  // The zone colours: season time on the lineup picker's tiles, and a
  // Fwd / Cen / Back split on the Stats tab's Player stats card.
  async "rotations-zone-bar"() {
    await setState("afl-pregame");
    let field;
    {
      const { ctx, page } = await open(COACH, live("afl"));
      await fitHeight(page);
      field = await bandShot(page, page.getByText("Season time in zone", { exact: true }), tile(page, "Ruby Chen"), { padTop: 16, padBottom: 14 });
      await ctx.close();
    }
    const { ctx, page } = await open(COACH, `/teams/${T.afl()}/stats`);
    await fitHeight(page, 9000);
    const card = page.getByText("Player statistics", { exact: true }).first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]");
    // Down to the end of the second kid's card.
    const second = page.getByText(/^Total min$/i).nth(1).locator("xpath=ancestor::*[contains(@class,'rounded')][1]");
    const stats = await bandShot(page, card, second, { padTop: 10, padBottom: 6 });
    await save(await stitch([field, stats], { gap: 8 }), "rotations-zone-bar");
    await ctx.close();
  },

  // A scored game: each kid's goals.behinds after the name.
  async "track-scoring-player-tile"() {
    await setState("afl-q2");
    const { ctx, page } = await open(COACH, live("afl"));
    const score = await bandShot(page, page.getByRole("button", { name: "Exit live game" }), page.getByTestId("undo-strip"), { padTop: 12, padBottom: 10 });
    const back = await bandShot(page, tile(page, "Frankie Doyle"), tile(page, "Nora Fitzgerald"), { padTop: 24, padBottom: 24 });
    await save(await stitch([score, back], { gap: 8 }), "track-scoring-player-tile");
    await ctx.close();
  },

  // ─── Stats ─────────────────────────────────────────────────
  async "stats-overview"() {
    await setState("afl-pregame"); // no game under way, so no "isn't finished" note
    const { ctx, page } = await open(COACH, `/teams/${T.afl()}/stats`);
    await save(await viewportShot(page), "stats-overview");
    await ctx.close();
  },

  async "stats-cards"() {
    await setState("afl-pregame");
    const cardOf = (page, text) =>
      page.getByText(text, { exact: true }).first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]");
    const { ctx, page } = await open(COACH, `/teams/${T.afl()}/stats`);
    await fitHeight(page, 9000);
    await save(await elementShot(page, cardOf(page, "Season balance"), { pad: 12 }), "stats-minutes-equity");
    const h2h = await elementShot(page, cardOf(page, "Head-to-head by opponent"), { pad: 8 });
    const qbq = await elementShot(page, cardOf(page, "Quarter-by-quarter scoring"), { pad: 8 });
    await save(await stitch([h2h, qbq], { gap: 0 }), "stats-combinations");
    await ctx.close();
  },
};

async function createGameShot(user, teamId, file, g) {
  const { ctx, page } = await open(user, `/teams/${teamId}/games`);
  await page.getByRole("button", { name: "Create manually" }).click();
  await page.getByLabel("Opponent").fill(g.opponent);
  await page.getByLabel("Round").fill(g.round);
  await page.getByLabel("Date & time").fill(g.at);
  await page.getByLabel("Location").fill(g.location);
  await page.getByLabel("Location").blur();
  await page.waitForTimeout(400);
  await save(await viewportShot(page), file);
  await ctx.close();
}

const only = process.argv.slice(2);
// Today's games start upcoming so the dashboard, lists and availability
// show a normal pre-game state; live shots set their own state.
for (const st of ["afl-pregame", "netball-pregame", "league-pregame"]) await setState(st);
for (const [name, fn] of Object.entries(SHOTS)) {
  if (only.length && !only.some((o) => name.includes(o))) continue;
  try {
    await fn();
  } catch (e) {
    console.error(`✗ ${name}: ${e.message.split("\n")[0]}`);
  }
}
await closeBrowser();
