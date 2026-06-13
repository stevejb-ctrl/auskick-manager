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

// Dismiss any overlay/dialog by clicking its last button or pressing Escape
async function dismissAny(page) {
  for (let i = 0; i < 3; i++) {
    const overlay = page.locator('.fixed.inset-0, [role="dialog"], [role="alertdialog"]').first();
    if (!await overlay.count()) break;
    const btns = overlay.getByRole('button');
    const count = await btns.count();
    if (count) {
      // try Skip, then Close, then last button
      const skip = overlay.getByRole('button', { name: /skip|close|got it|done|dismiss|cancel/i });
      if (await skip.count()) await skip.first().click();
      else await btns.nth(count - 1).click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(400);
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, storageState, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// ── LIVE GAME: State 1 — end of Q1, players on field ─────────────────────────
await page.goto(`${BASE}/teams/${TEAM_ID}/games/${GAME_ID}/live`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await dismissAny(page);
await page.waitForTimeout(300);

// This is the field view at Q1 end — shows players in zones + swap card area
await shot(page, 'live-game-field.png');

// Tap a player tile to show the action sheet / scoring buttons
const playerTile = page.getByRole('button').filter({ hasText: /^(FWD|CEN|BCK|H-FWD|H-BCK)/ }).first();
if (await playerTile.count()) {
  // Long-press via mouse down/up with delay to open action sheet
  const box = await playerTile.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(700); // long press
    await page.mouse.up();
    await page.waitForTimeout(500);
    await shot(page, 'live-game-scoring.png');
    await shot(page, 'track-scoring-player-tile.png');
    // Close the action sheet
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await dismissAny(page);
  }
}

// Player tile closeup (zone bar visible)
if (await playerTile.count()) {
  const box = await playerTile.boundingBox();
  if (box) {
    await shot(page, 'rotations-player-tile.png', { clip: { x: 0, y: Math.max(0, box.y - 10), width: VIEWPORT.width, height: 260 } });
    await shot(page, 'rotations-zone-bar.png', { clip: { x: 0, y: Math.max(0, box.y - 10), width: VIEWPORT.width, height: 260 } });
  }
}

// SwapCard — top section of page (usually first 200px below header)
await shot(page, 'rotations-swap-card.png', { clip: { x: 0, y: 0, width: VIEWPORT.width, height: 280 } });

// ── LIVE GAME: State 2 — zone reshuffle screen ────────────────────────────────
const selectTeam = page.getByRole('button', { name: /select team/i });
if (await selectTeam.count()) {
  await selectTeam.click();
  await page.waitForTimeout(800);
  await dismissAny(page);
  await page.waitForTimeout(300);
  await shot(page, 'live-game-quarter-break.png');
  await shot(page, 'live-game-lineup-picker.png');
}

// ── LIVE GAME: State 3 — start Q2, get live view ─────────────────────────────
const startQ2 = page.getByRole('button', { name: /start q2/i });
if (await startQ2.count()) {
  await startQ2.click();
  await page.waitForTimeout(1000);
  await dismissAny(page);
  await page.waitForTimeout(400);
  await shot(page, '_live-q2-started.png'); // debug

  // Pause clock immediately
  const clock = page.getByRole('button').filter({ hasText: /Q\d/ }).first();
  if (await clock.count()) {
    const txt = await clock.textContent() ?? '';
    if (!txt.includes('▶')) { await clock.click(); await page.waitForTimeout(300); }
  }

  // Tap a player for scoring buttons
  const livePlayer = page.getByRole('button').filter({ hasText: /^(FWD|CEN|BCK|H-FWD|H-BCK)/ }).first();
  if (await livePlayer.count()) {
    await livePlayer.click({ timeout: 5000 });
    await page.waitForTimeout(400);
    await shot(page, 'live-game-scoring.png');
    await shot(page, 'track-scoring-player-tile.png');
    const box = await livePlayer.boundingBox();
    if (box) await shot(page, 'rotations-player-tile.png', { clip: { x: 0, y: Math.max(0, box.y - 10), width: VIEWPORT.width, height: 260 } });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  await shot(page, 'live-game-field.png'); // cleaner Q2 view

  // Sub due state — just take current swap card area
  await shot(page, 'live-game-sub-due.png', { clip: { x: 0, y: 0, width: VIEWPORT.width, height: 320 } });
  await shot(page, 'rotations-swap-card.png', { clip: { x: 0, y: 0, width: VIEWPORT.width, height: 320 } });
  await shot(page, 'rotations-zone-bar.png', { clip: { x: 0, y: 0, width: VIEWPORT.width, height: 400 } });
}

await browser.close();

console.log('\nAll screenshots:');
console.log(fs.readdirSync(OUT).filter(f => !f.startsWith('_')).sort().join('\n'));
