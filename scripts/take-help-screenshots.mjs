// Usage: node scripts/take-help-screenshots.mjs
// Takes mobile screenshots of all help-documented pages and saves to
// vigorous-rhodes-86f3d7/public/help-screenshots/

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const TEAM_ID = 'e999df1f-3c34-4a77-bd99-e6346f8d34aa';
const GAME_ID = '0125cb5f-a2a5-42b7-b0d2-af8b7769c75a';
const BASE = 'http://localhost:3000';
const OUT = path.resolve('C:/Users/steve/OneDrive/Documents/Auskick manager/.claude/worktrees/vigorous-rhodes-86f3d7/public/help-screenshots');
const VIEWPORT = { width: 390, height: 844 };

const cookieRaw = fs.readFileSync('C:/Windows/Temp/siren_cookie.txt', 'utf8').trim();
const [cookieName, ...rest] = cookieRaw.split('=');
const cookieValue = rest.join('=');

fs.mkdirSync(OUT, { recursive: true });

const storageState = {
  cookies: [{
    name: cookieName.trim(),
    value: cookieValue,
    domain: 'localhost',
    path: '/',
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  }],
  origins: [],
};

async function shot(page, filename, opts = {}) {
  const dest = path.join(OUT, filename);
  await page.screenshot({ path: dest, fullPage: false, ...opts });
  console.log('✓', filename);
}

async function goto(page, url) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
  // brief pause for any animations
  await page.waitForTimeout(600);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, storageState, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// ── Public pages ──────────────────────────────────────────────────────────────
await goto(page, '/signup');
await shot(page, 'getting-started-signup.png');

// ── Dashboard ─────────────────────────────────────────────────────────────────
await goto(page, '/dashboard');
await shot(page, 'overview-landing.png');
await shot(page, 'teams-dashboard.png');

// ── New team form ─────────────────────────────────────────────────────────────
await goto(page, '/teams/new');
await shot(page, 'getting-started-create-team.png');

// ── Team settings ─────────────────────────────────────────────────────────────
await goto(page, `/teams/${TEAM_ID}/settings`);
await shot(page, 'teams-settings.png');

// ── Squad – player list ───────────────────────────────────────────────────────
await goto(page, `/teams/${TEAM_ID}/squad`);
await shot(page, 'squads-player-list.png');
await shot(page, 'getting-started-add-players.png');

// ── Squad – add player form open ──────────────────────────────────────────────
const addBtn = page.getByRole('button', { name: /add player/i });
if (await addBtn.count()) {
  await addBtn.click();
  await page.waitForTimeout(400);
  await shot(page, 'squads-add-player.png');
}

// ── Games list ────────────────────────────────────────────────────────────────
await goto(page, `/teams/${TEAM_ID}/games`);
await shot(page, 'games-list.png');

// ── New game form ─────────────────────────────────────────────────────────────
const newGameBtn = page.getByRole('link', { name: /new game/i }).or(
  page.getByRole('button', { name: /new game/i })
);
if (await newGameBtn.count()) {
  await newGameBtn.first().click();
  await page.waitForTimeout(500);
  await shot(page, 'getting-started-create-game.png');
  await shot(page, 'games-create.png');
  await page.goBack({ waitUntil: 'networkidle' });
}

// ── Game detail ───────────────────────────────────────────────────────────────
await goto(page, `/teams/${TEAM_ID}/games/${GAME_ID}`);
await shot(page, 'games-detail.png');
await shot(page, 'track-scoring-toggle.png');

// ── Live game – field view ────────────────────────────────────────────────────
await goto(page, `/teams/${TEAM_ID}/games/${GAME_ID}/live`);
await shot(page, 'live-game-field.png');
await shot(page, 'rotations-zone-bar.png');

// ── Live game – player tile closeup ──────────────────────────────────────────
const firstTile = page.locator('[data-player-tile]').first()
  .or(page.locator('.player-tile').first());
if (await firstTile.count()) {
  const box = await firstTile.boundingBox();
  if (box) {
    await shot(page, 'rotations-player-tile.png', {
      clip: { x: 0, y: Math.max(0, box.y - 20), width: VIEWPORT.width, height: Math.min(300, box.height + 80) },
    });
  }
}

// ── SwapCard – try to expand ──────────────────────────────────────────────────
const swapCard = page.locator('[data-swap-card]').first()
  .or(page.getByText(/swap/i).first());
if (await swapCard.count()) {
  await swapCard.click();
  await page.waitForTimeout(400);
  await shot(page, 'rotations-swap-card.png');
}

// ── Live game – select a player for scoring ───────────────────────────────────
// tap on first field player to show Goal/Behind buttons
const fieldPlayer = page.locator('[data-zone]').first()
  .or(page.locator('button').filter({ hasText: /\d+/ }).first());
if (await fieldPlayer.count()) {
  await fieldPlayer.first().click();
  await page.waitForTimeout(400);
  await shot(page, 'live-game-scoring.png');
  await shot(page, 'track-scoring-player-tile.png');
}

// ── Stats ─────────────────────────────────────────────────────────────────────
await goto(page, `/teams/${TEAM_ID}/stats`);
await shot(page, 'stats-overview.png');

// scroll down to show minutes equity
await page.mouse.wheel(0, 500);
await page.waitForTimeout(300);
await shot(page, 'stats-minutes-equity.png');

await page.mouse.wheel(0, 600);
await page.waitForTimeout(300);
await shot(page, 'stats-combinations.png');

// ── Lineup picker: availability → lineup ─────────────────────────────────────
// We can only capture these if there's an upcoming game to start fresh.
// Skip for now unless we find a second game.

await browser.close();
console.log(`\nDone — screenshots saved to:\n${OUT}`);
