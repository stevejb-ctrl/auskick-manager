// AFL's quarter-by-quarter stats compared goals only, so a quarter won
// 1.1 (7) to 1.0 (6) read as lost, and a quarter nobody scored in was
// left out (UX audit, 23 Oct 2026). Quarters compare on points, and
// every quarter played counts.

import { describe, expect, it } from "vitest";
import { replayGame } from "../eventReplay";
import { computeQuarterScoring } from "../aggregators";
import type { GameEvent } from "@/lib/types";

let seq = 0;
function ev(type: GameEvent["type"], metadata: Record<string, unknown> = {}, player_id: string | null = null): GameEvent {
  return {
    id: `e${++seq}`,
    game_id: "g1",
    type,
    player_id,
    metadata,
    created_by: null,
    created_at: new Date(1_700_000_000_000 + seq).toISOString(),
  };
}

const Q = 12 * 60_000;
const quarter = (q: number, between: GameEvent[]) => [
  ev("quarter_start", { quarter: q }),
  ...between,
  ev("quarter_end", { quarter: q, elapsed_ms: Q }),
];

function snapshot(gameId: string, events: GameEvent[]) {
  return replayGame(gameId, [ev("lineup_set", { lineup: { back: ["a"], hback: [], mid: [], hfwd: [], fwd: [], bench: [] } }), ...events], Q);
}

describe("computeQuarterScoring", () => {
  it("calls a quarter on points, and counts quarters nobody scored in", () => {
    const rows = computeQuarterScoring([
      snapshot("g1", [
        ...quarter(1, [ev("goal", { quarter: 1 }, "a"), ev("behind", { quarter: 1 }, "a"), ev("opponent_goal", { quarter: 1 })]),
        ...quarter(2, []),
        ...quarter(3, [ev("opponent_behind", { quarter: 3 })]),
        ...quarter(4, []),
      ]),
    ]);
    expect(rows.map((r) => [r.quarter, r.avgPointsFor, r.avgPointsAgainst, r.result, r.gamesCount])).toEqual([
      [1, 7, 6, "ahead", 1],
      [2, 0, 0, "level", 1],
      [3, 0, 1, "behind", 1],
      [4, 0, 0, "level", 1],
    ]);
  });

  it("averages a scoreless quarter in, over every game that kept score", () => {
    const rows = computeQuarterScoring([
      snapshot("g1", [...quarter(1, [ev("goal", { quarter: 1 }, "a")]), ...quarter(2, [])]),
      snapshot("g2", [...quarter(1, []), ...quarter(2, [ev("opponent_goal", { quarter: 2 })])]),
      // A game with no score recorded (scoring off) says nothing about quarters.
      snapshot("g3", [...quarter(1, []), ...quarter(2, [])]),
    ]);
    expect(rows.map((r) => [r.quarter, r.avgPointsFor, r.avgPointsAgainst, r.gamesCount])).toEqual([
      [1, 3, 0, 2],
      [2, 0, 3, 2],
    ]);
  });
});
