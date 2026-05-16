// Capture App Store / Play Store screenshots from a live URL.
//
// Spins up a headless Chromium at iPhone 16 Pro Max viewport
// (1320×2868), signs in as the App Review demo account, navigates
// to each screen, injects a marketing-banner overlay with the
// matching headline, then screenshots to mobile/store/screenshots/.
//
// Output is paste-ready for App Store Connect + Play Console.
// Apple needs ≥1 screenshot at 6.9" (1320×2868); Play Store
// accepts the same dimensions. Both stores get 4 marketed shots
// from one run.
//
// Usage:
//   node scripts/capture-store-screenshots.mjs
//   node scripts/capture-store-screenshots.mjs --base http://localhost:3000
//   node scripts/capture-store-screenshots.mjs --raw   # skip headline overlay
//
// Prereqs:
//   - `npm run seed:app-review` has been run against whichever env
//     you're capturing. The seeded demo account + games are what we
//     sign in to.
//   - Playwright + Chromium installed (already in devDeps).

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const BASE_URL =
  baseIdx >= 0 ? args[baseIdx + 1] : "https://www.sirenfooty.com.au";
const RAW = args.includes("--raw");

// In raw mode the screenshots go to a separate subdir so the
// designer / Claude design has a clean source set untouched by the
// in-script marketing band. The marketed set (default) stays at
// `ios/` and that's what gets uploaded to App Store Connect.
const outDir = resolve(
  repoRoot,
  "mobile",
  "store",
  "screenshots",
  RAW ? "raw" : "ios",
);

// Demo credentials provisioned by scripts/seed-app-review-account.mjs.
// Hardcoded by design — the seeded account is reserved for screenshot
// and review use against prod. Re-run the seeder to refresh the data.
const EMAIL = "appreview@sirenfooty.com.au";
const PASSWORD = "SirenReview2026!";

// iPhone 16 Pro Max physical pixels = 1320 × 2868. Apple requires
// the 6.9" screenshot size for new submissions; 6.5" gets auto-
// derived. Logical viewport 440×956 × DPR 3 = the right pixel size.
const VIEWPORT = { width: 440, height: 956 };
const DPR = 3;

// Each screen: route to land on (after team-id substitution),
// optional pre-screenshot action (clicks, scrolls), filename, and
// marketing headline. Headlines are deliberately one short line so
// they fit the banner without wrapping awkwardly on the 1320-wide
// canvas — keep new ones to <40 characters.
const SHOTS = [
  {
    // /games (the team's games tab) is denser than /teams/<id> which
    // only shows the live-game CTA card — three game cards stacked
    // (Final / Live / Upcoming) reads much better as a hero image.
    id: "01-games-list",
    headline: "Your whole season in one tap.",
    route: (teamId) => `/teams/${teamId}/games`,
    waitFor: "h1",
  },
  {
    id: "02-game-recap",
    headline: "Every game, summed up afterwards.",
    route: (teamId, games) => `/teams/${teamId}/games/${games.completed}`,
    waitFor: "h1",
  },
  {
    // Live game R2 — with the 12-on-field U10 lineup, the live UI
    // surfaces the rotation suggester at the top ("SUGGESTED — 3
    // SWAPS: Ava→Pip · Zara→Nora · Mateo→Eli") plus per-player
    // NEXT-OFF chips and a sub-interval countdown. The fairness
    // suggester — Siren's killer feature — is visible in one shot.
    id: "03-live-game",
    headline: "Fair rotations, suggested automatically.",
    route: (teamId, games) => `/teams/${teamId}/games/${games.live}/live`,
    waitFor: "main",
  },
  {
    // Lineup picker on the upcoming R3 game. Shows the pre-game
    // build-your-starting-12 flow with each position group filled
    // (4 BACK / 4 CENTRE / 4 FWD), plus the "Ready for Q1" sticky
    // kickoff CTA.
    id: "04-lineup-picker",
    headline: "Build your starting team in seconds.",
    route: (teamId, games) => `/teams/${teamId}/games/${games.upcoming}/live`,
    waitFor: "main",
  },
];

async function injectBanner(page, headline) {
  await page.evaluate((text) => {
    // Hide the app's own sticky header during capture so the
    // marketing band has the top of the screen to itself. Without
    // this, the avatar pill + brand wordmark would peek through and
    // muddy the composition.
    const existingHeader = document.querySelector("header");
    if (existingHeader) existingHeader.style.display = "none";

    // Inject the marketing band. Fixed position at top, viewport
    // width, ~17% of viewport height. Soft cream background matches
    // the brand surface token; ink-dark headline text for contrast.
    //
    // 160px = 17% of 956px viewport. Earlier 250px was too dominant;
    // marketing convention is for the headline band to occupy 10-20%
    // of the screenshot so the app screen still owns the composition.
    const band = document.createElement("div");
    band.id = "__marketing_band__";
    band.textContent = text;
    const style = band.style;
    style.position = "fixed";
    style.top = "0";
    style.left = "0";
    style.right = "0";
    style.height = "160px";
    style.background =
      "linear-gradient(180deg, #F4EDE2 0%, #EFE6D7 100%)";
    style.padding = "40px 32px 20px";
    style.textAlign = "center";
    style.fontFamily =
      '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    style.fontSize = "30px";
    style.fontWeight = "700";
    style.color = "#1A1E1A";
    style.lineHeight = "1.15";
    style.letterSpacing = "-0.02em";
    style.zIndex = "99999";
    style.display = "flex";
    style.alignItems = "center";
    style.justifyContent = "center";
    style.boxShadow = "0 4px 16px rgba(26,30,26,0.06)";
    style.boxSizing = "border-box";
    document.body.appendChild(band);

    // Push the visible page content below the band so it isn't
    // obscured. The viewport screenshot then captures: band (top
    // 160px) + visible app content (rest).
    document.body.style.paddingTop = "160px";
  }, headline);
}

