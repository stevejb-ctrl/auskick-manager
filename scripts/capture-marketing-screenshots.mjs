#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Playwright screenshot-capture for the marketing site.
 *
 * Authenticates via Supabase Admin magic-link (no password needed), then
 * captures each of the screens referenced by `src/app/page.tsx` at
 * portrait phone dimensions (1080×2340 — 3× retina at 360×780 design px).
 *
 * Targets PRODUCTION (https://auskick-manager.vercel.app) by default so
 * you never need the dev server running.
 *
 * Usage:
 *   node scripts/capture-marketing-screenshots.mjs
 *
 * Required env (from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SCREENSHOT_EMAIL   — the Supabase account to generate the magic link for
 *   SCREENSHOT_TEAM_ID
 *   SCREENSHOT_GAME_ID
 *   SCREENSHOT_RUN_TOKEN
 *
 * Optional:
 *   BASE_URL   — defaults to https://auskick-manager.vercel.app
 *   OUT_DIR    — defaults to public/marketing/screenshots
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- Load .env.local --------------------------------------------------
// Simple .env parser — no dotenv dependency needed.
function loadEnv(file) {
  try {
    const text = readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      const clean = line.trim();
      if (!clean || clean.startsWith("#")) continue;
      const eq = clean.indexOf("=");
      if (eq < 0) continue;
      const key = clean.slice(0, eq).trim();
      const val = clean.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env.local is optional
  }
}
loadEnv(resolve(__dirname, "..", ".env.local"));

// ---------- Config -----------------------------------------------------------
const BASE_URL =
  process.env.BASE_URL ?? "https://auskick-manager.vercel.app";
const OUT_DIR =
  process.env.OUT_DIR ??
  path.resolve(__dirname, "..", "public", "marketing", "screenshots");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SCREENSHOT_EMAIL =
  process.env.SCREENSHOT_EMAIL ?? process.env.TEST_EMAIL;

const TEAM_ID = process.env.SCREENSHOT_TEAM_ID;
const GAME_ID = process.env.SCREENSHOT_GAME_ID;
const RUN_TOKEN = process.env.SCREENSHOT_RUN_TOKEN;

// Portrait phone: 360×780 design px @ 3× = 1080×2340 physical px
const VIEWPORT = { width: 360, height: 780 };
const DEVICE_SCALE = 3;

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SCREENSHOT_PASSWORD = process.env.SCREENSHOT_PASSWORD ?? process.env.TEST_PASSWORD;

// ---------- Auth: sign-in server-side, inject cookie into Playwright ---------
// We use signInWithPassword from Node.js (not a browser form) to obtain fresh
// session tokens, then inject them as the Supabase auth cookie into the
// Playwright browser context. The app reads these cookies via its server
// components so every subsequent navigation is authenticated.
async function injectAuthCookie(context) {
  if (!SUPABASE_URL || !ANON_KEY || !SCREENSHOT_EMAIL || !SCREENSHOT_PASSWORD) {
    console.warn(
      "⚠  SCREENSHOT_EMAIL / SCREENSHOT_PASSWORD not set — skipping auth.",
    );
    return false;
  }

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: SCREENSHOT_EMAIL,
    password: SCREENSHOT_PASSWORD,
  });
  if (error || !data.session) {
    console.error("signInWithPassword error:", error?.message ?? "no session");
    return false;
  }
  const { session } = data;
  // Supabase @supabase/ssr stores the session as a base64-encoded JSON blob.
  const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const cookieValue =
    "base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        token_type: "bearer",
        user: session.user,
      }),
    ).toString("base64");

  const domain = new URL(BASE_URL).hostname;
  await context.addCookies([
    {
      name: cookieName,
      value: cookieValue,
      domain,
      path: "/",
      httpOnly: false,
      secure: !BASE_URL.includes("localhost"),
      sameSite: "Lax",
    },
  ]);
  console.log(`  ✓ session cookie injected for ${SCREENSHOT_EMAIL}`);
  return true;
}

// ---------- Helpers ----------------------------------------------------------
async function capture(page, filename) {
  const out = path.join(OUT_DIR, filename);
  await page.screenshot({ path: out });
  console.log(`    ✓ saved ${filename}`);
}

