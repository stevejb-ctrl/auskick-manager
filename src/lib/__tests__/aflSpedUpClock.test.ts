// AFL live store at a sped-up clock (games.clock_multiplier — the
// public demo runs at 8×, test seeds at up to 60×).
//
// Saved events and the server replay (fairness.ts replayGame) measure
// time in GAME ms: elapsed_ms = real ms × multiplier. The live store
// used to run its stint maths in real ms, so the two frames met in
// the same player's tile: a kid subbed on at 2:40 of game time showed
// 0:00 after a reload (real-ms clock 0:30 minus game-ms stint start
// 2:40), and tiles ran at 1/8 of the header clock (Stagehand rounds 4
// and 5). The store now keeps one game-time clock, like netball's
// computePeriodClockMs.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clockElapsedMs, useLiveGame } from "@/lib/stores/liveGameStore";
import type { Lineup } from "@/lib/types";

const T0 = 1_700_000_000_000;

function lineup(): Lineup {
  return {
    back: ["pBack"],
    hback: [],
    mid: ["pMid"],
    hfwd: [],
    fwd: ["pFwd"],
    bench: ["pBench"],
  };
}

function kickOffAt8x() {
  useLiveGame.getState().init({
    activeGameId: "g-8x",
    clockMultiplier: 8,
    lineup: lineup(),
    currentQuarter: 1,
    stintStartMs: { pBack: 0, pMid: 0, pFwd: 0 },
    stintZone: { pBack: "back", pMid: "mid", pFwd: "fwd" },
    clockStartedAt: Date.now(),
    accumulatedMs: 0,
  });
}

describe("AFL live store — sped-up clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clockElapsedMs reports game ms", () => {
    expect(
      clockElapsedMs({ clockStartedAt: T0 - 20_000, accumulatedMs: 0, clockMultiplier: 8 }),
    ).toBe(160_000);
    // No multiplier = real time, as before.
    expect(clockElapsedMs({ clockStartedAt: T0 - 20_000, accumulatedMs: 0 })).toBe(20_000);
  });

  it("a swap closes and opens stints in game ms, the frame saved events use", () => {
    kickOffAt8x();
    vi.advanceTimersByTime(20_000); // 20 s real = 2:40 of game time
    useLiveGame.getState().applySwap("pMid", "pBench", "mid");

    const s = useLiveGame.getState();
    expect(s.stintStartMs.pBench).toBe(160_000);
    expect(s.basePlayedZoneMs.pMid.mid).toBe(160_000);
  });

  it("an injury swap and a lend use game ms too", () => {
    kickOffAt8x();
    vi.advanceTimersByTime(10_000); // 1:20 of game time
    useLiveGame.getState().applyInjurySwap("pBack", "pBench");
    vi.advanceTimersByTime(5_000); // 2:00
    useLiveGame.getState().setLoaned("pFwd", true);

    const s = useLiveGame.getState();
    expect(s.basePlayedZoneMs.pBack.back).toBe(80_000);
    expect(s.stintStartMs.pBench).toBe(80_000);
    expect(s.basePlayedZoneMs.pFwd.fwd).toBe(120_000);
    expect(s.loanStartMs.pFwd).toBe(120_000);
  });

  it("pausing banks game ms, and the paused clock stays frozen", () => {
    kickOffAt8x();
    vi.advanceTimersByTime(15_000);
    useLiveGame.getState().pauseClock();
    vi.advanceTimersByTime(60_000);

    const s = useLiveGame.getState();
    expect(s.accumulatedMs).toBe(120_000);
    expect(clockElapsedMs(s)).toBe(120_000);
  });

  it("the siren caps stints at the quarter length in game ms", () => {
    kickOffAt8x();
    vi.advanceTimersByTime(100_000); // 13:20 of game time, past a 12:00 quarter
    useLiveGame.getState().endCurrentQuarter(720_000);

    const s = useLiveGame.getState();
    expect(s.accumulatedMs).toBe(720_000);
    expect(s.basePlayedZoneMs.pMid.mid).toBe(720_000);
    expect(s.lastStintMs.pMid).toBe(720_000);
  });
});
