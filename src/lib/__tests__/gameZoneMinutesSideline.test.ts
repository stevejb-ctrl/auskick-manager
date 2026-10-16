// Season zone minutes (gameZoneMinutes, which feeds the suggester's
// season balance and the season time page) through sideline
// combinations. It was a second, older replay that missed a mid-quarter
// zone switch and double-credited a kid in the cases replayGame was
// fixed for (sideline combos); it now reads replayGame.

import { describe, expect, it } from "vitest";
import { gameZoneMinutes } from "@/lib/fairness";
import type { GameEvent, GameEventType } from "@/lib/types";

let n = 0;
const ev = (type: GameEventType, metadata: Record<string, unknown> = {}, playerId: string | null = null): GameEvent => ({
  id: `e${++n}`,
  game_id: "g1",
  type,
  player_id: playerId,
  metadata,
  created_by: null,
  created_at: new Date(Date.UTC(2026, 9, 10, 9, 0, n)).toISOString(),
});
const MIN = 60_000;
const lineup = (l: Record<string, string[]>) =>
  ev("lineup_set", { lineup: { back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [], ...l } });

describe("season zone minutes through sideline combinations", () => {
  it("a mid-quarter zone switch credits each kid in both zones", () => {
    const zm = gameZoneMinutes([
      lineup({ back: ["a"], fwd: ["b"] }),
      ev("quarter_start", { quarter: 1 }),
      ev("field_zone_swap", { player_a_id: "a", zone_a: "back", player_b_id: "b", zone_b: "fwd", quarter: 1, elapsed_ms: 6 * MIN }),
      ev("quarter_end", { quarter: 1, elapsed_ms: 12 * MIN }),
    ]);
    // Before: a 12 back, b 12 forward (the switch was ignored).
    expect(zm.a).toMatchObject({ back: 6, fwd: 6 });
    expect(zm.b).toMatchObject({ back: 6, fwd: 6 });
  });

  it("a kid injured and then replaced is credited once", () => {
    const zm = gameZoneMinutes([
      lineup({ mid: ["a"], bench: ["x"] }),
      ev("quarter_start", { quarter: 1 }),
      ev("injury", { injured: true, quarter: 1, elapsed_ms: 5 * MIN }, "a"),
      ev("swap", { off_player_id: "a", on_player_id: "x", zone: "mid", quarter: 1, elapsed_ms: 5 * MIN }),
      ev("quarter_end", { quarter: 1, elapsed_ms: 12 * MIN }),
    ]);
    // Before: a 10 (the swap credited the closed stint again).
    expect(zm.a.mid).toBe(5);
    expect(zm.x.mid).toBe(7);
  });

  it("a swap that lands after the hooter doesn't credit the quarter twice", () => {
    const zm = gameZoneMinutes([
      lineup({ mid: ["a"], bench: ["x"] }),
      ev("quarter_start", { quarter: 1 }),
      ev("quarter_end", { quarter: 1, elapsed_ms: 12 * MIN }),
      ev("swap", { off_player_id: "a", on_player_id: "x", zone: "mid", quarter: 1, elapsed_ms: 12 * MIN }),
    ]);
    // Before: a 24.
    expect(zm.a.mid).toBe(12);
  });
});
