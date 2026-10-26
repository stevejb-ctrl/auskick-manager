import { describe, expect, it } from "vitest";
import { wholePercents } from "@/lib/percentages";

describe("wholePercents", () => {
  it("adds up to 100 where rounding each share wouldn't", () => {
    // 30.4 / 55.4 / 14.2 rounded one by one is 30 + 55 + 14 = 99, and
    // 19.4 / 69.4 / 11.2 is 19 + 69 + 11 = 99 (the rows the pass found).
    for (const values of [[304, 554, 142], [194, 694, 112]]) {
      const pcts = wholePercents(values);
      expect(pcts.reduce((a, b) => a + b, 0)).toBe(100);
      pcts.forEach((p, i) => expect(Math.abs(p - values[i] / 10)).toBeLessThan(1));
    }
    expect(wholePercents([304, 556, 140])).toEqual([30, 56, 14]);
    // Thirds: 33.3 each would be 99.
    expect(wholePercents([1, 1, 1])).toEqual([34, 33, 33]);
  });

  it("leaves exact shares alone", () => {
    expect(wholePercents([1, 1, 2])).toEqual([25, 25, 50]);
    expect(wholePercents([0, 5, 0])).toEqual([0, 100, 0]);
  });

  it("is all zero with nothing to share", () => {
    expect(wholePercents([0, 0, 0])).toEqual([0, 0, 0]);
    expect(wholePercents([])).toEqual([]);
  });

  it("always sums to 100 for any non-empty spread", () => {
    for (let n = 0; n < 500; n++) {
      const values = Array.from({ length: 2 + (n % 7) }, (_, i) => ((n * 7919 + i * 104729) % 997) + 1);
      expect(wholePercents(values).reduce((a, b) => a + b, 0)).toBe(100);
    }
  });
});
