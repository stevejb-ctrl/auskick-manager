// ─── Football (soccer) sideline combos ──────────────────────────
// The keeper and the half-time plan, on a seeded U8 (7 a side) game:
//   - the keeper is hurt mid-half and a bench kid goes in goal;
//   - "Swap keeper" puts a field player in goal (they trade places);
//   - a kid who turns up at half-time, after the coach has edited the
//     plan, still plays the second half (the kept plan used to drop
//     them from the game at Start).

import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../fixtures/supabase";
import { makeTeam, makePlayers, makeGame } from "../fixtures/factories";
import { waitForHydration } from "../helpers/navigation";
import type { GameEvent } from "../../src/lib/types";
import { closeGameSettings, openGameSettings, startFromBreak } from "../helpers/break";

interface Seeded {
  team: { id: string };
  game: { id: string };
  players: { id: string; full_name: string }[];
}

/**
 * A soccer U8 game with a kick-off lineup (keeper p0; 2-3-1 from p1–p6;
 * p7 on the bench), H1 started `startedMinutesAgo` ago, and H1 ended
 * when `ended`. `available` kids are marked here; the rest aren't.
 */
async function soccerGame(
  admin: SupabaseClient,
  opts: { count: number; available: number; name: string; ended?: boolean; startedMinutesAgo?: number },
): Promise<Seeded> {
  const { data: su } = await admin.auth.admin.listUsers();
  const ownerId = su.users.find((u) => u.email === process.env.TEST_SUPER_ADMIN_EMAIL)!.id;
  const team = await makeTeam(admin, {
    ownerId,
    sport: "soccer",
    ageGroup: "U8",
    name: `${opts.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  });
  const players = await makePlayers(admin, { teamId: team.id, ownerId, count: opts.count });
  const game = await makeGame(admin, { teamId: team.id, ownerId });
  await admin.from("game_availability").insert(
    players.slice(0, opts.available).map((p) => ({
      game_id: game.id,
      player_id: p.id,
      status: "available" as const,
      updated_by: ownerId,
    })),
  );
  const ids = players.map((p) => p.id);
  const lineup = {
    keeper: ids[0],
    lines: { def: [ids[1], ids[2]], mid: [ids[3], ids[4], ids[5]], att: [ids[6]], field: [] },
    bench: ids.slice(7, opts.available),
  };
  const ago = (opts.startedMinutesAgo ?? 3) * 60_000;
  const at = (offsetMs: number) => new Date(Date.now() - ago + offsetMs).toISOString();
  const evs: Record<string, unknown>[] = [
    { type: "lineup_set", metadata: { lineup, sport: "soccer" }, created_at: at(-2000) },
    { type: "quarter_start", metadata: { quarter: 1, sport: "soccer" }, created_at: at(-1000) },
  ];
  if (opts.ended) {
    evs.push({ type: "quarter_end", metadata: { quarter: 1, elapsed_ms: 1_200_000, sport: "soccer" }, created_at: at(0) });
  }
  const { error } = await admin
    .from("game_events")
    .insert(evs.map((e) => ({ ...e, game_id: game.id, created_by: ownerId })));
  if (error) throw new Error(`seed events: ${error.message}`);
  await admin.from("games").update({ status: "in_progress" }).eq("id", game.id);
  return { team, game, players };
}

async function eventsOf(admin: SupabaseClient, gameId: string): Promise<GameEvent[]> {
  const { data } = await admin.from("game_events").select("*").eq("game_id", gameId).order("created_at", { ascending: true });
  return (data ?? []) as GameEvent[];
}

test("soccer: the keeper is hurt mid-half and a bench kid goes in goal", async ({ page }) => {
  const admin = createAdminClient();
  const { team, game, players } = await soccerGame(admin, { count: 8, available: 8, name: "SOC-GKHURT" });
  const [keeper, , , , , , , benchKid] = players;
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const goal = page.getByRole("region", { name: "On field" }).getByRole("group", { name: "Keeper" });
  await expect(goal.getByTestId(`player-tile-${keeper.id}`)).toBeVisible({ timeout: 15_000 });

  await page.getByTestId(`player-tile-${keeper.id}`).click({ delay: 600 });
  await page.getByRole("button", { name: /mark injured/i }).click();
  await page
    .getByRole("dialog", { name: /who comes on at/i })
    .getByRole("button", { name: new RegExp(benchKid.full_name, "i") })
    .click();

  await expect
    .poll(async () => {
      const evs = await eventsOf(admin, game.id);
      return evs.some(
        (e) =>
          e.type === "swap" &&
          (e.metadata as { on_player_id?: string; line?: string }).on_player_id === benchKid.id &&
          (e.metadata as { line?: string }).line === "gk",
      );
    })
    .toBe(true);
  await expect(goal.getByTestId(`player-tile-${benchKid.id}`)).toBeVisible({ timeout: 15_000 });
});

test("soccer: Swap keeper puts a field player in goal, and the keeper takes their place", async ({ page }) => {
  const admin = createAdminClient();
  const { team, game, players } = await soccerGame(admin, { count: 8, available: 8, name: "SOC-GKSWAP" });
  const [keeper, , , mid] = players;
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  const field = page.getByRole("region", { name: "On field" });
  await expect(field.getByRole("group", { name: "Keeper" }).getByTestId(`player-tile-${keeper.id}`)).toBeVisible({
    timeout: 15_000,
  });

  await page.getByTestId(`player-tile-${keeper.id}`).click({ delay: 600 });
  await page.getByRole("button", { name: /replace keeper/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(mid.full_name, "i") }).click();

  await expect(field.getByRole("group", { name: "Keeper" }).getByTestId(`player-tile-${mid.id}`)).toBeVisible({
    timeout: 15_000,
  });
  await expect(field.getByRole("group", { name: "Midfield" }).getByTestId(`player-tile-${keeper.id}`)).toBeVisible();
  const evs = await eventsOf(admin, game.id);
  expect(evs.filter((e) => e.type === "field_zone_swap")).toHaveLength(1);
});

test("soccer at half-time: a kid who turns up after the plan is edited still plays the second half", async ({ page }) => {
  const admin = createAdminClient();
  // 9 kids, 8 here; the 9th turns up at half-time.
  const { team, game, players } = await soccerGame(admin, {
    count: 9,
    available: 8,
    name: "SOC-HTLATE",
    ended: true,
    startedMinutesAgo: 25,
  });
  const late = players[8];
  await page.goto(`/teams/${team.id}/games/${game.id}/live`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /^2nd half lineup$/i })).toBeVisible({ timeout: 15_000 });

  // Edit the plan: the bench kid and a defender trade places.
  const benchTile = page.getByRole("group", { name: "Bench" }).locator("[data-testid^='player-tile-']").first();
  const defTile = page.getByRole("group", { name: "Defence" }).locator("[data-testid^='player-tile-']").first();
  await benchTile.click();
  await defTile.click();

  // The late kid turns up, from the game settings sheet.
  await openGameSettings(page);
  await page.getByRole("button", { name: /add arrived player/i }).click();
  await page
    .getByRole("dialog", { name: /add arrived/i })
    .getByRole("button", { name: new RegExp(late.full_name, "i") })
    .click({ timeout: 5_000 });
  await expect
    .poll(async () => (await eventsOf(admin, game.id)).some((e) => e.type === "player_arrived" && e.player_id === late.id))
    .toBe(true);
  await closeGameSettings(page);
  await expect(page.getByRole("group", { name: "Bench" }).getByTestId(`player-tile-${late.id}`)).toBeVisible({
    timeout: 15_000,
  });

  await startFromBreak(page, /^start 2nd half/i);
  await expect(page.getByRole("button", { name: /^clock — h2, running$/i })).toBeVisible({ timeout: 15_000 });

  const evs = await eventsOf(admin, game.id);
  const h2 = [...evs].reverse().find((e) => e.type === "lineup_set")!.metadata as {
    lineup: { keeper: string; lines: Record<string, string[]>; bench: string[] };
  };
  const everyone = [h2.lineup.keeper, ...Object.values(h2.lineup.lines).flat(), ...h2.lineup.bench];
  expect(everyone).toContain(late.id);
  expect(new Set(everyone).size).toBe(9);
});
