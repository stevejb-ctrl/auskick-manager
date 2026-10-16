// League time on field (playerMsOnField) through sideline combinations,
// found by the sideline-combos walks (__tests__/sideline). It now follows
// the replay: an injured kid stays in their slot but doesn't accrue, a
// lent kid is benched, and a mid-period lineup change starts and stops
// the right kids.

import { describe, expect, it } from "vitest";
import { playerMsOnField } from "@/lib/sports/rugby_league/fairness";
import type { GameEvent, GameEventType } from "@/lib/types";

let n = 0;
const ev = (type: GameEventType, metadata: Record<string, unknown> = {}, playerId: string | null = null): GameEvent => ({
  id: `e${++n}`,
  game_id: "g1",
  type,
  player_id: playerId,
  metadata: { sport: "rugby_league", ...metadata },
  created_by: null,
  created_at: new Date(Date.UTC(2026, 9, 10, 9, 0, n)).toISOString(),
});
const P = 20 * 60_000;
const kickoff = () => [
  ev("lineup_set", { lineup: { forwards: ["a", "b"], backs: ["c", "d"], bench: ["x"] } }),
  ev("quarter_start", { quarter: 1 }),
];

describe("league time on field through sideline combinations", () => {
  it("an injured kid who recovers on the field starts accruing again", () => {
    const ms = playerMsOnField(
      [...kickoff(), ev("injury", { injured: true, quarter: 1, elapsed_ms: 300_000 }, "a"), ev("injury", { injured: false, quarter: 1, elapsed_ms: 400_000 }, "a"), ev("quarter_end", { quarter: 1, elapsed_ms: P })],
      1,
      P,
    );
    // Before: stuck at 300k (the clock never restarted).
    expect(ms.a).toBe(300_000 + (P - 400_000));
  });

  it("a kid lent mid-period (no swap) isn't credited the next period", () => {
    const ms = playerMsOnField(
      [
        ...kickoff(),
        ev("player_loan", { loaned: true, quarter: 1, elapsed_ms: 600_000 }, "b"),
        ev("quarter_end", { quarter: 1, elapsed_ms: P }),
        // Nothing else changed, so the break writes no lineup.
        ev("quarter_start", { quarter: 2 }),
        ev("quarter_end", { quarter: 2, elapsed_ms: P }),
      ],
      2,
      P,
    );
    // Before: b was back on the field for all of period 2 while lent.
    expect(ms.b).toBe(600_000);
  });

  it("a kid filling an empty spot mid-period is credited from then", () => {
    const ms = playerMsOnField(
      [
        ...kickoff(),
        ev("player_loan", { loaned: true, quarter: 1, elapsed_ms: 300_000 }, "d"),
        ev("lineup_set", { lineup: { forwards: ["a", "b"], backs: ["c", "x"], bench: ["d"] }, quarter: 1, elapsed_ms: 500_000 }),
        ev("quarter_end", { quarter: 1, elapsed_ms: P }),
      ],
      1,
      P,
    );
    // Before: x got nothing (a mid-period lineup_set opened no stint).
    expect(ms.x).toBe(P - 500_000);
    expect(ms.d).toBe(300_000);
  });
});
