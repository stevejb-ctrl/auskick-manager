import { describe, expect, it } from "vitest";
import { aggregateSoccerSeason } from "@/lib/dashboard/soccerAggregators";
import type { GameEvent } from "@/lib/types";

let seq = 0;
function ev(gameId: string, type: string, metadata: Record<string, unknown>, playerId: string | null = null): GameEvent {
  seq++;
  return {
    id: `e${seq}`,
    game_id: gameId,
    type,
    player_id: playerId,
    metadata,
    created_by: null,
    created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, seq)).toISOString(),
  } as GameEvent;
}

const HALF = 20 * 60_000;

/** One 2×20 game: keeper `gk`, the other two of a, b and k outfield, `c` on the bench. */
function game(id: string, gk: string, ours: (string | null)[], theirs: number): GameEvent[] {
  const [def, mid] = ["a", "b", "k"].filter((p) => p !== gk);
  const lineup = { keeper: gk, lines: { def: [def], mid: [mid], att: [], field: [] }, bench: ["c"] };
  return [
    ev(id, "lineup_set", { lineup }),
    ev(id, "quarter_start", { quarter: 1 }),
    ...ours.map((p) => ev(id, "goal", { quarter: 1, elapsed_ms: 60_000 }, p)),
    ...Array.from({ length: theirs }, () => ev(id, "opponent_goal", { quarter: 1, elapsed_ms: 90_000 })),
    ev(id, "quarter_end", { quarter: 1, elapsed_ms: HALF }),
    ev(id, "quarter_start", { quarter: 2 }),
    ev(id, "quarter_end", { quarter: 2, elapsed_ms: HALF }),
    ev(id, "game_finalised", { quarter: 2, elapsed_ms: HALF }),
  ];
}

describe("aggregateSoccerSeason", () => {
  const events = new Map([
    ["g1", game("g1", "k", ["a", "a", null], 1)],
    ["g2", game("g2", "a", ["b"], 1)],
  ]);
  const agg = aggregateSoccerSeason([{ id: "g1" }, { id: "g2" }], events);

  it("adds up the results and goals both ways", () => {
    expect(agg.totals).toEqual({ games: 2, goalsFor: 4, goalsAgainst: 2, wins: 1, draws: 1, losses: 0 });
  });

  it("credits each kid's minutes, goals and time in goal", () => {
    expect(agg.perPlayer.a).toMatchObject({ gamesPlayed: 2, goals: 2, keeperMs: 2 * HALF, keeperGames: 1, ms: 4 * HALF });
    // k kept goal in g1 and played outfield in g2.
    expect(agg.perPlayer.k).toMatchObject({ gamesPlayed: 2, keeperMs: 2 * HALF, keeperGames: 1, ms: 4 * HALF });
    expect(agg.perPlayer.b).toMatchObject({ gamesPlayed: 2, goals: 1, keeperMs: 0 });
  });

  it("lists a kid who came but never got on, at 0 (UX round 2, 24 Oct 2026)", () => {
    // Ethan was here and didn't get on: the coach needs to see him.
    expect(agg.perPlayer.c).toMatchObject({ gamesPlayed: 0, ms: 0, goals: 0 });
  });

  it("keeps goals nobody was named for, so the goals add up (UX round 2)", () => {
    expect(agg.noScorer).toEqual({ goals: 1 });
    const named = Object.values(agg.perPlayer).reduce((s, r) => s + r.goals, 0);
    expect(named + agg.noScorer.goals).toBe(agg.totals.goalsFor);
  });
});
