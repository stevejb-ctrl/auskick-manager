// The sub-due anchor with a due batch made one swap at a time. Soccer's
// audit (23 Oct 2026): doing 1 of 2 due swaps restarted the sub clock,
// and the other due swap dropped off the card. The clock re-anchors
// when the batch is done.

import { describe, expect, it } from "vitest";
import { resolveSubAnchorElapsed } from "@/lib/live/subAnchor";
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
