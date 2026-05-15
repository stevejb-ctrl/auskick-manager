// Coverage for the netball quarter-clock calculation. Pinned here
// after Steve's 2026-05-15 bug report: "at the end of a quarter
// the player time continues to accrue, rather than pausing with
// the clock". Player time on each tile is derived from clockMs;
// the freeze invariant tested here is what stops the accrual.
//
// The bug pre-fix: the auto-hooter useEffect in NetballLiveGame
// fired `endNetballQuarter` server-side but did NOT call
// `setPausedAtMs(Date.now())`, so this helper continued seeing
// `pausedAtMs === null` and returned the live `nowMs - startedAt`
// — meaning clockMs kept ticking up between hooter and the
// server-confirmed quarter_end refresh.
//
// These tests pin the helper's freeze contract. The matching
// call-site fix lives in NetballLiveGame.tsx — the hooter
// useEffect sets pausedAtMs immediately so the live tick falls
// through to the paused branch.

import { describe, expect, test } from "vitest";
import { computeNetballClockMs } from "../sports/netball/clock";

describe("computeNetballClockMs — base states", () => {
  test("pre-Q1 returns 0 regardless of other state", () => {
    expect(
      computeNetballClockMs({
        currentQuarter: 0,
        quarterEnded: false,
        finalised: false,
        quarterStartedAtMs: 1000,
        pausedAtMs: null,
        accumulatedPauseMs: 0,
        fallbackElapsedMs: 999_999,
        clockMultiplier: 1,
        nowMs: 60_000,
      }),
    ).toBe(0);
  });

  test("quarterEnded falls back to server metadata", () => {
    expect(
      computeNetballClockMs({
        currentQuarter: 2,
        quarterEnded: true,
        finalised: false,
        quarterStartedAtMs: 1000,
        pausedAtMs: null,
        accumulatedPauseMs: 0,
        fallbackElapsedMs: 600_000,
        clockMultiplier: 1,
        nowMs: 99_999_999,
      }),
    ).toBe(600_000);
  });

  test("finalised falls back to server metadata", () => {
    expect(
      computeNetballClockMs({
        currentQuarter: 4,
        quarterEnded: false,
        finalised: true,
        quarterStartedAtMs: 1000,
        pausedAtMs: null,
        accumulatedPauseMs: 0,
        fallbackElapsedMs: 600_000,
        clockMultiplier: 1,
        nowMs: 99_999_999,
      }),
    ).toBe(600_000);
  });

  test("null quarterStartedAtMs falls back to server metadata", () => {
    expect(
      computeNetballClockMs({
        currentQuarter: 1,
        quarterEnded: false,
        finalised: false,
        quarterStartedAtMs: null,
        pausedAtMs: null,
        accumulatedPauseMs: 0,
        fallbackElapsedMs: 0,
        clockMultiplier: 1,
        nowMs: 60_000,
      }),
    ).toBe(0);
  });
});

describe("computeNetballClockMs — live tick", () => {
  test("running clock returns nowMs - startedAt", () => {
    const startedAt = 1000;
    const nowMs = 61_000;
    // 60-second elapsed, no multiplier
    expect(
      computeNetballClockMs({
        currentQuarter: 1,
        quarterEnded: false,
        finalised: false,
        quarterStartedAtMs: startedAt,
        pausedAtMs: null,
        accumulatedPauseMs: 0,
        fallbackElapsedMs: 0,
        clockMultiplier: 1,
        nowMs,
      }),
    ).toBe(60_000);
  });

  test("running clock subtracts accumulated pauses", () => {
    expect(
      computeNetballClockMs({
        currentQuarter: 1,
        quarterEnded: false,
        finalised: false,
        quarterStartedAtMs: 1000,
        pausedAtMs: null,
        accumulatedPauseMs: 20_000,
        fallbackElapsedMs: 0,
        clockMultiplier: 1,
        nowMs: 61_000,
      }),
    ).toBe(40_000); // 60s wall-clock - 20s of paused time = 40s of game time
  });

  test("clockMultiplier scales the elapsed value", () => {
    expect(
      computeNetballClockMs({
        currentQuarter: 1,
        quarterEnded: false,
        finalised: false,
        quarterStartedAtMs: 1000,
        pausedAtMs: null,
        accumulatedPauseMs: 0,
        fallbackElapsedMs: 0,
        clockMultiplier: 8, // demo mode
        nowMs: 16_000, // 15s wall-clock
      }),
    ).toBe(120_000); // 15s × 8 = 2 minutes of game time
  });

  test("clamps at 0 when nowMs < startedAt (clock skew defense)", () => {
    expect(
      computeNetballClockMs({
        currentQuarter: 1,
        quarterEnded: false,
        finalised: false,
        quarterStartedAtMs: 60_000,
        pausedAtMs: null,
        accumulatedPauseMs: 0,
        fallbackElapsedMs: 0,
        clockMultiplier: 1,
        nowMs: 30_000,
      }),
    ).toBe(0);
  });
});

