import { describe, it, expect } from "vitest";
import {
  subDueBoundariesMs,
  nextSubBoundaryMs,
  subSpacingMs,
  subIntervalStartFloor,
  inSubCutoff,
} from "@/lib/live/subDistribution";

const MIN = 60_000;
const Q12 = 12 * MIN;

describe("subDueBoundariesMs", () => {
  it("spreads 3 subs across a 12-min quarter at 3, 6, 9 minutes", () => {
    expect(subDueBoundariesMs({ quarterMs: Q12, subsPerQuarter: 3 })).toEqual([
      3 * MIN,
      6 * MIN,
      9 * MIN,
    ]);
  });

  it("never lands a sub on the hooter (last boundary < quarterMs)", () => {
    const bs = subDueBoundariesMs({ quarterMs: Q12, subsPerQuarter: 5 });
    expect(bs).toHaveLength(5);
    expect(bs[bs.length - 1]).toBeLessThan(Q12);
    // 5 subs → sixths: 2,4,6,8,10 min.
    expect(bs).toEqual([2 * MIN, 4 * MIN, 6 * MIN, 8 * MIN, 10 * MIN]);
  });

  it("a single sub sits at half time", () => {
    expect(subDueBoundariesMs({ quarterMs: Q12, subsPerQuarter: 1 })).toEqual([
      6 * MIN,
    ]);
  });

  it("returns [] for a non-positive period or count", () => {
    expect(subDueBoundariesMs({ quarterMs: 0, subsPerQuarter: 3 })).toEqual([]);
    expect(subDueBoundariesMs({ quarterMs: Q12, subsPerQuarter: 0 })).toEqual([]);
  });
});

describe("nextSubBoundaryMs", () => {
  const base = { quarterMs: Q12, subsPerQuarter: 3 };
  it("returns the next boundary strictly after now", () => {
    expect(nextSubBoundaryMs({ ...base, nowMs: 0 })).toBe(3 * MIN);
    expect(nextSubBoundaryMs({ ...base, nowMs: 3 * MIN })).toBe(6 * MIN); // strictly after
    expect(nextSubBoundaryMs({ ...base, nowMs: 3 * MIN - 1 })).toBe(3 * MIN);
    expect(nextSubBoundaryMs({ ...base, nowMs: 7 * MIN })).toBe(9 * MIN);
  });

  it("returns null once the final boundary has passed (no more subs this period)", () => {
    expect(nextSubBoundaryMs({ ...base, nowMs: 9 * MIN })).toBeNull();
    expect(nextSubBoundaryMs({ ...base, nowMs: 11 * MIN })).toBeNull();
  });
});

describe("subSpacingMs", () => {
  it("is one slab = quarterMs/(N+1)", () => {
    expect(subSpacingMs({ quarterMs: Q12, subsPerQuarter: 3 })).toBe(3 * MIN);
    expect(subSpacingMs({ quarterMs: Q12, subsPerQuarter: 2 })).toBe(4 * MIN);
  });
});