async function waitSettled(page, ms = 800) {
  // Let CSS transitions, font loads and lazy images finish.
  await page.waitForTimeout(ms);
}

/** Dismiss the first-time walkthrough / welcome modal if it appears. */
async function dismissWalkthrough(page) {
  const skipBtn = page.getByRole("button", { name: /skip for now/i }).first();
  if ((await skipBtn.count()) > 0) {
    await skipBtn.click();
    await page.waitForTimeout(400);
  }
  // Also dismiss any "Ready — tap the hooter" or similar overlay.
  const hootBtn = page
    .getByRole("button", { name: /hooter|q\d is live|start clock/i })
    .first();
  if ((await hootBtn.count()) > 0) {
    await hootBtn.click();
    await page.waitForTimeout(600);
  }
}

// ---------- Per-screen routines ---------------------------------------------
async function shotQuarterly(page) {
  console.log("• quarterly.png  (quarter-break screen)");
  if (!TEAM_ID || !GAME_ID) {
    console.log("  · skip (SCREENSHOT_TEAM_ID / _GAME_ID unset)");
    return;
  }
  await page.goto(`${BASE_URL}/teams/${TEAM_ID}/games/${GAME_ID}/live`, {
    waitUntil: "networkidle",
  });
  await waitSettled(page);
  // The page should be at the Q3 break already. If it's showing the
  // "Start Q1" screen instead, this still makes a valid screenshot.
  await capture(page, "quarterly.png");
}

async function startNextQuarter(page) {
  // Click whatever "Start Q_" button is visible to advance into live play.
  try {
    const btn = page.getByRole("button", { name: /start q/i });
    if ((await btn.count()) > 0) {
      await btn.first().click();
      await waitSettled(page, 1200);
      console.log("  ✓ quarter started");
    }
  } catch {
    console.warn("  ⚠  could not find 'Start Q' button — game may already be live");
  }
}

async function ensureLiveAndReady(page) {
  await page.goto(`${BASE_URL}/teams/${TEAM_ID}/games/${GAME_ID}/live`, {
    waitUntil: "networkidle",
  });
  await waitSettled(page, 600);
  await dismissWalkthrough(page);
  await startNextQuarter(page);
  await dismissWalkthrough(page);
  await waitSettled(page, 600);
}

async function shotLiveGame(page) {
  console.log("• live-game.png  (mid-quarter with zones populated)");
  if (!TEAM_ID || !GAME_ID) { console.log("  · skip"); return; }
  await ensureLiveAndReady(page);
  await capture(page, "live-game.png");
}

async function shotRotations(page) {
  console.log("• rotations.png  (rotation view with zone minute bars)");
  if (!TEAM_ID || !GAME_ID) { console.log("  · skip"); return; }
  if (!page.url().includes(GAME_ID)) await ensureLiveAndReady(page);
  // Try to open a "Rotations" tab/panel if one exists
  const rotBtn = page.getByRole("button", { name: /rotation/i }).first();
  if ((await rotBtn.count()) > 0) await rotBtn.click();
  await waitSettled(page, 600);
  await capture(page, "rotations.png");
}

