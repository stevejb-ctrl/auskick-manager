// Regression coverage for the short-squad blank-slot path in
// replayGame. From a match-day report: U10s coach had 11 players
// (default 12), the empty slot defaulted into FWD, he wanted it
// in BACK, and the field-to-empty swap was silently dropped.
//
// The fix added a "move-into-empty" branch to field_zone_swap
// event replay (metadata.player_b_id can now be null/empty —
// meaning pidA moves to zoneB and the blank shifts the other
// way). This test pins that branch so a future refactor that
// re-introduces the both-players guard fails loudly.

import { describe, expect, it } from "vitest";
import { replayGame } from "@/lib/fairness";
import type { GameEvent } from "@/lib/types";

let evCounter = 0;
function ev(
  type: GameEvent["type"],
  metadata: Record<string, unknown> = {},
  player_id: string | null = null,
): GameEvent {
  evCounter++;
  const t = new Date(2026, 0, 1, 12, 0, evCounter).toISOString();
  return {
    id: `e${evCounter}`,
    game_id: "g1",
    type,
    player_id,
    metadata,
    created_at: t,
    created_by: "u1",
  } as GameEvent;
}

describe("replayGame — field_zone_swap move-into-empty", () => {
  it("moves player A to zoneB and leaves zoneA empty when player_b_id is null", () => {
    // 11 players, U10 12-on-field shape: back=4, mid=4, fwd=3
    // (the hardcoded zoneCapsFor priority puts the blank in FWD).
    // Coach wants the blank in BACK instead, so they tap a Back
    // player and then the empty Forward slot.
    evCounter = 0;
    const events: GameEvent[] = [
      ev("lineup_set", {
        lineup: {
          back: ["b1", "b2", "b3", "b4"],
          mid: ["m1", "m2", "m3", "m4"],
          fwd: ["f1", "f2", "f3"],
          bench: [],
        },
      }),
      ev("quarter_start", { quarter: 1 }),
      ev(
        "field_zone_swap",
        {
          player_a_id: "b4",
          zone_a: "back",
          player_b_id: null,
          zone_b: "fwd",
          quarter: 1,
          elapsed_ms: 60_000,
        },
        "b4",
      ),
    ];

    const state = replayGame(events);

    // b4 is now in fwd; back has lost a slot.
    expect(state.lineup?.back).toEqual(["b1", "b2", "b3"]);
    expect(state.lineup?.fwd).toEqual(["f1", "f2", "f3", "b4"]);
    // No bench movement — strictly an on-field rearrangement.
    expect(state.lineup?.bench ?? []).toEqual([]);
    // Total on-field unchanged at 11. Blank slot has moved from
    // FWD to BACK, which is the entire point of the fix.
    const onField =
      (state.lineup?.back.length ?? 0) +
      (state.lineup?.mid.length ?? 0) +
      (state.lineup?.fwd.length ?? 0);
    expect(onField).toBe(11);
  });

  it("still handles two-player swaps the old way when player_b_id is set", () => {
    // Sanity-check the existing branch — the move-into-empty
    // refactor must not regress the full-strength case.
    evCounter = 0;
    const events: GameEvent[] = [
      ev("lineup_set", {
        lineup: {
          back: ["b1", "b2", "b3", "b4"],
          mid: ["m1", "m2", "m3", "m4"],
          fwd: ["f1", "f2", "f3", "f4"],
          bench: [],
        },
      }),
      ev("quarter_start", { quarter: 1 }),
      ev(
        "field_zone_swap",
        {
          player_a_id: "b4",
          zone_a: "back",
          player_b_id: "f4",
          zone_b: "fwd",
          quarter: 1,
          elapsed_ms: 60_000,
        },
        "b4",
      ),
    ];

    const state = replayGame(events);
    expect(state.lineup?.back).toContain("f4");
    expect(state.lineup?.back).not.toContain("b4");
    expect(state.lineup?.fwd).toContain("b4");
    expect(state.lineup?.fwd).not.toContain("f4");
  });
});
