// ─── Starting the next period goes straight to it ────────────
// Stagehand rounds 9 and 10 (9 Nov 2026), netball: Start Q3 showed the
// live court, then the break again ("Q2 is over", and "the period ended
// while you were adding a goal" when the goal sheet was open), then Q3.
// The break's lineup and the quarter start are optimistic writes
// (useOptimisticEvents). Netball's break made them inside a React
// transition, which the router's server-action transition took in with
// it, so the render when the quarter start saved drew the game without
// them, the break, until the page's refresh landed. The other sports'
// breaks write outside one, and are checked here too.
//
// Covers: src/components/netball/NetballQuarterBreak.tsx (Start), and
// the breaks of soccer's family and basketball.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { ownerOf, skipHints } from "../helpers/a11y";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

type Sport = "netball" | "soccer" | "basketball";

const SEEDS: Record<Sport, { age: string; count: number; periodMin: number; next: RegExp; lineup: (ids: string[]) => Record<string, unknown> }> = {
  netball: { age: "11u", count: 9, periodMin: 10, next: /^Start Q2/, lineup: (ids) => ({ positions: Object.fromEntries(["gs", "ga", "wa", "c", "wd", "gd", "gk"].map((k, i) => [k, [ids[i]]])), bench: ids.slice(7) }) },
  soccer: { age: "U12", count: 12, periodMin: 25, next: /^Start 2nd half/, lineup: (ids) => ({ keeper: ids[0], lines: { def: ids.slice(1, 4), mid: ids.slice(4, 7), att: ids.slice(7, 9), field: [] }, bench: ids.slice(9) }) },
  basketball: { age: "U12", count: 7, periodMin: 20, next: /^Start 2nd half/, lineup: (ids) => ({ lines: { guard: ids.slice(0, 2), forward: ids.slice(2, 5), court: [] }, bench: ids.slice(5) }) },
};

/** A game at its first break, on the coach's own screen. */
async function atFirstBreak(sport: Sport) {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const cfg = SEEDS[sport];
  const team = await makeTeam(admin, { ownerId, sport, ageGroup: cfg.age, name: `Flick ${sport} ${Date.now() % 100000}` });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: cfg.count });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Sharks" });
  const ids = players.map((p) => p.id);
  const ms = cfg.periodMin * 60_000;
  const t0 = Date.now() - ms - 120_000;
  const at = (s: number) => new Date(t0 + s).toISOString();
  const { error } = await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup: cfg.lineup(ids), sport }, created_by: ownerId, created_at: at(-1000) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1, sport }, created_by: ownerId, created_at: at(0) },
    { game_id: game.id, type: "quarter_end", metadata: { quarter: 1, sport, elapsed_ms: ms }, created_by: ownerId, created_at: at(ms) },
  ]);
  if (error) throw new Error(`seed: ${error.message}`);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  return { team, game };
}

/** Starts noting every change of "is the break on screen". */
async function watchBreak(page: Page): Promise<() => Promise<boolean[]>> {
  await page.evaluate(() => {
    const w = window as unknown as { __breakSeen: boolean[] };
    w.__breakSeen = [];
    const look = () => {
      const on = document.querySelector('[data-testid="period-over"]') !== null;
      if (w.__breakSeen.at(-1) !== on) w.__breakSeen.push(on);
    };
    look();
    new MutationObserver(look).observe(document.body, { childList: true, subtree: true });
  });
  return () => page.evaluate(() => (window as unknown as { __breakSeen: boolean[] }).__breakSeen);
}

for (const sport of Object.keys(SEEDS) as Sport[]) {
  test(`${sport}: Start the next period goes live once, with no flash of the break`, async ({ page }) => {
    const { team, game } = await atFirstBreak(sport);
    await skipHints(page);
    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    await waitForHydration(page);
    await expect(page.getByTestId("period-over")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: SEEDS[sport].next }).first().click();
    const now = page.getByRole("button", { name: /^Start .* now$/i }).first();
    await expect(now).toBeVisible({ timeout: 10_000 });
    const seen = await watchBreak(page);
    await now.click();
    await page.waitForTimeout(4000);
    // The break goes, once, and doesn't come back while the writes save
    // and the page catches up.
    expect(await seen()).toEqual([true, false]);
    await expect(page.getByRole("button", { name: /^clock — /i }).first()).toBeVisible();
  });
}
