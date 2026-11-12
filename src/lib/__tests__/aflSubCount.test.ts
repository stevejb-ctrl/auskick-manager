// AFL's full-time share text said "5 subs" for a game with 2 (UX audit,
// 23 Oct 2026): it read the live store's tally, which also counts each
// break. The replay counts the swaps in the event log, as the game page
// always has, and both read that.

import { describe, expect, it } from "vitest";
import { replayGame } from "@/lib/fairness";
import type { GameEvent, GameEventType } from "@/lib/types";

let n = 0;
const ev = (type: GameEventType, metadata: Record<string, unknown> = {}, playerId: string | null = null): GameEvent => ({
  id: `e${++n}`,
  game_id: "g1",
  type,
  player_id: playerId,
  metadata,
  created_by: null,
  created_at: new Date(2026, 9, 23, 9, 0, n).toISOString(),
});

const lineup = (fwd: string, bench: string) => ({ lineup: { back: ["a"], hback: [], mid: ["b"], hfwd: [], fwd: [fwd], bench: [bench] } });

describe("replayGame subCount", () => {
  it("counts the swaps, not the breaks' lineups", () => {
    const events: GameEvent[] = [ev("lineup_set", lineup("c", "d"))];
    for (let q = 1; q <= 4; q++) {
      // A new lineup at each break, as the break screen writes.
      if (q > 1) events.push(ev("lineup_set", lineup(q % 2 ? "c" : "d", q % 2 ? "d" : "c")));
      events.push(ev("quarter_start", { quarter: q }));
      if (q === 2) events.push(ev("swap", { off_player_id: "d", on_player_id: "c", zone: "fwd", quarter: 2, elapsed_ms: 60_000 }));
      if (q === 4) events.push(ev("swap", { off_player_id: "a", on_player_id: "d", zone: "back", quarter: 4, elapsed_ms: 60_000 }));
      events.push(ev("quarter_end", { quarter: q, elapsed_ms: 720_000 }));
    }
    events.push(ev("game_finalised"));
    expect(replayGame(events).subCount).toBe(2);
  });

  it("a batch and its 'Undo swaps' net to zero", () => {
    // Round 3 follow-up: "Make all swaps" then the toast's Undo wrote four
    // swaps, and full time said "4 subs" for a game with none.
    const swap = (off: string, on: string, extra: Record<string, unknown> = {}) =>
      ev("swap", { off_player_id: off, on_player_id: on, zone: "fwd", quarter: 1, elapsed_ms: 60_000, ...extra }, on);
    const events: GameEvent[] = [
      ev("lineup_set", lineup("c", "d")),
      ev("quarter_start", { quarter: 1 }),
      swap("c", "d"),
      swap("a", "e"),
      // The batch back, last first (lib/live/liveChrome undoSwaps).
      swap("e", "a", { manual: true, undo: true }),
      swap("d", "c", { manual: true, undo: true }),
      // A real sub after it still counts.
      swap("c", "d"),
    ];
    expect(replayGame(events).subCount).toBe(1);
  });

  it("is 0 before anyone comes off", () => {
    expect(replayGame([ev("lineup_set", lineup("c", "d")), ev("quarter_start", { quarter: 1 })]).subCount).toBe(0);
  });
});
