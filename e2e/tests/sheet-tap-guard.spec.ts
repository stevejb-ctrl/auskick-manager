// ─── A sheet takes no taps while it slides in ────────────────
// Stagehand round 9 (9 Nov 2026), about ten runs: a coach taps + GOAL,
// the scorer sheet slides up under their finger, and the next tap,
// aimed where Mia's row will be, lands on the row above mid-slide. The
// goal goes to the wrong kid. Every sheet (Modal, ActionSheet,
// SlotFillSheet) now ignores taps until it has settled, and leaves a
// moment's shield over the screen once it closes (useSheetTapGuard).
//
// The taps here are raw mouse clicks at a point, as a finger's are:
// Playwright's own clicks wait for a sheet to stop moving.

import { test, expect } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { ownerOf, skipHints } from "../helpers/a11y";
import { waitForHydration } from "../helpers/navigation";

type Admin = ReturnType<typeof createAdminClient>;

async function aflInQ1() {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const team = await makeTeam(admin, { ownerId, sport: "afl", ageGroup: "U10", name: `Guard ${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 15 });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Sharks" });
  const ids = players.map((p) => p.id);
  const lineup = { back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) };
  const at = (s: number) => new Date(Date.now() - 60_000 + s * 1000).toISOString();
  const { error } = await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup }, created_by: ownerId, created_at: at(0) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1 }, created_by: ownerId, created_at: at(1) },
  ]);
  if (error) throw new Error(`seed: ${error.message}`);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  return { admin, team, game, players };
}

const goals = async (admin: Admin, gameId: string) =>
  (await admin.from("game_events").select("player_id").eq("game_id", gameId).eq("type", "goal")).data ?? [];

test("a tap as the scorer sheet opens records nobody; a tap once it's settled records the kid", async ({ page }) => {
  const { admin, team, game, players } = await aflInQ1();
  await skipHints(page);
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const plusG = page.getByRole("button", { name: `Add goal, ${team.name}` }).first();
  await expect(plusG).toBeVisible({ timeout: 15_000 });

  // Where a kid's row sits once the sheet has settled: the fifth kid,
  // with rows above it to land on while the sheet rises.
  const sheet = page.getByRole("dialog").filter({ hasText: /who scored/i });
  await plusG.click();
  await expect(sheet).toBeVisible();
  const target = players[4];
  const row = sheet.getByRole("button", { name: new RegExp(`^${target.full_name}`) });
  await expect(row).toBeVisible();
  await page.waitForTimeout(600);
  const box = (await row.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();
  await page.waitForTimeout(600);

  // + GOAL, then taps at that point at once, as a quick thumb's are,
  // through the first moments of the slide.
  await plusG.click();
  const start = Date.now();
  while (Date.now() - start < 160) {
    await page.mouse.click(x, y);
  }
  await page.waitForTimeout(800);
  // Nothing recorded, and the sheet's still asking.
  expect(await goals(admin, game.id)).toHaveLength(0);
  await expect(sheet).toBeVisible();

  // Settled, the same tap is the kid's goal.
  await page.mouse.click(x, y);
  await expect.poll(async () => (await goals(admin, game.id)).map((g) => g.player_id), { timeout: 10_000 }).toEqual([target.id]);
});
