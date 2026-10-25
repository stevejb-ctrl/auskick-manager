// The sub-due anchor with a due batch made one swap at a time. Soccer's
// audit (23 Oct 2026): doing 1 of 2 due swaps restarted the sub clock,
// and the other due swap dropped off the card. The clock re-anchors
// when the batch is done.

import { describe, expect, it } from "vitest";
import { mergeSubAnchor, openSubBatch, resolveSubAnchorElapsed } from "@/lib/live/subAnchor";
import type { GameEvent } from "@/lib/types";

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
    created_at: new Date(1_700_000_000_000 + seq * 1000).toISOString(),
  } as GameEvent;
}

const MIN = 60_000;
const swap = (elapsed: number, off: string, on: string, extra: Record<string, unknown> = {}) =>
  ev("swap", { quarter: 1, elapsed_ms: elapsed, off_player_id: off, on_player_id: on, ...extra }, on);

describe("resolveSubAnchorElapsed: a due batch, one swap at a time", () => {
  it("holds the anchor while the batch still has swaps to make", () => {
    const events = [
      ev("quarter_start", { quarter: 1 }),
      swap(4 * MIN, "a", "x"),
      // The 8:00 batch has two swaps; the coach makes the first at 8:10.
      swap(8 * MIN + 10_000, "b", "y", { batch_left: 1 }),
    ];
    expect(resolveSubAnchorElapsed(events, 1)).toBe(4 * MIN);
  });

  it("re-anchors on the batch's last swap", () => {
    const events = [
      ev("quarter_start", { quarter: 1 }),
      swap(4 * MIN, "a", "x"),
      swap(8 * MIN + 10_000, "b", "y", { batch_left: 1 }),
      swap(8 * MIN + 30_000, "c", "z", { batch_left: 0 }),
    ];
    expect(resolveSubAnchorElapsed(events, 1)).toBe(8 * MIN + 30_000);
  });

  it("holds the period start when the first batch is part done", () => {
    const events = [ev("quarter_start", { quarter: 1 }), swap(4 * MIN, "a", "x", { batch_left: 1 })];
    expect(resolveSubAnchorElapsed(events, 1)).toBe(0);
  });

  it("re-anchors on a swap that names no batch, as before", () => {
    const events = [ev("quarter_start", { quarter: 1 }), swap(4 * MIN, "a", "x")];
    expect(resolveSubAnchorElapsed(events, 1)).toBe(4 * MIN);
  });
});

describe("openSubBatch: what's left of a due batch", () => {
  // The live e2e (23 Oct 2026): with the clock held, the card suggested
  // the kid just taken off straight back on as a second "due" swap. The
  // card shows only the swaps the batch has left.
  it("is the latest planned swap's batch_left while the batch is open", () => {
    const events = [ev("quarter_start", { quarter: 1 }), swap(MIN, "a", "x", { batch_left: 2 }), swap(MIN + 5_000, "b", "y", { batch_left: 1 })];
    expect(openSubBatch(events, 1)).toBe(1);
  });

  it("is 0 once the batch is done, a swap outside it is made, or none was open", () => {
    const done = [ev("quarter_start", { quarter: 1 }), swap(MIN, "a", "x", { batch_left: 1 }), swap(MIN + 5_000, "b", "y")];
    expect(openSubBatch(done, 1)).toBe(0);
    expect(openSubBatch([ev("quarter_start", { quarter: 1 })], 1)).toBe(0);
    expect(openSubBatch([], 0)).toBe(0);
    // Last half's open batch doesn't carry into this one.
    const lastHalf = [ev("quarter_start", { quarter: 1 }), swap(MIN, "a", "x", { batch_left: 1 }), ev("quarter_start", { quarter: 2 })];
    expect(openSubBatch(lastHalf, 2)).toBe(0);
  });

  it("looks past a forced swap", () => {
    const events = [
      ev("quarter_start", { quarter: 1 }),
      swap(MIN, "a", "x", { batch_left: 1 }),
      ev("injury", { quarter: 1, elapsed_ms: MIN + 9_000, injured: true }, "c"),
      swap(MIN + 9_000, "c", "z"),
    ];
    expect(openSubBatch(events, 1)).toBe(1);
  });
});

describe("a hand swap doesn't restart the sub clock (AFL's rule, every sport)", () => {
  // Round 2 (24 Oct 2026): a tap-tap swap restarted soccer's countdown
  // (3:15 → 3:58); AFL's kept running toward the next planned sub.
  it("skips a manual swap when finding the anchor", () => {
    const events = [ev("quarter_start", { quarter: 1 }), swap(4 * MIN, "a", "x"), swap(5 * MIN, "b", "y", { manual: true })];
    expect(resolveSubAnchorElapsed(events, 1)).toBe(4 * MIN);
    expect(resolveSubAnchorElapsed([ev("quarter_start", { quarter: 1 }), swap(MIN, "a", "x", { manual: true })], 1)).toBe(0);
  });

  it("looks past a manual swap for a batch still open", () => {
    const events = [ev("quarter_start", { quarter: 1 }), swap(MIN, "a", "x", { batch_left: 1 }), swap(MIN + 9_000, "c", "z", { manual: true })];
    expect(openSubBatch(events, 1)).toBe(1);
  });
});

describe("mergeSubAnchor: AFL's sub clock, from the events and this phone", () => {
  // Round 2 (24 Oct 2026): a reload 35 s after "Make all 2 swaps" (made
  // late, at 7:48) brought "Sub due — NOW" straight back. The anchor was
  // re-seeded from a stale clock; now it's the events' anchor.
  it("takes the events' anchor for a period it hasn't seen (a reload, a new quarter)", () => {
    expect(mergeSubAnchor(null, { period: 1, anchorMs: 7 * MIN + 48_000, batchLeft: 0 })).toEqual({
      period: 1,
      anchorMs: 7 * MIN + 48_000,
      batchLeft: 0,
    });
    expect(mergeSubAnchor({ period: 1, anchorMs: 9 * MIN, batchLeft: 0 }, { period: 2, anchorMs: null, batchLeft: 0 })).toEqual({
      period: 2,
      anchorMs: 0,
      batchLeft: 0,
    });
  });

  it("keeps this phone's newer swap over events that haven't caught up", () => {
    const mine = { period: 1, anchorMs: 8 * MIN, batchLeft: 0 };
    expect(mergeSubAnchor(mine, { period: 1, anchorMs: 4 * MIN, batchLeft: 0 })).toBe(mine);
    expect(mergeSubAnchor(mine, { period: 1, anchorMs: null, batchLeft: 0 })).toBe(mine);
  });

  it("follows a newer swap the events have (another phone's)", () => {
    expect(mergeSubAnchor({ period: 1, anchorMs: 4 * MIN, batchLeft: 0 }, { period: 1, anchorMs: 8 * MIN, batchLeft: 1 })).toEqual({
      period: 1,
      anchorMs: 8 * MIN,
      batchLeft: 1,
    });
  });
});
