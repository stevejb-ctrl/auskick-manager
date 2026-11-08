// Regression: a field_zone_swap whose two kids are in the SAME zone
// (zone_a === zone_b, e.g. two mids trading spots, or the coming
// position change between CHB and FB inside one line). Each replay
// swapped with two map() passes over the lineup, one per zone. With one
// zone that's the same array twice: [A, B] → [B, B] → [A, A], so one kid
// vanished from the field and the other was on it twice.
//
// Covers the three AFL places that apply the event: the fairness replay
// (store init), the dashboard replay (stats) and the live store action.

import { beforeEach, describe, expect, it } from "vitest";
import { replayGame as replayFairness } from "@/lib/fairness";
import { replayGame as replayDashboard } from "@/lib/dashboard/eventReplay";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import type { GameEvent, Lineup } from "@/lib/types";

let n = 0;
function ev(type: GameEvent["type"], metadata: Record<string, unknown> = {}, player_id: string | null = null): GameEvent {
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

function events(): GameEvent[] {
  n = 0;
  return [
    ev("lineup_set", {
      lineup: { back: ["b1", "b2"], mid: ["m1", "m2", "m3"], fwd: ["f1", "f2"], bench: ["x1"] },
    }),
    ev("quarter_start", { quarter: 1 }),
    ev(
      "field_zone_swap",
      { player_a_id: "m1", zone_a: "mid", player_b_id: "m3", zone_b: "mid", quarter: 1, elapsed_ms: 60_000 },
      "m1",
    ),
    ev("quarter_end", { quarter: 1, elapsed_ms: 120_000 }),
  ];
}

describe("field_zone_swap inside one zone", () => {
  it("fairness replay trades the two kids' spots and keeps both on the field", () => {
    const state = replayFairness(events());
    expect(state.lineup?.mid).toEqual(["m3", "m2", "m1"]);
    expect(state.lineup?.bench).toEqual(["x1"]);
  });

  it("fairness replay keeps both kids' time in that zone", () => {
    const state = replayFairness(events());
    expect(state.basePlayedZoneMs.m1?.mid).toBe(120_000);
    expect(state.basePlayedZoneMs.m3?.mid).toBe(120_000);
  });

  it("dashboard replay trades the two kids' spots and keeps both on the field", () => {
    const snap = replayDashboard("g1", events());
    const after = snap.lineupPeriods[snap.lineupPeriods.length - 1];
    expect(after.zonePlayers.mid).toEqual(["m3", "m2", "m1"]);
    expect(snap.playerZoneMs.m1?.mid).toBe(120_000);
    expect(snap.playerZoneMs.m3?.mid).toBe(120_000);
  });
});

describe("applyFieldZoneSwap inside one zone (live store)", () => {
  beforeEach(() => {
    const lineup: Lineup = { back: ["b1"], hback: [], mid: ["m1", "m2", "m3"], hfwd: [], fwd: ["f1"], bench: ["x1"] };
    useLiveGame.setState({
      lineup,
      currentQuarter: 1,
      clockStartedAt: null,
      accumulatedMs: 60_000,
      basePlayedZoneMs: {},
      stintStartMs: { b1: 0, m1: 0, m2: 0, m3: 0, f1: 0 },
      stintZone: { b1: "back", m1: "mid", m2: "mid", m3: "mid", f1: "fwd" },
      injuredIds: [],
      loanedIds: [],
      swapCount: 0,
    });
  });

  it("trades the two kids' spots and keeps both on the field", () => {
    useLiveGame.getState().applyFieldZoneSwap("m1", "mid", "m3", "mid");
    const s = useLiveGame.getState();
    expect(s.lineup.mid).toEqual(["m3", "m2", "m1"]);
    expect(s.stintZone.m1).toBe("mid");
    expect(s.stintZone.m3).toBe("mid");
    expect(s.basePlayedZoneMs.m1?.mid).toBe(60_000);
    expect(s.basePlayedZoneMs.m3?.mid).toBe(60_000);
  });

  it("still swaps across zones as before", () => {
    useLiveGame.getState().applyFieldZoneSwap("b1", "back", "f1", "fwd");
    const s = useLiveGame.getState();
    expect(s.lineup.back).toEqual(["f1"]);
    expect(s.lineup.fwd).toEqual(["b1"]);
  });
});
