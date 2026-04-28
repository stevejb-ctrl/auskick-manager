// Regression coverage for the store's `init` action.
//
// Reset-game bug (Apr 28): clicking "Restart game" wiped server-side
// events but left the live store holding the pre-reset state — old
// zone minutes, scores, lockedIds, etc. continued showing in the UI
// after the user re-started. Two compounding causes:
//
//   1. init merged its payload into `prev`, so any field the caller
//      didn't pass (swapCount, lockedIds, lastStintMs, lastStintZone,
//      zoneLockedPlayers, selected) leaked across resets.
//   2. LiveGame.tsx's hydration effect bailed out as long as
//      activeGameId still matched, never re-initialising the store
//      after a reset.
//
// (1) is fixed in the store and covered here. (2) is fixed in
// LiveGame.tsx — the test for that lives in the e2e suite (it
// requires a real reset → re-start round-trip).

import { describe, expect, it, beforeEach } from "vitest";
import { useLiveGame } from "@/lib/stores/liveGameStore";

describe("liveGameStore.init full-reset semantics", () => {
  beforeEach(() => {
    // Seed the store with a "previous game in flight" snapshot containing
    // values in EVERY field — including the ones the live page's init
    // payload never sends. If init doesn't reset these, the test fails.
    useLiveGame.setState({
      activeGameId: "old-game",
      lineup: { back: ["x"], hback: [], mid: ["y"], hfwd: [], fwd: ["z"], bench: ["q"] },
      currentQuarter: 3,
      quarterEnded: false,
      finalised: false,
      clockStartedAt: 1000,
      accumulatedMs: 60_000,
      selected: { kind: "field", playerId: "x", zone: "back" },
      teamScore: { goals: 4, behinds: 3 },
      opponentScore: { goals: 2, behinds: 5 },
      playerScores: { x: { goals: 1, behinds: 0 } },
      basePlayedZoneMs: { x: { back: 60_000, hback: 0, mid: 0, hfwd: 0, fwd: 0 } },
      stintStartMs: { x: 30_000 },
      stintZone: { x: "back" },
      swapCount: 7,
      injuredIds: ["q"],
      loanedIds: [],
      loanStartMs: {},
      basePlayedLoanMs: {},
      lockedIds: ["y"],
      lastStintMs: { z: 120_000 },
      lastStintZone: { z: "fwd" },
      zoneLockedPlayers: { y: "mid" },
    });
  });

  it("init() with no payload returns every data field to its blank-slate default", () => {
    useLiveGame.getState().init({});
    const s = useLiveGame.getState();

    expect(s.activeGameId).toBeNull();
    expect(s.lineup.back).toEqual([]);
    expect(s.lineup.bench).toEqual([]);
    expect(s.currentQuarter).toBe(0);
    expect(s.quarterEnded).toBe(false);
    expect(s.finalised).toBe(false);
    expect(s.clockStartedAt).toBeNull();
    expect(s.accumulatedMs).toBe(0);
    expect(s.selected).toBeNull();
    expect(s.teamScore).toEqual({ goals: 0, behinds: 0 });
    expect(s.opponentScore).toEqual({ goals: 0, behinds: 0 });
    expect(s.playerScores).toEqual({});
    expect(s.basePlayedZoneMs).toEqual({});
    expect(s.stintStartMs).toEqual({});
    expect(s.stintZone).toEqual({});
    expect(s.swapCount).toBe(0);
    expect(s.injuredIds).toEqual([]);
    expect(s.loanedIds).toEqual([]);
    expect(s.loanStartMs).toEqual({});
    expect(s.basePlayedLoanMs).toEqual({});
    expect(s.lockedIds).toEqual([]);
    expect(s.lastStintMs).toEqual({});
    expect(s.lastStintZone).toEqual({});
    expect(s.zoneLockedPlayers).toEqual({});
  });

  it("clears the fields the live page's init payload doesn't pass (the actual restart-game leak)", () => {
    // Simulate exactly what LiveGame.tsx passes after replayGame returns
    // a fresh state — most fields, but NOT swapCount / lockedIds /
    // lastStintMs / lastStintZone / zoneLockedPlayers / selected.
    useLiveGame.getState().init({
      activeGameId: "old-game", // same game id — proves init is a full reset
      lineup: { back: [], hback: [], mid: [], hfwd: [], fwd: [], bench: [] },
      currentQuarter: 0,
      quarterEnded: false,
      finalised: false,
      teamScore: { goals: 0, behinds: 0 },
      opponentScore: { goals: 0, behinds: 0 },
      playerScores: {},
      basePlayedZoneMs: {},
      stintStartMs: {},
      stintZone: {},
      injuredIds: [],
      loanedIds: [],
      loanStartMs: {},
      basePlayedLoanMs: {},
      clockStartedAt: null,
      accumulatedMs: 0,
    });
    const s = useLiveGame.getState();

    // The fields the payload omits — these are what leaked before the fix.
    expect(s.swapCount).toBe(0);
    expect(s.lockedIds).toEqual([]);
    expect(s.lastStintMs).toEqual({});
    expect(s.lastStintZone).toEqual({});
    expect(s.zoneLockedPlayers).toEqual({});
    expect(s.selected).toBeNull();
  });

  it("preserves the action methods (init must not nuke selectField, applySwap, etc.)", () => {
    const before = useLiveGame.getState();
    expect(typeof before.selectField).toBe("function");

    useLiveGame.getState().init({});

    const after = useLiveGame.getState();
    expect(typeof after.selectField).toBe("function");
    expect(typeof after.applySwap).toBe("function");
    expect(typeof after.applyInjurySwap).toBe("function");
    expect(typeof after.endCurrentQuarter).toBe("function");
    expect(typeof after.init).toBe("function");
  });

  it("payload values still take precedence over defaults", () => {
    useLiveGame.getState().init({
      activeGameId: "g1",
      currentQuarter: 1,
      teamScore: { goals: 0, behinds: 0 },
      lineup: { back: ["a"], hback: [], mid: ["b"], hfwd: [], fwd: ["c"], bench: [] },
    });
    const s = useLiveGame.getState();
    expect(s.activeGameId).toBe("g1");
    expect(s.currentQuarter).toBe(1);
    expect(s.lineup.back).toEqual(["a"]);
  });
});
