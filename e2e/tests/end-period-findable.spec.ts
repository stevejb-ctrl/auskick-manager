// ─── Ending the period, where a parent looks ─────────────────
// Stagehand round 9 (9 Nov 2026): in about fourteen runs, parents
// couldn't find how to end a quarter or half ("no end-half control").
// The only way was tapping the clock. Now, in every sport:
//
//   - ⋯ (the game menu) has "End Q1" / "End 1st half" while the period's
//     in play. It opens the same confirm the clock sheet's row does
//     (ManualEndQuarterConfirm), so a stray tap ends nothing.
//   - Once the period's time is up and it's waiting on the coach
//     (basketball and touch wait at 0:00), the info line says "Time's up:
//     end 1st half", and tapping it opens that confirm.
//
// Covers: LiveGameMenu's endPeriod row, InfoLine's timeUp prompt,
// lib/sports/words endPeriodWords, and each sport's live game wiring.

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { ownerOf, skipHints } from "../helpers/a11y";
import { waitForHydration } from "../helpers/navigation";
import { openGameMenu } from "../helpers/liveShell";

test.describe.configure({ mode: "parallel" });

type Admin = ReturnType<typeof createAdminClient>;
type Sport = "afl" | "netball" | "soccer" | "basketball" | "rugby_league" | "touch";

const SEEDS: Record<Sport, { age: string; count: number; lineup: (ids: string[]) => Record<string, unknown> }> = {
  afl: { age: "U10", count: 15, lineup: (ids) => ({ back: ids.slice(0, 4), hback: [], mid: ids.slice(4, 8), hfwd: [], fwd: ids.slice(8, 12), bench: ids.slice(12) }) },
  netball: { age: "11u", count: 9, lineup: (ids) => ({ positions: Object.fromEntries(["gs", "ga", "wa", "c", "wd", "gd", "gk"].map((k, i) => [k, [ids[i]]])), bench: ids.slice(7) }) },
  soccer: { age: "U12", count: 12, lineup: (ids) => ({ keeper: ids[0], lines: { def: ids.slice(1, 4), mid: ids.slice(4, 7), att: ids.slice(7, 9), field: [] }, bench: ids.slice(9) }) },
  basketball: { age: "U12", count: 7, lineup: (ids) => ({ lines: { guard: ids.slice(0, 2), forward: ids.slice(2, 5), court: [] }, bench: ids.slice(5) }) },
  rugby_league: { age: "U8", count: 11, lineup: (ids) => ({ forwards: ids.slice(0, 3), backs: ids.slice(3, 8), bench: ids.slice(8) }) },
  touch: { age: "U12", count: 9, lineup: (ids) => ({ lines: { middle: [], link: [], wing: [], field: ids.slice(0, 6) }, bench: ids.slice(6) }) },
};

/** A game `secs` into its first period, on the coach's own screen. */
async function inFirstPeriod(sport: Sport, secs = 60) {
  const admin = createAdminClient();
  const ownerId = await ownerOf(admin);
  const cfg = SEEDS[sport];
  const team = await makeTeam(admin, { ownerId, sport, ageGroup: cfg.age, name: `End ${sport} ${Date.now() % 100000}` });
  await admin.from("teams").update({ track_scoring: true }).eq("id", team.id);
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: cfg.count });
  const game = await makeGame(admin, { teamId: team.id, ownerId, opponent: "Sharks" });
  const ids = players.map((p) => p.id);
  const at = (s: number) => new Date(Date.now() - secs * 1000 + s * 1000).toISOString();
  const { error } = await admin.from("game_events").insert([
    { game_id: game.id, type: "lineup_set", metadata: { lineup: cfg.lineup(ids), sport }, created_by: ownerId, created_at: at(-1) },
    { game_id: game.id, type: "quarter_start", metadata: { quarter: 1, sport }, created_by: ownerId, created_at: at(0) },
  ]);
  if (error) throw new Error(`seed: ${error.message}`);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  return { admin, team, game };
}

async function openLive(page: Page, teamId: string, gameId: string) {
  await skipHints(page);
  await page.goto(`/teams/${teamId}/games/${gameId}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /^clock — /i }).first()).toBeVisible({ timeout: 15_000 });
}

const periodEnds = async (admin: Admin, gameId: string) =>
  (await admin.from("game_events").select("id").eq("game_id", gameId).eq("type", "quarter_end")).data?.length ?? 0;

/** The end confirm: "End Q1 now?", and its "End Q1" button. */
async function confirmEnd(page: Page, abbr: string) {
  const confirm = page.getByRole("dialog", { name: `End ${abbr} now?` });
  await expect(confirm).toBeVisible({ timeout: 10_000 });
  await confirm.getByRole("button", { name: `End ${abbr}`, exact: true }).click();
}

const MENU: { sport: Sport; row: string; abbr: string }[] = [
  { sport: "afl", row: "End Q1", abbr: "Q1" },
  { sport: "netball", row: "End Q1", abbr: "Q1" },
  { sport: "soccer", row: "End 1st half", abbr: "H1" },
  { sport: "basketball", row: "End 1st half", abbr: "H1" },
  { sport: "rugby_league", row: "End Q1", abbr: "Q1" },
  { sport: "touch", row: "End 1st half", abbr: "H1" },
];

for (const { sport, row, abbr } of MENU) {
  test(`${sport}: ⋯ has "${row}", behind the end confirm`, async ({ page }) => {
    const { admin, team, game } = await inFirstPeriod(sport);
    await openLive(page, team.id, game.id);

    const menu = await openGameMenu(page);
    const end = menu.getByRole("button", { name: row, exact: true });
    await expect(end).toBeVisible();
    // It says what it's for, and that there's a confirm.
    await expect(menu).toContainText("You'll confirm first.");

    // Cancel on the confirm ends nothing.
    await end.click();
    const confirm = page.getByRole("dialog", { name: `End ${abbr} now?` });
    await expect(confirm).toBeVisible({ timeout: 10_000 });
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toBeHidden();
    expect(await periodEnds(admin, game.id)).toBe(0);

    // Confirmed, the period ends.
    await (await openGameMenu(page)).getByRole("button", { name: row, exact: true }).click();
    await confirmEnd(page, abbr);
    await expect.poll(() => periodEnds(admin, game.id), { timeout: 15_000 }).toBe(1);
  });
}

// Basketball and touch don't end themselves at 0:00: the period waits
// for the coach. The info line says so, and ends it from there.
for (const sport of ["basketball", "touch"] as const) {
  test(`${sport}: at 0:00 the info line says "Time's up: end 1st half"`, async ({ page }) => {
    // U12's halves are 20 minutes: a minute past.
    const { admin, team, game } = await inFirstPeriod(sport, 21 * 60);
    await openLive(page, team.id, game.id);

    const prompt = page.getByTestId("info-line-time-up");
    await expect(prompt).toBeVisible({ timeout: 15_000 });
    await expect(prompt).toHaveAccessibleName("Time's up: end 1st half");
    // ⋯ says the same.
    const menu = await openGameMenu(page);
    await expect(menu.getByRole("button", { name: "End 1st half", exact: true })).toBeVisible();
    await expect(menu).toContainText("Time's up. You'll confirm first.");
    await menu.getByRole("button", { name: "Cancel" }).click();
    await expect(menu).toBeHidden();

    await prompt.click();
    await confirmEnd(page, "H1");
    await expect.poll(() => periodEnds(admin, game.id), { timeout: 15_000 }).toBe(1);
  });
}
