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
const storageState = {
  cookies: [{ name: cookieName.trim(), value: rest.join('='), domain: 'localhost', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }],
  origins: [],
};

async function shot(page, filename, opts = {}) {
  await page.screenshot({ path: path.join(OUT, filename), fullPage: false, ...opts });
  console.log('✓', filename);
}

async function dismissWalkthrough(page) {
  const dialog = page.locator('[role="dialog"]');
  if (await dialog.count()) {
    const btns = dialog.getByRole('button');
    const count = await btns.count();
    if (count) await btns.nth(count - 1).click();
    await page.waitForTimeout(500);
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, storageState, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// ── New game form ("Create manually") ─────────────────────────────────────────
await page.goto(`${BASE}/teams/${TEAM_ID}/games`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const createBtn = page.getByRole('button', { name: /create manually/i });
if (await createBtn.count()) {
  await createBtn.click();
  await page.waitForTimeout(600);
  await shot(page, 'getting-started-create-game.png');
  await shot(page, 'games-create.png');
  await page.goBack({ waitUntil: 'networkidle' });
}

// ── Live game — quarter break screen (current state) ──────────────────────────
await page.goto(`${BASE}/teams/${TEAM_ID}/games/${GAME_ID}/live`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await dismissWalkthrough(page);
await page.waitForTimeout(400);

// This IS the quarter-break / lineup picker screen
await shot(page, 'live-game-quarter-break.png');
await shot(page, 'live-game-lineup-picker.png');

// Tap a player to select them (swap mode)
const firstPlayer = page.getByRole('button').filter({ hasText: /^(FWD|CEN|BCK|H-FWD|H-BCK)/ }).first();
if (await firstPlayer.count()) {
  await firstPlayer.click();
  await page.waitForTimeout(300);
  // player tile closeup
  const box = await firstPlayer.boundingBox();
  if (box) await shot(page, 'rotations-player-tile.png', { clip: { x: 0, y: Math.max(0, box.y - 20), width: VIEWPORT.width, height: 280 } });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

// ── Start Q2 to get live game field view ──────────────────────────────────────
const startQ2 = page.getByRole('button', { name: /select team|start q/i });
if (await startQ2.count()) {
  await startQ2.click();
  await page.waitForURL(/live/, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1000);
  await dismissWalkthrough(page);
  await page.waitForTimeout(400);

  // Now in live Q2 — immediately pause the clock so the game doesn't run
  const clockBtn = page.getByRole('button', { name: /pause|Q2|Q1/i }).first();
  if (await clockBtn.count()) {
    // Check if clock is running (no ▶ symbol = running), pause it
    const txt = await clockBtn.textContent();
    if (!txt?.includes('▶')) { await clockBtn.click(); await page.waitForTimeout(300); }
  }

  await shot(page, 'live-game-field.png');

  // SwapCard — look for the expanded/collapsed card at top of page
  const swapCard = page.locator('button').filter({ hasText: /swap|suggest|\u2191|\u2193/i }).first()
    .or(page.locator('[aria-expanded]').first());
  if (await swapCard.count()) {
    await swapCard.click();
    await page.waitForTimeout(400);
    await shot(page, 'rotations-swap-card.png');
  } else {
    // Just take the top portion of the page which has the swap card
    await shot(page, 'rotations-swap-card.png', { clip: { x: 0, y: 0, width: VIEWPORT.width, height: 300 } });
  }

  // Zone bar closeup — bottom portion of a player tile
  await shot(page, 'rotations-zone-bar.png', { clip: { x: 0, y: 120, width: VIEWPORT.width, height: 340 } });

  // Select a player for scoring
  const fieldPlayer = page.getByRole('button').filter({ hasText: /^(FWD|CEN|BCK|H-FWD|H-BCK)/ }).first();
  if (await fieldPlayer.count()) {
    await fieldPlayer.click();
    await page.waitForTimeout(400);
    await shot(page, 'live-game-scoring.png');
    await shot(page, 'track-scoring-player-tile.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
}

await browser.close();
console.log(`\nDone. Files in: ${OUT}`);
console.log(fs.readdirSync(OUT).filter(f => !f.startsWith('_')).sort().join('\n'));