describe("computeNetballClockMs — freeze invariant", () => {
  // THE LOAD-BEARING TESTS for the 2026-05-15 player-time-accrues
  // bug fix. If `pausedAtMs` is set, the helper MUST freeze at
  // that moment regardless of how far nowMs has advanced.
  //
  // The auto-hooter in NetballLiveGame sets pausedAtMs when the
  // quarter timer reaches zero. Without this freeze the hooter
  // would set a flag but clockMs would keep ticking from
  // nowMs, and player tile time would keep accruing during the
  // ~100-500ms (often longer on slow networks) between hooter
  // fire and the server-confirmed quarter_end refresh landing.

  test("paused clock freezes at pausedAtMs - startedAt", () => {
    const startedAt = 1000;
    const pausedAt = 61_000; // 60s in
    expect(
      computeNetballClockMs({
        currentQuarter: 1,
        quarterEnded: false,
        finalised: false,
        quarterStartedAtMs: startedAt,
        pausedAtMs: pausedAt,
        accumulatedPauseMs: 0,
        fallbackElapsedMs: 0,
        clockMultiplier: 1,
        nowMs: 999_999, // simulating "much later"
      }),
    ).toBe(60_000);
  });

  test("paused clock stays frozen even if nowMs advances dramatically", () => {
    // The defining test for the bug fix — call the helper many
    // times with increasing nowMs. While pausedAtMs is set, every
    // call returns the same value.
    const opts = {
      currentQuarter: 1,
      quarterEnded: false,
      finalised: false,
      quarterStartedAtMs: 1000,
      pausedAtMs: 600_000, // hooter fires at 10min mark
      accumulatedPauseMs: 0,
      fallbackElapsedMs: 0,
      clockMultiplier: 1,
    };
    const t0 = computeNetballClockMs({ ...opts, nowMs: 600_001 });
    const t1 = computeNetballClockMs({ ...opts, nowMs: 601_000 });
    const t2 = computeNetballClockMs({ ...opts, nowMs: 610_000 });
    const t3 = computeNetballClockMs({ ...opts, nowMs: 999_999 });
    expect(t0).toBe(t1);
    expect(t1).toBe(t2);
    expect(t2).toBe(t3);
    expect(t0).toBe(599_000); // pausedAt - startedAt
  });

  test("freeze respects accumulated pauses earlier in the quarter", () => {
    // Coach paused at 2min, resumed at 3min (20s of paused time
    // accumulated), then the hooter fires at the 11-min mark
    // (10min of effective game time).
    expect(
      computeNetballClockMs({
        currentQuarter: 1,
        quarterEnded: false,
        finalised: false,
        quarterStartedAtMs: 0,
        pausedAtMs: 11 * 60_000, // 11 min wall
        accumulatedPauseMs: 60_000, // 1 min of prior paused time
        fallbackElapsedMs: 0,
        clockMultiplier: 1,
        nowMs: 12 * 60_000,
      }),
    ).toBe(10 * 60_000); // 10 min effective
  });

  test("freeze respects clockMultiplier", () => {
    expect(
      computeNetballClockMs({
        currentQuarter: 1,
        quarterEnded: false,
        finalised: false,
        quarterStartedAtMs: 0,
        pausedAtMs: 60_000, // 1min wall
        accumulatedPauseMs: 0,
        fallbackElapsedMs: 0,
        clockMultiplier: 8,
        nowMs: 120_000,
      }),
    ).toBe(480_000); // 60s × 8 = 8 minutes, frozen at pause
  });
});
