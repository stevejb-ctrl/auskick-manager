// ─── Contrast and tap targets ───────────────────────────────────────
// UX round 3 (e4, 24 Oct 2026):
//   - The muted text token (ink-mute #8A948C) was 2.88:1 on the page,
//     3.14:1 on white and 2.66:1 on surface-alt: every hint, the bottom
//     nav's labels and "11 & Under · 7 on field" failed AA (4.5:1).
//   - Bench pair badges ("#1" on the zone-tinted strip) were 2.5:1, and
//     the break's margin ("+5", ok green on white) 4.05:1.
//   - "Make swap" was 79×25 on every sport's sub card, netball's scorer
//     dock Cancel 50×17, and the score fix's × 25×22, on a sideline
//     phone used with cold hands.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam } from "../fixtures/factories";
import { basketballGame, boxOf, contrast, contrastOf, netballGame, openLive, ownerOf, skipHints, unionGame } from "../helpers/a11y";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

const PAGE = [247, 245, 241] as const; // warm, the page background
const WHITE = [255, 255, 255] as const; // surface
const ALT = [239, 236, 230] as const; // surface-alt

test("muted text passes AA on the page, on white and on surface-alt", async ({ page }) => {
  const admin = createAdminClient();
  const team = await makeTeam(admin, { ownerId: await ownerOf(admin), sport: "netball", ageGroup: "go", name: `A11Y-CON ${Date.now() % 100000}` });
  await page.goto(`/teams/${team.id}/squad`);
  await waitForHydration(page);
  const muted = page.locator(".text-ink-mute").first();
  await expect(muted).toBeAttached({ timeout: 15_000 });
  const rgb = await muted.evaluate((el) => getComputedStyle(el).color.match(/\d+/g)!.slice(0, 3).map(Number));
  const fg = rgb as unknown as [number, number, number];
  expect(contrast(fg, [...PAGE]), "on the page").toBeGreaterThanOrEqual(4.5);
  expect(contrast(fg, [...WHITE]), "on white").toBeGreaterThanOrEqual(4.5);
  expect(contrast(fg, [...ALT]), "on surface-alt").toBeGreaterThanOrEqual(4.5);
});

test("basketball's sub card: bench pair badges pass AA and Make swap is a 44 px target", async ({ page }) => {
  // Eight kids, five on: three on the bench, due 2 minutes in.
  const { team, game } = await basketballGame({ name: "A11Y-CON-BB", subIntervalSec: 120, elapsedSec: 130 });
  await skipHints(page);
  await openLive(page, team.id, game.id);

  const bench = page.getByRole("group", { name: "Bench" });
  const badge = bench.getByLabel(/^Going on/).first();
  await expect(badge).toBeVisible({ timeout: 15_000 });
  for (const text of await badge.locator("span").all()) {
    expect(await contrastOf(text), `"${await text.textContent()}"`).toBeGreaterThanOrEqual(4.5);
  }

  const make = page.locator("button", { hasText: /^Make swap$/ });
  await expect(make.first()).toBeVisible();
  for (const b of await make.all()) {
    expect((await boxOf(b)).height).toBeGreaterThanOrEqual(44);
    // Each names its kids for a screen reader ("Swap Ava off, Leo on").
    await expect(b).toHaveAccessibleName(/^Swap .+ off, .+ on$/);
  }
});

test("union's sub card: Make swap is a 44 px target", async ({ page }) => {
  // 18 here, 15 on: three on the bench, due 2 minutes in.
  const { team, game } = await unionGame({ name: "A11Y-CON-RU", count: 18, subIntervalSec: 120, elapsedSec: 130 });
  await skipHints(page);
  await openLive(page, team.id, game.id);
  const make = page.locator("button", { hasText: /^Make swap$/ });
  await expect(make.first()).toBeVisible({ timeout: 15_000 });
  for (const b of await make.all()) expect((await boxOf(b)).height).toBeGreaterThanOrEqual(44);
});

test("netball: the scorer dock's Cancel is a 44 px target", async ({ page }) => {
  const { team, game } = await netballGame({ name: "A11Y-CON-NB-DOCK" });
  await skipHints(page);
  await openLive(page, team.id, game.id);

  await page.getByRole("button", { name: /^goal shooter, /i }).click();
  await expect(page.getByText(/^Record goal for/)).toBeVisible();
  const cancel = await boxOf(page.getByRole("button", { name: "Cancel", exact: true }));
  expect(cancel.height).toBeGreaterThanOrEqual(44);
  expect(cancel.width).toBeGreaterThanOrEqual(44);
});

test("netball's break: the score fix's × is a 44 px target that names the score", async ({ page }) => {
  const { team, game, players } = await netballGame({
    name: "A11Y-CON-NB-FIX",
    ended: true,
    rows: (ids) => [
      { type: "goal", player_id: ids[0], metadata: { quarter: 1 } },
      { type: "opponent_goal", metadata: { quarter: 1 } },
    ],
  });
  await skipHints(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await page.getByRole("button", { name: /^score /i }).click({ timeout: 15_000 });
  const del = page.getByRole("button", { name: /^delete /i });
  await expect(del.first()).toBeVisible({ timeout: 10_000 });
  for (const d of await del.all()) {
    const b = await boxOf(d);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.width).toBeGreaterThanOrEqual(44);
  }
  // Each × names what it deletes.
  await expect(page.getByRole("button", { name: `Delete goal by ${players[0].full_name}` })).toBeVisible();
});

test("the break's margin passes AA", async ({ page }) => {
  const { team, game, lineup } = await unionGame({
    name: "A11Y-CON-MARGIN",
    ended: true,
    rows: (ids) => [{ type: "try", player_id: ids[0], metadata: { quarter: 1, elapsed_ms: 60_000 } }],
  });
  void lineup;
  await skipHints(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const score = page.getByRole("button", { name: /^score /i });
  await expect(score).toBeVisible({ timeout: 15_000 });
  const margin = score.getByText(/^\+\d+$/);
  await expect(margin).toBeVisible();
  expect(await contrastOf(margin)).toBeGreaterThanOrEqual(4.5);
});
