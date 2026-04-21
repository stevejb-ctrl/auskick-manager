#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Playwright screenshot-capture for the marketing site.
 *
 * Drives the running dev server, logs in as the configured test user,
 * and captures each of the screens referenced by `src/app/page.tsx`
 * at portrait phone dimensions (matches the PhoneFrame aspect ratio).
 *
 * Config comes from env vars (stick them in `.env.local` or pass
 * inline). Everything is optional with a sensible default except the
 * auth credentials — without those, only the unauthenticated shots
 * (login, run-token) are captured.
 *
 * Required for the full run:
 *   TEST_EMAIL               — login for the screenshot tour
 *   TEST_PASSWORD            — password for TEST_EMAIL
 *   SCREENSHOT_TEAM_ID       — UUID of a team with a populated squad
 *   SCREENSHOT_GAME_ID       — UUID of a game on that team (ideally
 *                              one that's been scored / is mid-rotation)
 *   SCREENSHOT_RUN_TOKEN     — public run-token for the share screen
 *
 * Optional:
 *   BASE_URL                 — defaults to http://localhost:3000
 *   OUT_DIR                  — defaults to public/marketing/screenshots
 *
 * Usage:
 *   npm run dev                    # in one terminal
 *   npm run capture:screenshots    # in another
 *
 * The script is intentionally forgiving: each capture is wrapped in
 * its own try/catch so one missing route doesn't abort the rest.
 * Re-run whenever the app's look & feel changes — this is the
 * "rebuild the screenshots" button.
 */

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_DIR =
  process.env.OUT_DIR ??
  path.resolve(__dirname, "..", "public", "marketing", "screenshots");

const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;
const TEAM_ID = process.env.SCREENSHOT_TEAM_ID;
const GAME_ID = process.env.SCREENSHOT_GAME_ID;
const RUN_TOKEN = process.env.SCREENSHOT_RUN_TOKEN;

// Portrait phone dimensions matching PhoneFrame's 9/19.5 aspect ratio.
// 360×780 is the design dimension; 3× it for crisper retina captures
// and the `object-cover` downscaling in the marketing carousel stays
// sharp on HiDPI displays.
const VIEWPORT = { width: 360, height: 780 };
const DEVICE_SCALE = 3;

/** Utility — captures one PNG into OUT_DIR with the given filename. */
async function capture(page, filename, { selector, fullPage = false } = {}) {
  const out = path.join(OUT_DIR, filename);
  if (selector) {
    const el = await page.waitForSelector(selector, { timeout: 10_000 });
    await el.screenshot({ path: out });
  } else {
    await page.screenshot({ path: out, fullPage });
  }
  console.log(`  ✓ ${filename}`);
}

async function loginIfNeeded(page) {
  if (!TEST_EMAIL || !TEST_PASSWORD) return false;

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  // Fill the password form (NOT magic-link / OAuth — those require
  // real email inboxes and the screenshot script should stay hermetic).
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);
  return true;
}

/**
 * Per-screen capture routines. Each one is deliberately thin —
 * navigate, give the page a beat to settle, screenshot. If a route
 * needs a specific UI state (e.g. scoring modal open), drive it here
 * so the capture is reproducible.
 */
const routines = {
  async live() {
    if (!TEAM_ID || !GAME_ID) {
      console.log("  · skip live-game.svg (SCREENSHOT_TEAM_ID / _GAME_ID unset)");
      return;
    }
    const page = this;
    await page.goto(
      `${BASE_URL}/teams/${TEAM_ID}/games/${GAME_ID}/live`,
      { waitUntil: "networkidle" },
    );
    await page.waitForTimeout(600); // let the reveal animations settle
    await capture(page, "live-game.png");
  },

  async rotations() {
    if (!TEAM_ID || !GAME_ID) {
      console.log("  · skip rotations.png (SCREENSHOT_TEAM_ID / _GAME_ID unset)");
      return;
    }
    const page = this;
    // Live game = rotations view. Same shot, different moment in the
    // narrative — capture without the sub-due modal to keep it calm.
    await page.goto(
      `${BASE_URL}/teams/${TEAM_ID}/games/${GAME_ID}/live`,
      { waitUntil: "networkidle" },
    );
    await page.waitForTimeout(600);
    await capture(page, "rotations.png");
  },

  async scoring() {
    if (!TEAM_ID || !GAME_ID) {
      console.log("  · skip scoring.png (SCREENSHOT_TEAM_ID / _GAME_ID unset)");
      return;
    }
    const page = this;
    // Scoring lives inside the live game too — open with a `?mode=score`
    // deeplink if the app supports it; otherwise this is the same as
    // live and is curated manually.
    await page.goto(
      `${BASE_URL}/teams/${TEAM_ID}/games/${GAME_ID}/live?view=score`,
      { waitUntil: "networkidle" },
    );
    await page.waitForTimeout(600);
    await capture(page, "scoring.png");
  },

  async availability() {
    if (!TEAM_ID || !GAME_ID) {
      console.log("  · skip availability.png (SCREENSHOT_TEAM_ID / _GAME_ID unset)");
      return;
    }
    const page = this;
    await page.goto(
      `${BASE_URL}/teams/${TEAM_ID}/games/${GAME_ID}`,
      { waitUntil: "networkidle" },
    );
    await page.waitForTimeout(600);
    await capture(page, "availability.png");
  },

  async share() {
    if (!RUN_TOKEN) {
      console.log("  · skip share.png (SCREENSHOT_RUN_TOKEN unset)");
      return;
    }
    const page = this;
    await page.goto(`${BASE_URL}/run/${RUN_TOKEN}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await capture(page, "share.png");
  },

  async fixtures() {
    if (!TEAM_ID) {
      console.log("  · skip fixtures.png (SCREENSHOT_TEAM_ID unset)");
      return;
    }
    const page = this;
    await page.goto(`${BASE_URL}/teams/${TEAM_ID}/games`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(600);
    await capture(page, "fixtures.png");
  },

  async stats() {
    if (!TEAM_ID) {
      console.log("  · skip stats.png (SCREENSHOT_TEAM_ID unset)");
      return;
    }
    const page = this;
    await page.goto(`${BASE_URL}/teams/${TEAM_ID}/stats`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(600);
    await capture(page, "stats.png");
  },
};

async function main() {
  console.log(`Capturing to ${OUT_DIR}`);
  console.log(`Base URL: ${BASE_URL}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
    // Masquerade as iOS Safari — the PWA layout keys off this in a
    // couple of places, and we want the marketing shots to reflect
    // how the app looks to a real parent on their phone.
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) " +
      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();

  const loggedIn = await loginIfNeeded(page);
  if (!loggedIn) {
    console.log("⚠  TEST_EMAIL / TEST_PASSWORD not set — skipping authed shots");
  }

  for (const [name, fn] of Object.entries(routines)) {
    console.log(`• ${name}`);
    try {
      await fn.call(page);
    } catch (err) {
      console.error(`  ✗ ${name} failed:`, err instanceof Error ? err.message : err);
    }
  }

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
