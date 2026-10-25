// The finished game's page, every sport (UX audit, 23 Oct 2026).
//
// 1. Only AFL and netball rendered the full-time summary here, so the
//    other eight sports' game page had no score or game time, and the
//    dashboard's "Last result" link to #summary went nowhere.
// 2. How we played held every kid to the game-time floor over the whole
//    game: an injured, fouled-out, lent or late kid read "played under
//    50%" ("1 rule missed") in every sport.
// 3. Oztag's share text named only the scored tries, so a girl's try with
//    no scorer went missing ("5 def 1 · Tries: Chloe, Mason").
//
// Covers: src/app/(app)/teams/[teamId]/games/[gameId]/page.tsx (#summary)
//         src/lib/playbook/gameReport.ts + awayTime.ts (How we played)
//         src/lib/sports/touch/summary.ts (tries with no scorer)

import { test, expect, type Page } from "@playwright/test";
import { finishedGame, fullTime, playPeriod, type SeedRow } from "../helpers/finished-game";
import type { SportId } from "../../src/lib/sports";

test.describe.configure({ mode: "parallel" });

/** One period of play with `between` in it, then full time. */
const period = (between: SeedRow[], ms = 600_000): SeedRow[] => [...playPeriod(1, between, ms), fullTime];

const SCORES: { sport: SportId; ours: string; theirs: string }[] = [
  { sport: "rugby_league", ours: "try", theirs: "opponent_try" },
  { sport: "rugby_union", ours: "try", theirs: "opponent_try" },
  { sport: "soccer", ours: "goal", theirs: "opponent_goal" },
  { sport: "futsal", ours: "goal", theirs: "opponent_goal" },
  { sport: "hockey", ours: "goal", theirs: "opponent_goal" },
  { sport: "basketball", ours: "three_pointer", theirs: "opponent_two_pointer" },
  { sport: "touch", ours: "try", theirs: "opponent_try" },
  { sport: "oztag", ours: "try", theirs: "opponent_try" },
];

for (const { sport, ours, theirs } of SCORES) {
  test(`${sport}: the finished game's page shows the full-time summary`, async ({ page }) => {
    const { team, game, players, name } = await finishedGame(sport, 3, (ids) =>
      period([
        { type: ours, player_id: ids[0], metadata: { quarter: 1, elapsed_ms: 60_000 } },
        { type: theirs, metadata: { quarter: 1, elapsed_ms: 120_000 } },
        { type: ours, player_id: ids[1], metadata: { quarter: 1, elapsed_ms: 180_000 } },
      ]),
    );
    await page.goto(`/teams/${team.id}/games/${game.id}`);
    const summary = page.locator("#summary");
    await expect(summary).toContainText(`${name}`, { timeout: 15_000 });
    await expect(summary).toContainText(" def Test Opponent");
    await expect(summary).toContainText(players[0].full_name.split(" ")[0]);
    // The hero's one job on a finished game: straight to it.
    await expect(page.getByRole("link", { name: /^summary$/i })).toHaveAttribute("href", "#summary");
  });
}

test("hockey: the dashboard's Last result opens the game's summary", async ({ page }) => {
  const { team, game, name } = await finishedGame("hockey", 3, (ids) =>
    period([{ type: "goal", player_id: ids[0], metadata: { quarter: 1, elapsed_ms: 60_000 } }]),
  );
  await page.goto(`/teams/${team.id}`);
  await page.getByRole("region", { name: /last result/i }).getByRole("link").click({ timeout: 15_000 });
  await expect(page).toHaveURL(new RegExp(`/games/${game.id}#summary$`));
  await expect(page.locator("#summary")).toBeInViewport({ timeout: 15_000 });
  await expect(page.locator("#summary")).toContainText(`${name} 1 def Test Opponent 0`);
});

/** The How we played card's first line, the game-time floor. */
async function gameTimeLine(page: Page) {
  const card = page.getByTestId("how-we-played");
  await expect(card).toBeVisible({ timeout: 15_000 });
  return card.getByRole("listitem").first();
}

test("AFL: an injured kid and a late arrival aren't 'under 50%'", async ({ page }) => {
  // Mia is hurt a minute in; Zoe arrives with two minutes left and goes on.
  const { team, game, players } = await finishedGame("afl", 4, ([mia, ben, cal, zoe]) =>
    [
      { type: "lineup_set", metadata: { lineup: { back: [mia], hback: [], mid: [ben], hfwd: [], fwd: [cal], bench: [] } } },
      ...period(
        [
          { type: "injury", player_id: mia, metadata: { injured: true, quarter: 1, elapsed_ms: 60_000 } },
          { type: "player_arrived", player_id: zoe, metadata: { quarter: 1, elapsed_ms: 600_000 } },
          { type: "swap", metadata: { off_player_id: ben, on_player_id: zoe, zone: "mid", quarter: 1, elapsed_ms: 600_000 } },
        ],
        720_000,
      ),
    ],
  );
  await page.goto(`/teams/${team.id}/games/${game.id}`);
  const line = await gameTimeLine(page);
  await expect(line).toHaveText(/Everyone played at least \d+% of the time they could play/);
  await expect(page.getByTestId("how-we-played")).not.toContainText(players[0].full_name);
  await expect(page.getByTestId("how-we-played")).not.toContainText(players[3].full_name);
});

