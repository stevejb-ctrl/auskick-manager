// ─── A double tap on Undo takes back one thing ───────────────
// Stagehand round 10 (r10-double-tapper, basketball): a parent who
// double-taps everything tapped Undo twice and it took back two things,
// a swap and then the score before it, 55 ms apart. The strip names the
// next thing the moment the first undo lands, so the second tap of the
// same double tap hit that. The second tap of a double tap (the click's
// `detail` of 2) now does nothing; an Undo tapped on its own still does.
//
// Covers: src/components/live/UndoStrip.tsx, shared by every sport's
// live screen (useOneUndo / useLiveChrome).

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { ownerOf, skipHints } from "../helpers/a11y";
import { waitForHydration } from "../helpers/navigation";

test.describe.configure({ mode: "parallel" });

type Sport = "afl" | "netball" | "basketball" | "soccer";

const SEEDS: Record<Sport, { age: string; count: number; score: string; lineup: (ids: string[]) => Record<string, unknown> }> = {
  afl: { age: "U10", count: 15, score: "opponent_goal", lineup: (ids) => ({ back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) }) },
  netball: { age: "11u", count: 9, score: "opponent_goal", lineup: (ids) => ({ positions: Object.fromEntries(["gs", "ga", "wa", "c", "wd", "gd", "gk"].map((k, i) => [k, [ids[i]]])), bench: ids.slice(7) }) },
  basketball: { age: "U12", count: 7, score: "opponent_two_pointer", lineup: (ids) => ({ lines: { guard: ids.slice(0, 2), forward: ids.slice(2, 5), court: [] }, bench: ids.slice(5) }) },
  soccer: { age: "U12", count: 12, score: "opponent_goal", lineup: (ids) => ({ keeper: ids[0], lines: { def: ids.slice(1, 4), mid: ids.slice(4, 7), att: ids.slice(7, 9), field: [] }, bench: ids.slice(9) }) },
};

for (const sport of Object.keys(SEEDS) as Sport[]) {
  test(`${sport}: a double tap on Undo takes back one score, not two`, async ({ page }) => {
    const admin = createAdminClient();
    const ownerId = await ownerOf(admin);
    const cfg = SEEDS[sport];
    const team = await makeTeam(admin, { ownerId, sport, ageGroup: cfg.age, name: `Undo2 ${sport} ${Date.now() % 100000}` });
    await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
    const players = await makePlayers(admin, { teamId: team.id, ownerId, count: cfg.count });
    const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Sharks" });
    const ids = players.map((p) => p.id);
    const t0 = Date.now() - 120_000;
    const at = (ms: number) => new Date(t0 + ms).toISOString();
    const { error } = await admin.from("game_events").insert([
      { game_id: game.id, type: "lineup_set", metadata: { lineup: cfg.lineup(ids), sport }, created_by: ownerId, created_at: at(-1000) },
      { game_id: game.id, type: "quarter_start", metadata: { quarter: 1, sport }, created_by: ownerId, created_at: at(0) },
      { game_id: game.id, type: cfg.score, metadata: { quarter: 1, sport, elapsed_ms: 30_000 }, created_by: ownerId, created_at: at(30_000) },
      { game_id: game.id, type: cfg.score, metadata: { quarter: 1, sport, elapsed_ms: 60_000 }, created_by: ownerId, created_at: at(60_000) },
    ]);
    if (error) throw new Error(`seed: ${error.message}`);
    await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

    await skipHints(page);
    await page.goto(`/teams/${team.id}/games/${game.id}/live`);
    await waitForHydration(page);
    const undo = page.getByTestId("undo-strip").getByRole("button", { name: "Undo" });
    await expect(undo).toBeVisible({ timeout: 20_000 });

    await undo.dblclick();
    const undos = async () =>
      (await admin.from("game_events").select("id").eq("game_id", game.id).eq("type", "score_undo")).data?.length ?? 0;
    await expect.poll(undos, { timeout: 15_000 }).toBe(1);
    // And it stays one: the second tap didn't take the other score.
    await page.waitForTimeout(2000);
    expect(await undos()).toBe(1);
    // A tap on its own is a new tap: it takes back the other one.
    await undo.click();
    await expect.poll(undos, { timeout: 15_000 }).toBe(2);
  });
}
