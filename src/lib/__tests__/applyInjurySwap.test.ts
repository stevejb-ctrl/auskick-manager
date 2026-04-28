// Unit coverage for the applyInjurySwap store action — the atomic
// "mark injured + bring on a bench replacement" path that drives the
// InjuryReplacementModal flow. The bench picker can't leave a hole if
// this action gets the lineup arithmetic right; everything else is UI.

import { describe, expect, it, beforeEach } from "vitest";
import { useLiveGame, QUARTER_MS } from "@/lib/stores/liveGameStore";
import type { Lineup } from "@/lib/types";

function freshLineup(): Lineup {
  return {
    back: ["pBack"],
    hback: [],
    mid: ["pMid1", "pMid2"],
    hfwd: [],
    fwd: ["pFwd"],
    bench: ["pB1", "pB2"],
  };
}

describe("applyInjurySwap", () => {
  beforeEach(() => {
    useLiveGame.setState({
      lineup: freshLineup(),
      currentQuarter: 1,
      clockStartedAt: null,
      accumulatedMs: 30_000, // 30s elapsed in Q1
      basePlayedZoneMs: {
        pMid1: { back: 0, hback: 0, mid: 60_000, hfwd: 0, fwd: 0 },
      },
      stintStartMs: { pMid1: 0, pMid2: 0, pBack: 0, pFwd: 0 },
      stintZone: { pMid1: "mid", pMid2: "mid", pBack: "back", pFwd: "fwd" },
      injuredIds: [],
      loanedIds: [],
      swapCount: 0,
    });
  });

  it("moves the injured player to bench, brings replacement into the vacated zone, and adds them to injuredIds", () => {
    useLiveGame.getState().applyInjurySwap("pMid1", "pB1");
    const s = useLiveGame.getState();

    // Replacement is in the zone the injured player vacated, injured is on the bench.
    expect(s.lineup.mid).toContain("pB1");
    expect(s.lineup.mid).not.toContain("pMid1");
    expect(s.lineup.bench).toContain("pMid1");
    expect(s.lineup.bench).not.toContain("pB1");

    // Injury flag flipped.
    expect(s.injuredIds).toContain("pMid1");
  });

  it("closes the injured player's open zone-stint and accumulates it to basePlayedZoneMs", () => {
    useLiveGame.getState().applyInjurySwap("pMid1", "pB1");
    const s = useLiveGame.getState();

    // pMid1 had 60s of base + a 30s open stint = 90s in mid after the action.
    expect(s.basePlayedZoneMs.pMid1?.mid).toBe(90_000);
    // Stint markers cleared.
    expect(s.stintStartMs.pMid1).toBeUndefined();
    expect(s.stintZone.pMid1).toBeUndefined();
  });

  it("opens a fresh stint for the replacement at the current clock", () => {
    useLiveGame.getState().applyInjurySwap("pMid1", "pB1");
    const s = useLiveGame.getState();

    expect(s.stintStartMs.pB1).toBe(30_000);
    expect(s.stintZone.pB1).toBe("mid");
  });

  it("increments swapCount by exactly one (vs naively chaining setInjured + applySwap which would bump it twice)", () => {
    const before = useLiveGame.getState().swapCount;
    useLiveGame.getState().applyInjurySwap("pMid1", "pB1");
    expect(useLiveGame.getState().swapCount).toBe(before + 1);
  });

  it("is a no-op if the injured player isn't on the field", () => {
    // pB1 is on the bench, not the field — calling with it as the injured id should bail.
    useLiveGame.getState().applyInjurySwap("pB1", "pB2");
    const s = useLiveGame.getState();
    // Lineup unchanged.
    expect(s.lineup).toEqual(freshLineup());
    // No injury flag added.
    expect(s.injuredIds).toEqual([]);
    expect(s.swapCount).toBe(0);
  });

  it("is a no-op if the replacement isn't on the bench", () => {
    // pFwd is already on the field — picking them as a replacement should bail.
    useLiveGame.getState().applyInjurySwap("pMid1", "pFwd");
    const s = useLiveGame.getState();
    expect(s.lineup).toEqual(freshLineup());
    expect(s.injuredIds).toEqual([]);
  });

  it("does not double-add to injuredIds if the player is somehow already flagged", () => {
    // Pre-flag the on-field player as injured (inconsistent state but defensive).
    useLiveGame.setState({ injuredIds: ["pMid1"] });
    useLiveGame.getState().applyInjurySwap("pMid1", "pB1");
    const s = useLiveGame.getState();
    expect(s.injuredIds.filter((id) => id === "pMid1")).toHaveLength(1);
  });

  // Sanity: quarter ms constant import works (catches accidental
  // store-module re-org breaking the named export).
  it("uses the live store module's QUARTER_MS export", () => {
    expect(QUARTER_MS).toBe(12 * 60 * 1000);
  });
});
