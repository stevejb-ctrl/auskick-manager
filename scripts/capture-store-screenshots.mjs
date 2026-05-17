// Capture App Store / Play Store screenshots from a live URL.
//
// Spins up a headless Chromium at the target device viewport,
// signs in as the App Review demo account, navigates to each
// screen, injects a marketing-banner overlay with the matching
// headline, then screenshots to mobile/store/screenshots/.
//
// Output is paste-ready for App Store Connect + Play Console.
//
// Usage:
//   node scripts/capture-store-screenshots.mjs                 # iPhone 6.9" (1320×2868)
//   node scripts/capture-store-screenshots.mjs --ipad          # iPad Pro 13" (2064×2752)
//   node scripts/capture-store-screenshots.mjs --raw           # skip headline overlay
//   node scripts/capture-store-screenshots.mjs --base http://localhost:3000
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
const IPAD = args.includes("--ipad");

// Output routing:
//   iPhone + marketed  → ios/
//   iPhone + raw       → raw/
//   iPad   + marketed  → ipad/
//   iPad   + raw       → raw-ipad/
const outDir = resolve(
  repoRoot,
  "mobile",
  "store",
  "screenshots",
  IPAD ? (RAW ? "raw-ipad" : "ipad") : RAW ? "raw" : "ios",
);

// Demo credentials provisioned by scripts/seed-app-review-account.mjs.
// Hardcoded by design — the seeded account is reserved for screenshot
// and review use against prod. Re-run the seeder to refresh the data.
const EMAIL = "appreview@sirenfooty.com.au";
const PASSWORD = "SirenReview2026!";

// iPhone 16 Pro Max physical pixels = 1320 × 2868 (Apple's 6.9"
// requirement; 6.5" auto-derives). Logical viewport 440×956 × DPR 3.
//
// iPad Pro 13" (M4) physical pixels = 2064 × 2752 (Apple's "13-inch
// iPad" requirement — became mandatory mid-2024 for any app with
// iPad support in the Xcode project). Logical viewport 1032×1376 ×
// DPR 2.
const IPHONE_VIEWPORT = { width: 440, height: 956 };
const IPHONE_DPR = 3;
const IPAD_VIEWPORT = { width: 1032, height: 1376 };
const IPAD_DPR = 2;

const VIEWPORT = IPAD ? IPAD_VIEWPORT : IPHONE_VIEWPORT;
const DPR = IPAD ? IPAD_DPR : IPHONE_DPR;

// Each screen: route to land on (after team-id substitution),
// optional pre-screenshot action (clicks, scrolls), filename, and
// marketing headline. Headlines are deliberately one short line so
// they fit the banner without wrapping awkwardly on the 1320-wide
// canvas — keep new ones to <40 characters.
const SHOTS = [
  {
    // /games (the team's games tab) is denser than /teams/<id> which
    // only shows the live-game CTA card — game cards stacked
    // (Final / Live / Upcoming) reads much better as a hero image.
    //
    // Manual-only: Steve's current capture includes a R4 vs Prahran
    // Prawns added by hand to make the list read as a mid-season
    // state with 2 completed + 2 upcoming games. The seed only
    // creates R1-R3, so an auto-recapture would produce a different
    // composition. If we ever add R4 to the seed (or accept the
    // 3-game auto-list), the flag can come off.
    id: "01-games-list",
    headline: "Your whole season in one tap.",
    route: (teamId) => `/teams/${teamId}/games`,
    waitFor: "h1",
    manualOnly: true,
  },
  {
    // Full-time game summary card. Steve's hand-capture uses the R2
    // game finalised to FT (score 14.6 90 vs 7.5 47) because that
    // matches the in-prod opponent + scorer roster the rest of the
    // shot story references. The auto-capture against the seeded
    // R1 completed game shows the game-detail card instead of the
    // FT summary, which is much less compelling — flag manualOnly
    // so future re-runs don't overwrite the polished capture.
    id: "02-game-recap",
    headline: "Every game, recapped for the group chat.",
    route: (teamId, games) => `/teams/${teamId}/games/${games.completed}`,
    waitFor: "h1",
    manualOnly: true,
  },
  {
    // Quarter Break "Set zones for Q2" screen — fires between Q1 and
    // Q2 of the live R2 game and shows the suggester's wholesale
    // zone rebalance (every kid shuffles between FWD/CEN/BCK to
    // keep their season time fair). More visually distinctive than
    // the steady-state live UI for the "fair rotations" headline —
    // each player tile shows FROM_ZONE → TO_ZONE.
    //
    // NOTE: Hard to auto-capture reliably — only renders when the
    // game state is at a quarter break. If the Playwright script
    // hits R2 mid-quarter the screen will be the live field UI
    // instead. Treat as manual-only: copy from `raw/` after a
    // Steve-driven capture rather than relying on `npm run
    // screenshots:ios -- --raw` to regenerate.
    id: "03-quarter-break",
    headline: "Fair rotations, suggested automatically.",
    route: (teamId, games) => `/teams/${teamId}/games/${games.live}/live`,
    waitFor: "main",
    manualOnly: true,
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
  // Shot 05 (Sub due!) and 06 (Player actions) are manual-only:
  // both require modal interactions (sub-interval tick / long-press
  // on a player tile) that aren't reliable to auto-trigger from a
  // headless Playwright session. Captured by hand and dropped into
  // raw/. Listed here so the manifest + design handoff stay in
  // sync, but the capture loop skips them.
  {
    id: "05-sub-rotations",
    headline: "Automate your sub rotations.",
    route: (teamId, games) => `/teams/${teamId}/games/${games.live}/live`,
    waitFor: "main",
    manualOnly: true,
  },
  {
    id: "06-player-actions",
    headline: "Every game-day curveball, handled.",
    route: (teamId, games) => `/teams/${teamId}/games/${games.live}/live`,
    waitFor: "main",
    manualOnly: true,
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
  const deviceLabel = IPAD ? "iPad Pro 13\"" : "iPhone 16 Pro Max";
  const modeLabel = RAW ? "raw" : "marketed";
  console.log(
    `Capturing against ${BASE_URL} (${deviceLabel}, ${modeLabel})…`,
  );

  // Per-device User-Agent so the responsive Next.js app picks the
  // right layout. The site uses CSS media queries primarily, but
  // some Capacitor-aware code paths and the Vercel edge sniff UA.
  const iphoneUA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const ipadUA =
    "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DPR,
    userAgent: IPAD ? ipadUA : iphoneUA,
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
      // manualOnly shots: for the iPhone pass these were curated
      // versions Steve hand-captured (with specific game states,
      // modals open, the R4 game added by hand, etc.), so we skip
      // them and let Steve drop the hand-captured PNG in. For the
      // iPad pass we don't have curated versions yet — force-
      // capture so there's at least an iPad-dimension version to
      // start from, even if the state isn't perfect.
      if (shot.manualOnly && !IPAD) {
        const target = `mobile/store/screenshots/raw/${shot.id}.png`;
        console.log(
          `  ${shot.id} → skipping (manualOnly — drop the file at ${target} and commit)`,
        );
        continue;
      }
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
