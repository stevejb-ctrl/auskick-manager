// Second pass — gets the screenshots that required dismissing the walkthrough
// and the new-game form.
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

const storageState = {
  cookies: [{ name: cookieName.trim(), value: cookieValue, domain: 'localhost', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }],
  origins: [],
};

async function shot(page, filename, opts = {}) {
  const dest = path.join(OUT, filename);
  await page.screenshot({ path: dest, fullPage: false, ...opts });
  console.log('✓', filename);
}

async function goto(page, url) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
}

async function dismissWalkthrough(page) {
  try {
    const dialog = page.locator('[role="dialog"][aria-labelledby="wt-welcome-title"]');
    if (await dialog.count()) {
      // Try Skip button first, then any close/dismiss button
      const skip = dialog.getByRole('button', { name: /skip/i });
      const close = dialog.getByRole('button', { name: /close|dismiss|got it|done|×/i });
      if (await skip.count()) { await skip.click(); }
      else if (await close.count()) { await close.first().click(); }
      else {
        // Click the last button in the dialog (usually Skip/Done)
        const btns = dialog.getByRole('button');
        const count = await btns.count();
        if (count) await btns.nth(count - 1).click();
      }
      await page.waitForTimeout(400);
      // If still open, press Escape
      if (await dialog.count()) await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  } catch { /* ignore */ }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, storageState, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// ── New game form ─────────────────────────────────────────────────────────────
await goto(page, `/teams/${TEAM_ID}/games`);
// Look for the new game button/link
const newGameLink = page.getByRole('link', { name: /new game/i })
  .or(page.getByRole('button', { name: /new game/i }))
  .or(page.getByRole('link', { name: /\+ game|create game|add game/i }));

if (await newGameLink.count()) {
  await newGameLink.first().click();
  await page.waitForURL(/\/games\/new|\/games\?/, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(600);
  await shot(page, 'getting-started-create-game.png');
  await shot(page, 'games-create.png');
} else {
  // Dump what buttons/links are available to help debug
  const links = await page.getByRole('link').all();
  for (const l of links) console.log('link:', await l.textContent());
  const btns = await page.getByRole('button').all();
  for (const b of btns) console.log('btn:', await b.textContent());
}

// ── Live game ─────────────────────────────────────────────────────────────────
await goto(page, `/teams/${TEAM_ID}/games/${GAME_ID}/live`);
await dismissWalkthrough(page);
await page.waitForTimeout(500);

// Field view (clean — no modal)
await shot(page, 'live-game-field-clean.png');

// SwapCard — look for it and expand
const swapCard = page.locator('[data-testid="swap-card"]')
  .or(page.locator('.swap-card'))
  .or(page.getByRole('button', { name: /swap|sub|rotation/i }).first())
  .or(page.locator('button').filter({ has: page.locator('svg') }).first());

// Try clicking the top section of the page which usually has the swap card
// Take a screenshot first to see what's there
await shot(page, '_live-debug.png');

// Try clicking on the swap suggestions area (typically top of the content)
const swapArea = page.locator('button[aria-expanded]').first()
  .or(page.locator('button').filter({ hasText: /swap|suggest|sub/i }).first());
if (await swapArea.count()) {
  await swapArea.click();
  await page.waitForTimeout(400);
  await shot(page, 'rotations-swap-card.png');
  // click again to collapse if needed
  await swapArea.click().catch(() => {});
  await page.waitForTimeout(300);
}

// Select a player for scoring screenshot
// Find player tiles — try various selectors
const playerBtn = page.locator('button[data-player-id]').first()
  .or(page.locator('[class*="player"][class*="tile"]').first())
  .or(page.locator('button').filter({ hasText: /^\d+/ }).first());

if (await playerBtn.count()) {
  await playerBtn.first().click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await shot(page, 'live-game-scoring.png');
  await shot(page, 'track-scoring-player-tile.png');

  // Get a closeup of the player tile
  const box = await playerBtn.first().boundingBox();
  if (box) {
    await shot(page, 'rotations-player-tile.png', {
      clip: { x: 0, y: Math.max(0, box.y - 30), width: VIEWPORT.width, height: 260 },
    });
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────
await goto(page, `/teams/${TEAM_ID}/stats`);
await shot(page, 'stats-overview.png');
await page.mouse.wheel(0, 500);
await page.waitForTimeout(300);
await shot(page, 'stats-minutes-equity.png');
await page.mouse.wheel(0, 600);
await page.waitForTimeout(300);
await shot(page, 'stats-combinations.png');

await browser.close();
console.log(`\nDone — saved to: ${OUT}`);
