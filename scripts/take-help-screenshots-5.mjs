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
  origins: [{ origin: 'http://localhost:3000', localStorage: [{ name: 'gm-walkthrough-seen', value: '1' }] }],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, storageState, deviceScaleFactor: 2 });
const page = await ctx.newPage();

async function shot(page, filename, opts = {}) {
  await page.screenshot({ path: path.join(OUT, filename), fullPage: false, ...opts });
  console.log('✓', filename);
}

async function go(url) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
}

// ── LIVE GAME: end of Q1 / field view ─────────────────────────────────────────
await go(`/teams/${TEAM_ID}/games/${GAME_ID}/live`);
await shot(page, 'live-game-field.png');

// Swap card / sub area — top of field
await shot(page, 'rotations-swap-card.png', { clip: { x: 0, y: 0, width: VIEWPORT.width, height: 260 } });

// Tap first player tile to get action options
const playerBtn = page.getByRole('button').filter({ hasText: /^(FWD|CEN|BCK|H-FWD|H-BCK)/ }).first();
const box = await playerBtn.boundingBox();
if (box) {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  // regular tap first (shows scoring buttons if scoring enabled)
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(400);
  await shot(page, 'live-game-scoring.png');
  await shot(page, 'track-scoring-player-tile.png');
  await shot(page, 'rotations-player-tile.png', { clip: { x: 0, y: Math.max(0, box.y - 10), width: VIEWPORT.width, height: 260 } });
  await shot(page, 'rotations-zone-bar.png', { clip: { x: 0, y: Math.max(0, box.y - 10), width: VIEWPORT.width, height: 260 } });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

// ── LIVE GAME: zone reshuffle screen ──────────────────────────────────────────
const selectTeam = page.getByRole('button', { name: /select team/i });
if (await selectTeam.count()) {
  await selectTeam.click();
  await page.waitForTimeout(700);
  await shot(page, 'live-game-quarter-break.png');
  await shot(page, 'live-game-lineup-picker.png');
}

// ── Start Q2 ──────────────────────────────────────────────────────────────────
const startQ2 = page.getByRole('button', { name: /start q2/i });
if (await startQ2.count()) {
  await startQ2.click();
  await page.waitForTimeout(1000);

  // Pause clock immediately
  const clock = page.getByRole('button').filter({ hasText: /Q\d/ }).first();
  if (await clock.count()) {
    const txt = await clock.textContent() ?? '';
    if (!txt.includes('▶')) { await clock.click(); await page.waitForTimeout(300); }
  }

  await shot(page, '_live-q2.png');

  // Tap player for scoring
  const livePlayer = page.getByRole('button').filter({ hasText: /^(FWD|CEN|BCK|H-FWD|H-BCK)/ }).first();
  if (await livePlayer.count()) {
    await livePlayer.click({ timeout: 5000 });
    await page.waitForTimeout(400);
    await shot(page, 'live-game-scoring.png');
    await shot(page, 'track-scoring-player-tile.png');
    const b2 = await livePlayer.boundingBox();
    if (b2) await shot(page, 'rotations-player-tile.png', { clip: { x: 0, y: Math.max(0, b2.y - 10), width: VIEWPORT.width, height: 260 } });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  await shot(page, 'live-game-field.png');
  await shot(page, 'live-game-sub-due.png', { clip: { x: 0, y: 0, width: VIEWPORT.width, height: 280 } });
  await shot(page, 'rotations-swap-card.png', { clip: { x: 0, y: 0, width: VIEWPORT.width, height: 280 } });
  await shot(page, 'rotations-zone-bar.png', { clip: { x: 0, y: 0, width: VIEWPORT.width, height: 360 } });
}

await browser.close();

console.log('\nAll screenshots:');
console.log(fs.readdirSync(OUT).filter(f => !f.startsWith('_')).sort().join('\n'));