test("basketball: a fouled-out kid isn't 'under 50%'", async ({ page }) => {
  const { team, game, players } = await finishedGame("basketball", 5, ([kai, b, c, d, e]) => [
    { type: "lineup_set", metadata: { lineup: { lines: { guard: [kai, b], forward: [c, d, e], court: [] }, bench: [] } } },
    ...period([{ type: "injury", player_id: kai, metadata: { injured: true, reason: "fouled_out", quarter: 1, elapsed_ms: 60_000 } }]),
  ]);
  await page.goto(`/teams/${team.id}/games/${game.id}`);
  const line = await gameTimeLine(page);
  await expect(line).toHaveText(/Everyone played at least \d+% of the time they could play/);
  await expect(page.getByTestId("how-we-played")).not.toContainText(players[0].full_name);
});

test("soccer: a kid lent to the other team isn't 'under 50%'", async ({ page }) => {
  const { team, game, players } = await finishedGame("soccer", 4, ([gk, a, b, ava]) => [
    { type: "lineup_set", metadata: { lineup: { keeper: gk, lines: { def: [a], mid: [b], att: [ava], field: [] }, bench: [] } } },
    ...period([{ type: "player_loan", player_id: ava, metadata: { loaned: true, quarter: 1, elapsed_ms: 60_000 } }]),
  ]);
  await page.goto(`/teams/${team.id}/games/${game.id}`);
  const line = await gameTimeLine(page);
  await expect(line).toHaveText(/Everyone played at least \d+% of the time they could play/);
  await expect(page.getByTestId("how-we-played")).not.toContainText(players[3].full_name);
});

test("Oztag: a girl's try with no scorer is in the summary", async ({ page }) => {
  // 1 + 1 + 2 = 4: two named tries and a girl's try nobody was named for.
  const { team, game, players, name } = await finishedGame("oztag", 3, ([chloe, mason]) =>
    period([
      { type: "try", player_id: chloe, metadata: { quarter: 1, elapsed_ms: 60_000 } },
      { type: "try", player_id: mason, metadata: { quarter: 1, elapsed_ms: 120_000 } },
      { type: "girls_try", metadata: { quarter: 1, elapsed_ms: 180_000 } },
      { type: "opponent_try", metadata: { quarter: 1, elapsed_ms: 240_000 } },
    ]),
  );
  await page.goto(`/teams/${team.id}/games/${game.id}`);
  const summary = page.locator("#touch-game-summary-text");
  await expect(summary).toContainText(`${name} 4 def Test Opponent 1`, { timeout: 15_000 });
  await expect(summary).toContainText(
    `Tries: ${players[0].full_name.split(" ")[0]} (#1), ${players[1].full_name.split(" ")[0]} (#2), +1 try (no scorer)`,
  );
});

// Round 2 usability, 24 Oct 2026: How we played left out two Musts the
// live screen holds the side to. League's Law 6 (a kid on no unbroken
// half read only "played under 50%"), and a mixed team's rule (a half
// played with 5 boys on for three minutes read "Rules kept").

test("league: a kid who never got an unbroken half is named under Law 6", async ({ page }) => {
  // U10, two halves: Cal sat H1 and came on for Ben ten minutes into H2.
  const { team, game, players } = await finishedGame("rugby_league", 3, ([ava, ben, cal]) => [
    { type: "lineup_set", metadata: { lineup: { forwards: [ava], backs: [ben], bench: [cal] } } },
    ...playPeriod(1, [], 1_200_000),
    ...playPeriod(2, [{ type: "swap", metadata: { off_player_id: ben, on_player_id: cal, quarter: 2, elapsed_ms: 600_000 } }], 1_200_000),
    fullTime,
  ]);
  await page.goto(`/teams/${team.id}/games/${game.id}`);
  const card = page.getByTestId("how-we-played");
  await expect(card).toContainText(`${players[2].full_name} didn't get 1 unbroken half (Law 6)`, { timeout: 15_000 });
  await expect(card).not.toContainText(`${players[1].full_name} didn't get`);
});

test("Oztag: a stretch over the boys' cap is a missed rule", async ({ page }) => {
  // At most 4 boys: kids 0–5 boys, 6–9 girls; 8 on. 5:00 a boy on for a
  // girl, 8:10 the girl back on for him.
  const { admin, team, game, players } = await finishedGame("oztag", 10, (k) => [
    { type: "lineup_set", metadata: { lineup: { lines: { middle: [], link: [], wing: [], field: [...k.slice(0, 4), ...k.slice(6)] }, bench: k.slice(4, 6) } } },
    ...playPeriod(
      1,
      [
        { type: "swap", metadata: { off_player_id: k[9], on_player_id: k[4], quarter: 1, elapsed_ms: 300_000 } },
        { type: "swap", metadata: { off_player_id: k[4], on_player_id: k[9], quarter: 1, elapsed_ms: 490_000 } },
      ],
      900_000,
    ),
    ...playPeriod(2, [], 900_000),
    fullTime,
  ]);
  await admin.from("teams").update({ mixed_max_boys: 4, mixed_min_girls: 1, mixed_min_boys: 0 }).eq("id", team.id);
  for (let i = 0; i < players.length; i++) {
    await admin.from("players").update({ mixed_group: i < 6 ? "boy" : "girl" }).eq("id", players[i].id);
  }
  await page.goto(`/teams/${team.id}/games/${game.id}`);
  const card = page.getByTestId("how-we-played");
  await expect(card).toContainText("Mixed rule broken for 3:10 in half 1", { timeout: 15_000 });
  await expect(card).not.toContainText("Rules kept");
});