async function shotScoring(page) {
  console.log("• scoring.png  (celebration chip visible after a goal)");
  if (!TEAM_ID || !GAME_ID) { console.log("  · skip"); return; }
  // Always navigate fresh to get a clean live-game state.
  await ensureLiveAndReady(page);

  // Step 1 — open the per-player scoring panel by clicking a player tile.
  // Player tiles have jersey numbers in "#N" format so filter on that.
  let panelOpen = false;
  const playerTiles = page.locator("button").filter({ hasText: /#\d{1,2}/ });
  const tileCount = await playerTiles.count();
  if (tileCount > 0) {
    await playerTiles.first().click();
    await page.waitForTimeout(600);
    panelOpen = true;
    console.log("  ✓ scoring panel opened");
  } else {
    const btns = await page.locator("button").allTextContents();
    console.warn("  ⚠  no player tile found to open scoring panel. Buttons:", btns.slice(0, 15).join(" | "));
  }

  // Step 2 — click the "+ GOAL" button inside the scoring panel.
  let goalLogged = false;
  if (panelOpen) {
    // The button label is "+ GOAL" (with a space). Try a few patterns.
    const goalBtnSelectors = [
      'button:has-text("+ GOAL")',
      'button:has-text("+GOAL")',
      'button:has-text("GOAL")',
    ];
    for (const sel of goalBtnSelectors) {
      const btn = page.locator(sel).first();
      if ((await btn.count()) > 0) {
        await btn.click();
        goalLogged = true;
        console.log(`  ✓ goal logged (${sel})`);
        break;
      }
    }
    if (!goalLogged) {
      const btns = await page.locator("button").allTextContents();
      console.warn("  ⚠  no goal button found inside panel. Buttons:", btns.slice(0, 20).join(" | "));
    }
  }

  // Step 3 — wait for the celebration chip animation, then screenshot.
  await waitSettled(page, 1400);
  await capture(page, "scoring.png");
}

async function shotFlexibility(page) {
  console.log("• flexibility.png  (player actions sheet)");
  if (!TEAM_ID || !GAME_ID) { console.log("  · skip"); return; }
  // Always navigate fresh — previous step (scoring) leaves the scoring panel
  // open and we need a clean live-game state with player tiles accessible.
  await ensureLiveAndReady(page);

  // The action sheet is triggered by a 500 ms long-press (pointerdown timer
  // in PlayerTile.tsx).  A normal .click() only opens the scoring panel.
  // We must use raw mouse events: move → down → wait 620 ms → up.
  //
  // Player tile buttons contain the jersey number in "#N" format, e.g.:
  //   "FWDJimmy J#1 · 27:06"  or  "1.0FWDJimmy J#1 · 27:06"
  // No data-player-id / data-zone attributes exist on the rendered tiles.

  const playerTiles = page.locator("button").filter({ hasText: /#\d{1,2}/ });
  const count = await playerTiles.count();
  let longPressed = false;

  if (count > 0) {
    // Pick the third tile if available (avoids "LENT"/"INJ" tiles that tend
    // to appear first or last in the list).
    const idx = Math.min(2, count - 1);
    const loc = playerTiles.nth(idx);
    const box = await loc.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.waitForTimeout(620);   // hold past the 500 ms threshold
      await page.mouse.up();
      longPressed = true;
      const txt = ((await loc.textContent()) ?? "").trim().slice(0, 30);
      console.log(`  ✓ long-press on player tile "${txt}"`);
    }
  }

  if (!longPressed) {
    const btns = await page.locator("button").allTextContents();
    console.warn("  ⚠  could not find a player tile for long-press. Visible buttons:", btns.slice(0, 20).join(" | "));
  }

  await waitSettled(page, 800);
  await capture(page, "flexibility.png");
}

async function shotShare(page) {
  console.log("• share.png  (public run-link page — parents view)");
  if (!RUN_TOKEN) {
    console.log("  · skip (SCREENSHOT_RUN_TOKEN unset)");
    return;
  }
  // The public /run/[token] page shows the live game without auth.
  // Navigate to it in a fresh context so we capture the no-auth experience.
  await page.goto(`${BASE_URL}/run/${RUN_TOKEN}`, {
    waitUntil: "networkidle",
  });
  await waitSettled(page, 800);
  await capture(page, "share.png");
}

// ---------- Main -------------------------------------------------------------
async function main() {
  console.log(`\nCapturing marketing screenshots`);
  console.log(`  → ${OUT_DIR}`);
  console.log(`  BASE_URL: ${BASE_URL}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
    // Match the iOS Safari UA — the app has some layout keyed off this.
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) " +
      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();

  const loggedIn = await injectAuthCookie(context);
  if (!loggedIn) {
    console.warn("⚠  Not logged in — authed shots will likely redirect to /login\n");
  }

  const routines = [
    shotQuarterly,
    shotLiveGame,
    shotRotations,
    shotScoring,
    shotFlexibility,
    shotShare,
  ];

  for (const fn of routines) {
    try {
      await fn(page);
    } catch (err) {
      console.error(
        `  ✗ ${fn.name} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  await browser.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