// Sub windows (soccer plan): N windows a half, none in the final M
// minutes. The cutoff is shared, so any sport can use it; without one
// nothing changes.
describe("sub windows with a final-minutes cutoff", () => {
  const H30 = 30 * MIN;
  const H20 = 20 * MIN;

  it("changes nothing without a cutoff", () => {
    for (const quarterMs of [Q12, H20, H30, 10 * MIN + 7]) {
      for (let n = 1; n <= 8; n++) {
        const was = subDueBoundariesMs({ quarterMs, subsPerQuarter: n });
        expect(subDueBoundariesMs({ quarterMs, subsPerQuarter: n, cutoffMs: 0 })).toEqual(was);
        expect(subSpacingMs({ quarterMs, subsPerQuarter: n, cutoffMs: 0 })).toBe(subSpacingMs({ quarterMs, subsPerQuarter: n }));
      }
    }
  });

  it("keeps the even spread while its last window clears the cutoff (Tasmania: 3 a half, none in the last 2)", () => {
    expect(subDueBoundariesMs({ quarterMs: H30, subsPerQuarter: 3, cutoffMs: 2 * MIN })).toEqual([
      7.5 * MIN,
      15 * MIN,
      22.5 * MIN,
    ]);
    expect(subSpacingMs({ quarterMs: H30, subsPerQuarter: 3, cutoffMs: 2 * MIN })).toBe(7.5 * MIN);
  });

  it("pulls the windows in to end at the cutoff when the even spread would cross it", () => {
    // Six windows in a 20-min half would land the last at 17:09, inside
    // a 3-minute cutoff: they spread across the open 17 minutes instead.
    const bs = subDueBoundariesMs({ quarterMs: H20, subsPerQuarter: 6, cutoffMs: 3 * MIN });
    expect(bs).toHaveLength(6);
    expect(bs[bs.length - 1]).toBe(17 * MIN);
    expect(bs[0]).toBeCloseTo((17 * MIN) / 6);
    expect(subSpacingMs({ quarterMs: H20, subsPerQuarter: 6, cutoffMs: 3 * MIN })).toBeCloseTo((17 * MIN) / 6);
    // The spread is the same at the edge of the rule: 3 windows exactly
    // a slab (5 min) before the hooter.
    expect(subDueBoundariesMs({ quarterMs: H20, subsPerQuarter: 3, cutoffMs: 5 * MIN })).toEqual([5 * MIN, 10 * MIN, 15 * MIN]);
  });

  it("has no windows when the cutoff leaves no time open", () => {
    expect(subDueBoundariesMs({ quarterMs: H20, subsPerQuarter: 3, cutoffMs: H20 })).toEqual([]);
    expect(subDueBoundariesMs({ quarterMs: H20, subsPerQuarter: 3, cutoffMs: H20 + MIN })).toEqual([]);
    expect(subSpacingMs({ quarterMs: H20, subsPerQuarter: 3, cutoffMs: H20 })).toBe(0);
  });

  it("offers no window after the last one before the cutoff", () => {
    const half = { quarterMs: H20, subsPerQuarter: 6, cutoffMs: 3 * MIN };
    expect(nextSubBoundaryMs({ ...half, nowMs: 16 * MIN })).toBe(17 * MIN);
    expect(nextSubBoundaryMs({ ...half, nowMs: 17 * MIN })).toBeNull();
  });

  it("says when the clock is inside the cutoff (its edge is still open)", () => {
    const half = { quarterMs: H20, cutoffMs: 2 * MIN };
    expect(inSubCutoff({ ...half, nowMs: 17 * MIN })).toBe(false);
    expect(inSubCutoff({ ...half, nowMs: 18 * MIN })).toBe(false);
    expect(inSubCutoff({ ...half, nowMs: 18 * MIN + 1 })).toBe(true);
    expect(inSubCutoff({ quarterMs: H20, nowMs: H20 - 1 })).toBe(false);
  });
});

describe("subIntervalStartFloor (issues 4 & 5)", () => {
  const INT = 3 * MIN; // 3-min interval grid

  it("floors elapsed onto the interval grid (remount-safe seed)", () => {
    // At 4:30 the current interval started at the 3:00 boundary.
    expect(subIntervalStartFloor({ nowMs: 4.5 * MIN, intervalMs: INT })).toBe(3 * MIN);
    // At 7:00 → the 6:00 boundary.
    expect(subIntervalStartFloor({ nowMs: 7 * MIN, intervalMs: INT })).toBe(6 * MIN);
  });

  it("is stable across a remount — same clock elapsed → same start", () => {
    // The whole point of issue 4: leaving + returning recomputes the
    // same elapsed (clock is timestamp-derived), so the floor is equal
    // and the countdown resumes instead of resetting.
    const before = subIntervalStartFloor({ nowMs: 5 * MIN, intervalMs: INT });
    const afterRemount = subIntervalStartFloor({ nowMs: 5 * MIN, intervalMs: INT });
    expect(afterRemount).toBe(before);
    // And the remaining time it implies is preserved:
    const remaining = (start: number, now: number) => start + INT - now;
    expect(remaining(before, 5 * MIN)).toBe(remaining(afterRemount, 5 * MIN));
  });

  it("is 0 before the first boundary and for a non-positive interval", () => {
    expect(subIntervalStartFloor({ nowMs: 1.5 * MIN, intervalMs: INT })).toBe(0);
    expect(subIntervalStartFloor({ nowMs: 0, intervalMs: INT })).toBe(0);
    expect(subIntervalStartFloor({ nowMs: 5 * MIN, intervalMs: 0 })).toBe(0);
  });
});
