import { describe, it, expect } from "vitest";
import { isFinalSubWindow, canPlanNextPeriod, subMinutesFrom } from "@/lib/live/subCadence";

// 12-min quarter, 4-min sub interval → final window opens at 8 min.
const Q = 12 * 60_000;
const INT = 4 * 60_000;

describe("isFinalSubWindow", () => {
  it("is false earlier in the period (more subs still queued)", () => {
    expect(isFinalSubWindow({ nowMs: 0, quarterMs: Q, effectiveSubIntervalMs: INT })).toBe(false);
    expect(isFinalSubWindow({ nowMs: 4 * 60_000, quarterMs: Q, effectiveSubIntervalMs: INT })).toBe(false);
    // 7:59 — one second before the final window opens.
    expect(isFinalSubWindow({ nowMs: 8 * 60_000 - 1000, quarterMs: Q, effectiveSubIntervalMs: INT })).toBe(false);
  });

  it("is true once less than one interval remains before the hooter", () => {
    expect(isFinalSubWindow({ nowMs: 8 * 60_000, quarterMs: Q, effectiveSubIntervalMs: INT })).toBe(true);
    expect(isFinalSubWindow({ nowMs: 11 * 60_000, quarterMs: Q, effectiveSubIntervalMs: INT })).toBe(true);
  });

  it("guards against a non-running / mis-configured clock", () => {
    expect(isFinalSubWindow({ nowMs: 0, quarterMs: 0, effectiveSubIntervalMs: INT })).toBe(false);
    expect(isFinalSubWindow({ nowMs: 100, quarterMs: Q, effectiveSubIntervalMs: 0 })).toBe(false);
  });
});

describe("canPlanNextPeriod", () => {
  const base = {
    isLivePlay: true,
    isLastPeriod: false,
    inFinalWindow: false,
    subPastHooter: false,
    hasSwappableBench: true,
  };

  it("THE BUG: a no-subs game can plan the next period any time", () => {
    // Empty/zero swappable bench → no rotations ever → available all
    // quarter, even early when not in the final window (Steve 2026-06-13).
    expect(canPlanNextPeriod({ ...base, hasSwappableBench: false })).toBe(true);
  });

  it("is available in the final sub window (existing behaviour)", () => {
    expect(canPlanNextPeriod({ ...base, inFinalWindow: true })).toBe(true);
  });

  it("is available once the next sub falls past the hooter", () => {
    expect(canPlanNextPeriod({ ...base, subPastHooter: true })).toBe(true);
  });

  it("is hidden mid-quarter while subs are still queued", () => {
    expect(canPlanNextPeriod(base)).toBe(false);
  });

  it("is never offered on the last period or outside live play", () => {
    expect(canPlanNextPeriod({ ...base, isLastPeriod: true, hasSwappableBench: false })).toBe(false);
    expect(canPlanNextPeriod({ ...base, isLivePlay: false, inFinalWindow: true })).toBe(false);
  });
});

// The lineup box shows the minutes the game uses (Stagehand
// sideline-chaos-union, 16 Oct 2026: it said 15, the game used 10).
describe("subMinutesFrom", () => {
  it("clamps to 1–10 minutes", () => {
    expect(subMinutesFrom("15", 4)).toBe(10);
    expect(subMinutesFrom("0.5", 4)).toBe(1);
    expect(subMinutesFrom("-3", 4)).toBe(1);
    expect(subMinutesFrom("6.5", 4)).toBe(6.5);
  });

  it("falls back where the box isn't a number", () => {
    expect(subMinutesFrom("", 4)).toBe(4);
    expect(subMinutesFrom("0", 4)).toBe(4);
    expect(subMinutesFrom("abc", 12)).toBe(10);
  });
});
