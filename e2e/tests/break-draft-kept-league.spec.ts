// ─── Guard: a swap made at the break survives leaving the live screen (rugby league) ───
//
// Stagehand round 5 found AFL and netball threw away the lineup staged
// at a break when the coach left the live screen. League has no staged
// break draft: a swap at the break is saved as it's made (a `swap`
// event), so it must already survive the team page and back. This spec
// keeps it that way alongside its AFL and netball siblings.
//
// Covers:
//   - src/components/league/LeagueLiveGame.tsx (break swaps + Start)

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { replayLeagueGame } from "../../src/lib/sports/rugby_league/fairness";
import type { GameEvent } from "../../src/lib/types";
import { pickBreakStrategy, startFromBreak } from "../helpers/break";

test.describe.configure({ mode: "parallel" });


/**
 * The coach's way out and back, all in the app: Exit to the game page,
 * the Today tab (the team page), then "Back to live game".
 */
async function viaTeamPage(page: Page, teamId: string): Promise<void> {
  await page.getByRole("button", { name: "Exit live game" }).click();
  await page
    .getByRole("navigation", { name: "Team sections" })
    .getByRole("link", { name: "Today" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/teams/${teamId}$`), { timeout: 15_000 });
  await page.getByRole("link", { name: /back to live game/i }).click();
}

async function reachBreak(page: Page): Promise<void> {
  // The shared break screen: no start modal on arrival any more.
  await expect(page.getByRole("heading", { name: /^2nd half lineup$/i })).toBeVisible({ timeout: 15_000 });
}

test("rugby league: a swap made at the break is still there after the team page and back, and starts H2", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const admin = createAdminClient();
  const { data: superAdmin } = await admin.auth.admin.listUsers();
  const ownerId = superAdmin.users.find(
    (u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL,
  )!.id;

  const team = await makeTeam(admin, {
    ownerId,
    ageGroup: "U10",
    sport: "rugby_league",
    name: `RL-BRK-KEPT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: 13, ageGroup: "U10" });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  const onFieldSize = 11;
  await admin.from("games").update({ on_field_size: onFieldSize }).eq("id", game.id);
  const fieldIds = players.slice(0, onFieldSize).map((p) => p.id);
  const lineup = {
    forwards: fieldIds.slice(0, 5),
    backs: fieldIds.slice(5),
    bench: players.slice(onFieldSize).map((p) => p.id),
  };
  const aMomentAgo = new Date(Date.now() - 13 * 60_000).toISOString();
  await admin.from("game_events").insert([
    {
      game_id: game.id,
      type: "lineup_set",
      metadata: { lineup, sport: "rugby_league" },
      created_by: ownerId,
      created_at: aMomentAgo,
    },
    {
      game_id: game.id,
      type: "quarter_start",
      metadata: { quarter: 1, sport: "rugby_league" },
      created_by: ownerId,
      created_at: aMomentAgo,
    },
    {
      game_id: game.id,
      type: "quarter_end",
      metadata: { quarter: 1, elapsed_ms: 12 * 60_000, sport: "rugby_league" },
      created_by: ownerId,
      created_at: new Date(Date.now() - 60_000).toISOString(),
    },
  ]);
  await admin.from("game_availability").upsert(
    players.map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available",
      updated_by: ownerId,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "game_id,player_id" },
  );
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);

  const comingOn = lineup.bench[0];
  const goingOff = lineup.forwards[0];
  const field = page.getByRole("group", { name: /^(Forwards|Backs)$/ });
  const bench = page.getByRole("group", { name: "Bench", exact: true });
  const tile = (id: string) => page.getByTestId(`player-tile-${id}`);
  const eventsOf = async () => {
    const { data } = await admin
      .from("game_events")
      .select("*")
      .eq("game_id", game.id)
      .order("created_at", { ascending: true });
    return (data ?? []) as GameEvent[];
  };

  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await reachBreak(page);

  // Keep last half's field, then swap a bench kid on for a forward. The
  // swap is staged (the break's draft), not saved as an event.
  await pickBreakStrategy(page, "Repeat");
  await tile(comingOn).click();
  await tile(goingOff).click();
  await expect(field.getByTestId(`player-tile-${comingOn}`)).toBeVisible({ timeout: 10_000 });
  await expect(bench.getByTestId(`player-tile-${goingOff}`)).toBeVisible();
  expect((await eventsOf()).some((e) => e.type === "swap")).toBe(false);

  // Off to the team page, then back to the live game.
  await viaTeamPage(page, team.id);
  await reachBreak(page);

  // The swap is still in place.
  await expect(field.getByTestId(`player-tile-${comingOn}`)).toBeVisible({ timeout: 10_000 });
  await expect(bench.getByTestId(`player-tile-${goingOff}`)).toBeVisible();
  await expect(page.getByRole("radio", { name: "Repeat" })).toBeChecked();

  // Start H2: the second half begins with the swap.
  await startFromBreak(page, /^start 2nd half/i);
  let events: GameEvent[] = [];
  await expect
    .poll(
      async () => {
        events = await eventsOf();
        return events.some(
          (e) => e.type === "quarter_start" && (e.metadata as { quarter?: number }).quarter === 2,
        );
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  const h2 = replayLeagueGame(events).lineup!;
  expect(h2.forwards).toContain(comingOn);
  expect(h2.bench).toContain(goingOff);
});
