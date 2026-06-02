import { describe, it, expect } from "vitest";
import { isFinalSubWindow } from "@/lib/live/subCadence";

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
