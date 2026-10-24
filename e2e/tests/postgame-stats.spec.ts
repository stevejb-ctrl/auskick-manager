// Stats after full time (UX audit, 23 Oct 2026).
//
// 1. AFL's quarter-by-quarter scoring compared goals only, so a quarter
//    won 1.1 (7) to 1.0 (6) read as lost, and a quarter nobody scored in
//    was left out.
// 2. Oztag's stats listed each kid's tries (1 + 1) under "Points for 4":
//    a girl's try nobody was named for went missing, and there were no
//    points per kid.
//
// Covers: src/components/dashboard/QuarterScoring.tsx,
//         src/lib/dashboard/aggregators.ts (computeQuarterScoring),
//         src/components/dashboard/TouchDashboardShell.tsx,
//         src/lib/dashboard/touchAggregators.ts

import { test, expect } from "@playwright/test";
import { finishedGame, fullTime, playPeriod } from "../helpers/finished-game";

test.describe.configure({ mode: "parallel" });

test("AFL: a quarter won on a behind reads ahead, and a scoreless quarter is there", async ({ page }) => {
  const { team } = await finishedGame("afl", 3, ([a, b, c]) => [
    { type: "lineup_set", metadata: { lineup: { back: [a], hback: [], mid: [b], hfwd: [], fwd: [c], bench: [] } } },
    ...playPeriod(1, [
      { type: "goal", player_id: c, metadata: { quarter: 1, elapsed_ms: 60_000 } },
      { type: "opponent_goal", metadata: { quarter: 1, elapsed_ms: 120_000 } },
      { type: "behind", player_id: c, metadata: { quarter: 1, elapsed_ms: 180_000 } },
    ]),
    ...playPeriod(2, []),
    ...playPeriod(3, [{ type: "opponent_behind", metadata: { quarter: 3, elapsed_ms: 60_000 } }]),
    fullTime,
  ]);
  await page.goto(`/teams/${team.id}/stats`);
  const q1 = page.getByTestId("quarter-scoring-1");
  await expect(q1).toBeVisible({ timeout: 15_000 });
  await expect(q1).toHaveAttribute("data-result", "ahead");
  await expect(q1).toContainText("ahead");
  // Nobody scored in Q2: it's still a quarter played, level.
  await expect(page.getByTestId("quarter-scoring-2")).toHaveAttribute("data-result", "level");
  await expect(page.getByTestId("quarter-scoring-3")).toHaveAttribute("data-result", "behind");
});

test("Oztag: the kids' points and the tries with no scorer add up to points for", async ({ page }) => {
  const { team, players } = await finishedGame("oztag", 3, ([chloe, mason]) => [
    ...playPeriod(1, [
      { type: "try", player_id: chloe, metadata: { quarter: 1, elapsed_ms: 60_000 } },
      { type: "girls_try", player_id: chloe, metadata: { quarter: 1, elapsed_ms: 90_000 } },
      { type: "try", player_id: mason, metadata: { quarter: 1, elapsed_ms: 120_000 } },
      { type: "girls_try", metadata: { quarter: 1, elapsed_ms: 180_000 } },
    ]),
    fullTime,
  ]);
  await page.goto(`/teams/${team.id}/stats`);
  await expect(page.getByRole("group", { name: "Points for" })).toContainText("6", { timeout: 15_000 });
  const table = page.getByRole("table", { name: "Player stats" });
  await expect(table.getByRole("columnheader", { name: "Pts" })).toBeVisible();
  // Player, GP, Mins, lanes, Tries, Pts.
  const cells = (name: string) => table.getByRole("row").filter({ hasText: name }).getByRole("cell");
  await expect(cells(players[0].full_name).nth(-2)).toHaveText("2");
  await expect(cells(players[0].full_name).last()).toHaveText("3");
  await expect(cells(players[1].full_name).last()).toHaveText("1");
  await expect(cells("No scorer").nth(-2)).toHaveText("1");
  await expect(cells("No scorer").last()).toHaveText("2");
});
