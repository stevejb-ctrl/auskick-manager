// The game page's scorer card, per sport (cross-sport audit, 14 Oct
// 2026). It tallied raw "goal" / "behind" rows, so an undone goal still
// counted, and league — tries, conversions, penalty and field goals —
// never had a card. Each sport's own replay (which honours score_undo)
// now feeds it, in that sport's words.

import { describe, expect, it } from "vitest";
import { scorersFromEvents } from "@/lib/results";
import type { GameEvent } from "@/lib/types";

let n = 0;
function ev(type: string, player_id: string | null = null, metadata: Record<string, unknown> = {}): GameEvent {
  n++;
  return {
    id: `e${n}`,
    game_id: "g1",
    type,
    player_id,
    metadata,
    created_at: new Date(2026, 0, 1, 12, 0, n).toISOString(),
    created_by: "u1",
  } as GameEvent;
}

describe("scorersFromEvents", () => {
  it("AFL: goals and behinds, an undone goal doesn't count", () => {
    const rows = scorersFromEvents("afl", [
      ev("quarter_start", null, { quarter: 1 }),
      ev("goal", "p1"),
      ev("goal", "p2"),
      ev("score_undo", "p2", { original_type: "goal", quarter: 1 }),
      ev("behind", "p1"),
    ]);
    expect(rows).toEqual([{ playerId: "p1", detail: "1 g · 1 b", points: 7, showPoints: true }]);
  });

  it("netball: goals only, an undone goal doesn't count", () => {
    const rows = scorersFromEvents("netball", [
      ev("quarter_start", null, { quarter: 1 }),
      ev("goal", "gs"),
      ev("goal", "gs"),
      ev("goal", "ga"),
      ev("score_undo"),
    ]);
    expect(rows).toEqual([{ playerId: "gs", detail: "2 goals", points: 2, showPoints: false }]);
  });

  it("league: tries, made conversions and goals; a missed kick isn't a score", () => {
    const rows = scorersFromEvents("rugby_league", [
      ev("quarter_start", null, { quarter: 1 }),
      ev("try", "p1"),
      ev("conversion_attempt", "p2", { made: true }),
      ev("try", "p3"),
      ev("conversion_attempt", "p2", { made: false }),
      ev("try", "p3"),
      ev("score_undo"),
      ev("field_goal", "p2"),
    ]);
    // Most points first; ties in player order.
    expect(rows).toEqual([
      { playerId: "p1", detail: "1T", points: 4, showPoints: true },
      { playerId: "p3", detail: "1T", points: 4, showPoints: true },
      { playerId: "p2", detail: "1C · 1FG", points: 3, showPoints: true },
    ]);
  });
});
