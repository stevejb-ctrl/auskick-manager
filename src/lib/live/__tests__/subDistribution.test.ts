import { describe, it, expect } from "vitest";
import {
  subDueBoundariesMs,
  nextSubBoundaryMs,
  subSpacingMs,
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
