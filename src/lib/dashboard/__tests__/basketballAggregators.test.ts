// Basketball's season stats: points, results, minutes, guard and forward
// time, fouls and foul-outs, from each finished game's replay.

import { describe, expect, it } from "vitest";
import { aggregateBasketballSeason } from "@/lib/dashboard/basketballAggregators";
import { LINES, MIN, game } from "@/lib/sports/basketball/__tests__/basketballGame";

function finished(score: { ours: number; theirs: number }) {
  const g = game();
  g.lineup({ ...LINES, bench: ["f"] });
  g.start(1);
  for (let i = 0; i < score.ours; i++) g.basket("two_pointer", 1, "a");
  for (let i = 0; i < score.theirs; i++) g.basket("opponent_two_pointer", 1);
  g.foul("c", 2);
  g.end(1, 20);
  return g.events;
}

describe("aggregateBasketballSeason", () => {
  it("adds up points, results, minutes, guard and forward time, and fouls", () => {
    const won = finished({ ours: 3, theirs: 1 });
    const lost = finished({ ours: 0, theirs: 2 });
    const agg = aggregateBasketballSeason([{ id: "g1" }, { id: "g2" }], { g1: won, g2: lost });

    expect(agg.totals).toEqual({ games: 2, pointsFor: 6, pointsAgainst: 6, wins: 1, draws: 0, losses: 1 });
    expect(agg.perPlayer.a).toMatchObject({ gamesPlayed: 2, ms: 40 * MIN, guardMs: 40 * MIN, forwardMs: 0, points: 6 });
    expect(agg.perPlayer.c).toMatchObject({ forwardMs: 40 * MIN, fouls: 2, foulOuts: 0 });
    // f sat on the bench: listed at 0, so the coach sees who missed out
    // (UX round 2, 24 Oct 2026).
    expect(agg.perPlayer.f).toMatchObject({ gamesPlayed: 0, ms: 0, points: 0 });
  });

  it("keeps points nobody was named for, so the points add up (UX round 2)", () => {
    const g = game();
    g.lineup({ ...LINES, bench: ["f"] });
    g.start(1);
    g.basket("three_pointer", 1, "a");
    g.basket("two_pointer", 2, "b");
    g.basket("free_throw", 3);
    g.end(1, 20);
    const agg = aggregateBasketballSeason([{ id: "g1" }], { g1: g.events });
    expect(agg.noScorer).toEqual({ points: 1 });
    const named = Object.values(agg.perPlayer).reduce((s, r) => s + r.points, 0);
    expect(named + agg.noScorer.points).toBe(agg.totals.pointsFor);
  });

  it("counts a foul-out", () => {
    const g = game();
    g.lineup({ ...LINES, bench: ["f"] });
    g.start(1);
    g.foulOut("b", 5);
    g.swap("b", "f", 5);
    g.end(1, 20);
    const agg = aggregateBasketballSeason([{ id: "g1" }], new Map([["g1", g.events]]));
    expect(agg.perPlayer.b).toMatchObject({ gamesPlayed: 1, ms: 5 * MIN, foulOuts: 1 });
    expect(agg.perPlayer.f).toMatchObject({ ms: 15 * MIN, guardMs: 15 * MIN });
    expect(agg.totals.draws).toBe(1);
  });
});
