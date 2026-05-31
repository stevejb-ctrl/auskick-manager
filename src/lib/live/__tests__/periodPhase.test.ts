import { describe, expect, it } from "vitest";

import { periodPhase } from "@/lib/live/periodPhase";

describe("periodPhase", () => {
  // periodCount = 4 (AFL / netball)
  it("4-of-4 ended (not finalised) → full time, last period, not between", () => {
    const r = periodPhase(4, 4, true, false);
    expect(r.isAtFullTime).toBe(true);
    expect(r.isBetweenPeriods).toBe(false);
    expect(r.isLastPeriod).toBe(true);
  });

  it("3-of-4 ended → between periods, not full time, not last period", () => {
    const r = periodPhase(3, 4, true, false);
    expect(r.isAtFullTime).toBe(false);
    expect(r.isBetweenPeriods).toBe(true);
    expect(r.isLastPeriod).toBe(false);
  });

  // periodCount = 2 (rugby league halves)
  it("2-of-2 ended (not finalised) → full time, last period, not between", () => {
    const r = periodPhase(2, 2, true, false);
    expect(r.isAtFullTime).toBe(true);
    expect(r.isBetweenPeriods).toBe(false);
    expect(r.isLastPeriod).toBe(true);
  });

  it("1-of-2 ended → between periods, not full time, not last period", () => {
    const r = periodPhase(1, 2, true, false);
    expect(r.isAtFullTime).toBe(false);
    expect(r.isBetweenPeriods).toBe(true);
    expect(r.isLastPeriod).toBe(false);
  });

  // finalised owns full time — the finished branch handles it, not this helper
  it("finalised → isAtFullTime false even at the last period", () => {
    const r = periodPhase(4, 4, true, true);
    expect(r.isAtFullTime).toBe(false);
  });

  // mid-period (period not ended) is not a boundary
  it("mid-period not ended → neither full time nor between periods", () => {
    const r = periodPhase(2, 4, false, false);
    expect(r.isAtFullTime).toBe(false);
    expect(r.isBetweenPeriods).toBe(false);
  });
});