async function dismissWalkthrough(page) {
  // The live-game walkthrough modal pops on first visit. If a stray
  // localStorage clear or fresh browser context drops the dismissal
  // flag we set in addInitScript, catch the modal and click through.
  const skip = page.getByRole("button", { name: /skip walkthrough/i });
  if (await skip.isVisible({ timeout: 500 }).catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(300);
  }
}

async function signIn(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.getByTestId("login-mode-toggle").click();
  await page.getByTestId("login-email").fill(EMAIL);
  await page.getByTestId("login-password").fill(PASSWORD);
  await page.getByTestId("login-submit").click();
  // Single-team auto-redirect kicks in for the demo account, so we
  // land on /teams/<uuid> directly. Wait for that URL pattern.
  await page.waitForURL(/\/teams\/[0-9a-f-]+/, { timeout: 15_000 });
}

async function discoverIds(page) {
  // We're sitting on /teams/<id> after sign-in.
  const url = page.url();
  const m = url.match(/\/teams\/([0-9a-f-]+)/);
  if (!m) throw new Error(`Couldn't extract team_id from ${url}`);
  const teamId = m[1];

  // Game IDs: navigate to the games tab and grab the anchor hrefs.
  // The seeded games have distinctive opponent names, so we can
  // match by aria-label or surrounding text.
  await page.goto(`${BASE_URL}/teams/${teamId}/games`, {
    waitUntil: "networkidle",
  });

  // Match opponent names from the seed (scripts/seed-app-review-
  // account.mjs). If the seed's opponent strings change, update both
  // here AND keep the screenshot output filenames stable.
  const games = await page.evaluate(() => {
    const anchors = Array.from(
      document.querySelectorAll('a[href*="/games/"]'),
    );
    const byOpponent = {};
    for (const a of anchors) {
      const href = a.getAttribute("href") ?? "";
      const id = href.match(/\/games\/([0-9a-f-]+)/)?.[1];
      if (!id) continue;
      const text = a.textContent ?? "";
      if (text.includes("Brunswick Bears")) byOpponent.completed = id;
      if (text.includes("Coburg Cougars")) byOpponent.live = id;
      if (text.includes("Northcote Nighthawks")) byOpponent.upcoming = id;
    }
    return byOpponent;
  });

  if (!games.completed || !games.live || !games.upcoming) {
    throw new Error(
      `Couldn't find all three demo games on the games page. Found: ${JSON.stringify(games)}. Has the seeder been run?`,
    );
  }
  return { teamId, games };
}

async function capture(page, shot, ctx) {
  const route = shot.route(ctx.teamId, ctx.games);
  console.log(`  ${shot.id} → ${route}`);

  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
  if (shot.waitFor) {
    await page
      .locator(shot.waitFor)
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });
  }
  // Catch any walkthrough modal that slipped past the localStorage
  // pre-dismissal (defence in depth — if Supabase auth somehow
  // resets storage, the first /live render would otherwise show it).
  await dismissWalkthrough(page);
  // Animations are mostly fast-fading on this app, but a brief beat
  // before screenshot lets the pulse-dot / connected halo settle.
  await page.waitForTimeout(800);

  if (!RAW) {
    await injectBanner(page, shot.headline);
    // After the banner pushes content down via padding-top, give the
    // browser a frame to repaint before the camera fires.
    await page.waitForTimeout(200);
  }

  const file = resolve(outDir, `${shot.id}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`    → ${file}`);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  console.log(`Capturing against ${BASE_URL} (${RAW ? "raw" : "marketed"})…`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DPR,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    isMobile: true,
    hasTouch: true,
  });

  // Suppress all the one-time first-visit affordances before any
  // page navigates. Otherwise the walkthrough modal (gm-walkthrough-
  // seen) covers the live UI on shot 3, and the long-press hint chip
  // floats over the lineup picker on shot 4. Both are documented
  // affordances real coaches see — but they obscure the screen we're
  // trying to market, so they get pre-dismissed here.
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("gm-walkthrough-seen", "1");
      window.localStorage.setItem("nb-walkthrough-seen", "1");
      // LongPressHint stores its dismissal under "siren-longpress-seen-v1"
      // — value "true" (string), not "1". Mirroring the component's exact
      // check at src/components/live/LongPressHint.tsx#STORAGE_KEY.
      window.localStorage.setItem("siren-longpress-seen-v1", "true");
    } catch {
      // Storage might not be available on the initial blank page.
    }
  });

  const page = await context.newPage();

  try {
    await signIn(page);
    const ctx = await discoverIds(page);
    console.log(`  team_id: ${ctx.teamId}`);
    console.log(`  games:   ${JSON.stringify(ctx.games)}`);
    console.log("");
    console.log("Capturing screens…");
    for (const shot of SHOTS) {
      await capture(page, shot, ctx);
    }
  } finally {
    await context.close();
    await browser.close();
  }

  // Write a tiny manifest so submission filling can be templated
  // off it later (which file → which headline → which store field).
  const manifest = SHOTS.map((s) => ({
    file: `${s.id}.png`,
    headline: s.headline,
  }));
  await writeFile(
    resolve(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  console.log("");
  console.log(`Done. ${SHOTS.length} screenshots in:`);
  console.log(`  ${outDir}`);
}

await main();
