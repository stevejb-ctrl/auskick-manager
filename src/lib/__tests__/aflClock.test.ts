// Parity coverage for AFL's `clockElapsedMs` — mirrors the
// `computeNetballClockMs` tests in netballClock.test.ts so the
// freeze invariant is documented at the unit level for BOTH
// sports. Steve 2026-05-15 directive: apply the rules globally,
// don't diverge sport implementations where the contract is
// shared.
//
// AFL's clock model is simpler than netball's — just two store
// fields, `clockStartedAt` and `accumulatedMs`. When
// clockStartedAt is null the clock is paused and the helper
// returns the accumulated value frozen. The auto-hooter in
// LiveGame.tsx calls `pauseClock()` which writes that null,
// which freezes player time on the field via the helper's
// constant return.
//
// The matching call-site rule (gate resume after the hooter has
// fired for this quarter) lives in `handleResume` in
// LiveGame.tsx and is tested via e2e — there's no pure-function
// version of that gate to unit-test, but the freeze invariant
// here is the load-bearing math the gate protects.

import { describe, expect, test } from "vitest";
import { clockElapsedMs } from "../stores/liveGameStore";

describe("clockElapsedMs — base behaviour", () => {
  test("paused (clockStartedAt = null) returns accumulatedMs exactly", () => {
    expect(
      clockElapsedMs({ clockStartedAt: null, accumulatedMs: 0 }),
    ).toBe(0);
    expect(
      clockElapsedMs({ clockStartedAt: null, accumulatedMs: 720_000 }),
    ).toBe(720_000);
    expect(
      clockElapsedMs({ clockStartedAt: null, accumulatedMs: 12_345 }),
    ).toBe(12_345);
  });

  test("running (clockStartedAt set) adds wall-clock delta to accumulatedMs", () => {
    const startedAt = Date.now() - 5_000; // 5s ago
    const result = clockElapsedMs({
      clockStartedAt: startedAt,
      accumulatedMs: 10_000,
    });
    // ~15s elapsed, with a ±50ms slop for test-runner jitter.
    expect(result).toBeGreaterThanOrEqual(14_950);
    expect(result).toBeLessThanOrEqual(15_050);
  });

  test("running with accumulatedMs = 0 returns just the wall-clock delta", () => {
    const startedAt = Date.now() - 3_000;
    const result = clockElapsedMs({
      clockStartedAt: startedAt,
      accumulatedMs: 0,
    });
    expect(result).toBeGreaterThanOrEqual(2_950);
    expect(result).toBeLessThanOrEqual(3_050);
  });
});

describe("clockElapsedMs — freeze invariant", () => {
  // THE LOAD-BEARING TESTS for the auto-hooter player-time
  // freeze. Steve 2026-05-15: reported player time still
  // accruing after the AFL hooter fires. The fix lives in
  // (a) LiveGame.tsx's existing pauseClock() inside the hooter
  // trigger (sets clockStartedAt = null), and (b) the new
  // handleResume gate in LiveGame.tsx (early-returns when
  // quarterEndTriggeredRef.current === currentQuarter, so a
  // stray clock-pill tap can't undo the freeze).
  //
  // These tests pin the helper's freeze contract — if anyone
  // ever changes clockElapsedMs to inadvertently consult
  // Date.now() when paused, the tests go red.

  test("paused clock stays frozen across many consecutive calls", () => {
    const opts = { clockStartedAt: null, accumulatedMs: 720_000 };
    const t0 = clockElapsedMs(opts);
    const t1 = clockElapsedMs(opts);
    const t2 = clockElapsedMs(opts);
    expect(t0).toBe(t1);
    expect(t1).toBe(t2);
    expect(t0).toBe(720_000);
  });

  test("pause-then-resume math: accumulatedMs is the snapshot of paused elapsed", () => {
    // Simulates a quarter that ran 60s, was paused (snapshotting
    // 60_000 into accumulatedMs), then resumed. Once resumed the
    // helper adds the wall-clock delta on top.
    const pausedSnapshot = clockElapsedMs({
      clockStartedAt: null,
      accumulatedMs: 60_000,
    });
    expect(pausedSnapshot).toBe(60_000);

    // 2s later we resume.
    const resumedAt = Date.now() - 2_000;
    const afterResume = clockElapsedMs({
      clockStartedAt: resumedAt,
      accumulatedMs: 60_000,
    });
    expect(afterResume).toBeGreaterThanOrEqual(61_950);
    expect(afterResume).toBeLessThanOrEqual(62_050);
  });

  test("zero accumulated, paused → 0", () => {
    expect(
      clockElapsedMs({ clockStartedAt: null, accumulatedMs: 0 }),
    ).toBe(0);
  });
});
