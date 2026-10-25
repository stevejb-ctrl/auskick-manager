// League stats' "§6 — unbroken-period shortfalls" listed Tyler, hurt at
// 6:48 of the first half (UX round 2, 24 Oct 2026). How we played
// exempts a kid who couldn't play all game (hurt, late, lent), and so
// must the season table.

import { describe, expect, it } from "vitest";
import { aggregateLeagueSeasonFromGames } from "@/lib/dashboard/leagueAggregators";
import type { Game, GameEvent } from "@/lib/types";

let n = 0;
function ev(type: string, metadata: Record<string, unknown> = {}, playerId: string | null = null): GameEvent {
  n++;
  return {
    id: `e${n}`,
    game_id: "g1",
    type,
    player_id: playerId,
    metadata,
    created_by: "u",
    created_at: new Date(Date.UTC(2026, 9, 24, 9, 0, n)).toISOString(),
  } as GameEvent;
}

const HALF = 20 * 60_000;

// U10 plays two halves and owes each kid one unbroken half. Tyler is hurt
// in the first and Dan comes on for him; Eli sits on the bench all game.
const events = [
  ev("lineup_set", { lineup: { forwards: ["tyler", "a"], backs: ["b", "c"], bench: ["dan", "eli"] } }),
  ev("quarter_start", { quarter: 1 }),
  ev("injury", { injured: true, quarter: 1, elapsed_ms: 408_000 }, "tyler"),
  ev("swap", { off_player_id: "tyler", on_player_id: "dan", quarter: 1, elapsed_ms: 408_000 }),
  ev("quarter_end", { quarter: 1, elapsed_ms: HALF }),
  ev("lineup_set", { lineup: { forwards: ["dan", "a"], backs: ["b", "c"], bench: ["tyler", "eli"] } }),
  ev("quarter_start", { quarter: 2 }),
  ev("quarter_end", { quarter: 2, elapsed_ms: HALF }),
  ev("game_finalised", { quarter: 2, elapsed_ms: HALF }),
];

describe("league §6 shortfalls", () => {
  const agg = aggregateLeagueSeasonFromGames([{ id: "g1" } as Game], { g1: events }, "rugby_league", "U10");

  it("leaves out a kid who was hurt", () => {
    expect(agg.perPlayer.tyler.unbrokenShortfallGames).toBe(0);
  });

  it("still lists a kid who could have played and didn't get an unbroken half", () => {
    expect(agg.perPlayer.eli.unbrokenShortfallGames).toBe(1);
    expect(agg.perPlayer.dan.unbrokenCompliantGames).toBe(1);
  });
});
