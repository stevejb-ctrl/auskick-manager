// What AFL's live screen rebuilds from the events on a reload: the
// clock's pause and the sub clock's anchor. Both lived only on the phone
// (round-2 usability test, 24 Oct 2026):
//   - a reload during a pause brought the clock back running, the paused
//     minute credited as play;
//   - a reload 35 s after "Make all 2 swaps" (made late, at 7:48)
//     brought "Sub due — NOW" straight back.

import { describe, expect, it } from "vitest";
import { replayGame } from "@/lib/fairness";
import type { GameEvent } from "@/lib/types";

const MIN = 60_000;
let seq = 0;
function ev(type: string, metadata: Record<string, unknown>, player_id: string | null = null): GameEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    game_id: "g1",
    type: type as GameEvent["type"],
    player_id,
    metadata,
    created_by: null,
    created_at: new Date(Date.parse("2026-10-24T09:00:00.000Z") + seq * 1000).toISOString(),
  };
}

const lineup = {
  back: ["a", "b"],
  hback: [],
  mid: ["c", "d"],
  hfwd: [],
  fwd: ["e", "f"],
  bench: ["x", "y"],
};
const kickoff = () => [ev("lineup_set", { lineup }), ev("quarter_start", { quarter: 1 })];
const swap = (elapsed: number, off: string, on: string, extra: Record<string, unknown> = {}) =>
  ev("swap", { off_player_id: off, on_player_id: on, zone: "back", quarter: 1, elapsed_ms: elapsed, ...extra }, on);

describe("replayGame: the sub clock's anchor", () => {
  it("is the last planned swap, so a reload just after subbing isn't due", () => {
    const state = replayGame([...kickoff(), swap(7 * MIN + 48_000, "a", "x"), swap(7 * MIN + 48_000, "b", "y")]);
    expect(state.subAnchorMs).toBe(7 * MIN + 48_000);
    expect(state.subBatchLeft).toBe(0);
  });

  it("holds through a due batch made one swap at a time", () => {
    const state = replayGame([...kickoff(), swap(3 * MIN, "a", "x", { batch_left: 1 })]);
    expect(state.subAnchorMs).toBe(0);
    expect(state.subBatchLeft).toBe(1);
  });

  it("ignores a hand swap", () => {
    const state = replayGame([...kickoff(), swap(2 * MIN, "a", "x"), swap(3 * MIN, "b", "y", { manual: true })]);
    expect(state.subAnchorMs).toBe(2 * MIN);
  });

  it("is null before kickoff and at a break", () => {
    expect(replayGame([ev("lineup_set", { lineup })]).subAnchorMs).toBeNull();
    expect(replayGame([...kickoff(), ev("quarter_end", { quarter: 1, elapsed_ms: 12 * MIN })]).subAnchorMs).toBeNull();
  });
});

describe("replayGame: the clock's pause", () => {
  it("is the quarter's latest pause or resume", () => {
    const paused = replayGame([
      ...kickoff(),
      ev("clock_pause", { quarter: 1, paused: true, elapsed_ms: 5 * MIN, at_ms: 1_000 }),
    ]);
    expect(paused.clockPause).toMatchObject({ paused: true, elapsedMs: 5 * MIN, atMs: 1_000 });
    const resumed = replayGame([
      ...kickoff(),
      ev("clock_pause", { quarter: 1, paused: true, elapsed_ms: 5 * MIN, at_ms: 1_000 }),
      ev("clock_pause", { quarter: 1, paused: false, elapsed_ms: 5 * MIN, at_ms: 61_000 }),
    ]);
    expect(resumed.clockPause).toMatchObject({ paused: false, elapsedMs: 5 * MIN, atMs: 61_000 });
  });

  it("doesn't credit or move anyone", () => {
    const without = replayGame([...kickoff(), swap(2 * MIN, "a", "x")]);
    const withPause = replayGame([
      ...kickoff(),
      ev("clock_pause", { quarter: 1, paused: true, elapsed_ms: MIN, at_ms: 1_000 }),
      swap(2 * MIN, "a", "x"),
    ]);
    expect(withPause.basePlayedZoneMs).toEqual(without.basePlayedZoneMs);
    expect(withPause.lineup).toEqual(without.lineup);
    expect(withPause.subCount).toBe(without.subCount);
  });

  it("is gone once the quarter ends", () => {
    const state = replayGame([
      ...kickoff(),
      ev("clock_pause", { quarter: 1, paused: true, elapsed_ms: 5 * MIN, at_ms: 1_000 }),
      ev("quarter_end", { quarter: 1, elapsed_ms: 12 * MIN }),
    ]);
    expect(state.clockPause).toBeNull();
  });
});
