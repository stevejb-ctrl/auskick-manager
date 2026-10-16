// A kid selected for a swap and then lent or hurt must not stay
// selected: the next tap would swap a lent or injured kid on.
// Stagehand round 4 (sideline-chaos-netball): a kid long-pressed (which
// selected them), then lent, came on court with the next tap.

import { beforeEach, describe, expect, it } from "vitest";
import { useLiveGame } from "@/lib/stores/liveGameStore";

beforeEach(() => {
  useLiveGame.setState({
    lineup: { back: ["b1"], hback: [], mid: ["m1"], hfwd: [], fwd: ["f1"], bench: ["x1", "x2"] },
    currentQuarter: 1,
    clockStartedAt: null,
    accumulatedMs: 60_000,
    basePlayedZoneMs: {},
    basePlayedLoanMs: {},
    stintStartMs: {},
    stintZone: {},
    loanStartMs: {},
    injuredIds: [],
    loanedIds: [],
    selected: null,
  });
});

describe("lending or injuring the selected kid clears the selection", () => {
  it("a selected bench kid who is lent", () => {
    useLiveGame.getState().selectBench("x1");
    useLiveGame.getState().setLoaned("x1", true);
    expect(useLiveGame.getState().selected).toBeNull();
  });

  it("a selected field kid who is hurt", () => {
    useLiveGame.getState().selectField("m1", "mid");
    useLiveGame.getState().setInjured("m1", true);
    expect(useLiveGame.getState().selected).toBeNull();
  });

  it("someone else's selection stays", () => {
    useLiveGame.getState().selectBench("x2");
    useLiveGame.getState().setLoaned("x1", true);
    useLiveGame.getState().setInjured("m1", true);
    expect(useLiveGame.getState().selected).toEqual({ kind: "bench", playerId: "x2" });
  });
});
