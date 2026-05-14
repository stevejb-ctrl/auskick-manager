// Math coverage for PulsingNumber's count-up. The component
// itself is React + requestAnimationFrame which is hard to test
// in isolation without RTL; the pure easing + interpolation
// functions are exported alongside so the perceived feel of
// the animation can be pinned here independently.
//
// P0-6 in .planning/MICRO-INTERACTIONS-PLAN.md — the count-up
// reads as "the number has arrived" via cubic-out easing. Linear
// easing would read as "still arriving" and feels less confident.

import { describe, expect, test } from "vitest";
import { countUpAt, easeOutCubic } from "../animation/countUp";

describe("easeOutCubic — cubic-out curve", () => {
  test("hits the endpoints exactly (t=0 → 0, t=1 → 1)", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  test("at t=0.5 returns 0.875 — the curve's hallmark midpoint", () => {
    // 1 - (1 - 0.5)^3 = 1 - 0.125 = 0.875
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 4);
  });

  test("front-loads: at t=0.25 we're already past 50%", () => {
    // 1 - (0.75)^3 = 1 - 0.421875 = 0.578125
    expect(easeOutCubic(0.25)).toBeCloseTo(0.578, 3);
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.5);
  });

  test("decelerates: at t=0.75 we're at ~98% (the slow finish)", () => {
    // 1 - (0.25)^3 = 1 - 0.015625 = 0.984375
    expect(easeOutCubic(0.75)).toBeCloseTo(0.984, 3);
  });
});

describe("countUpAt — eased interpolation with rounding", () => {
  test("at t=0 returns from-value exactly", () => {
    expect(countUpAt(10, 20, 0)).toBe(10);
  });

  test("at t=1 returns to-value exactly", () => {
    expect(countUpAt(10, 20, 1)).toBe(20);
  });

  test("clamps negative t to 0", () => {
    expect(countUpAt(10, 20, -0.5)).toBe(10);
  });

  test("clamps t > 1 to 1", () => {
    expect(countUpAt(10, 20, 1.5)).toBe(20);
  });

  test("from=12, to=18 ramps through integer values", () => {
    // Round trip across the cubic-out curve, hitting integers as it goes.
    // At t=0.25 → eased=0.578 → 12 + 6*0.578 = 15.47 → round = 15
    // At t=0.5  → eased=0.875 → 12 + 6*0.875 = 17.25 → round = 17
    // At t=0.75 → eased=0.984 → 12 + 6*0.984 = 17.91 → round = 18
    expect(countUpAt(12, 18, 0)).toBe(12);
    expect(countUpAt(12, 18, 0.25)).toBe(15);
    expect(countUpAt(12, 18, 0.5)).toBe(17);
    expect(countUpAt(12, 18, 0.75)).toBe(18);
    expect(countUpAt(12, 18, 1)).toBe(18);
  });

  test("monotonically increases from from→to over t∈[0,1]", () => {
    let prev = -Infinity;
    for (let t = 0; t <= 1.001; t += 0.05) {
      const v = countUpAt(0, 100, t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  test("supports counting down (negative delta) symmetrically", () => {
    // E.g. an undo: from=18, to=12.
    expect(countUpAt(18, 12, 0)).toBe(18);
    expect(countUpAt(18, 12, 1)).toBe(12);
    // At t=0.5 should be 18 - 0.875 * 6 = 12.75 → round = 13
    expect(countUpAt(18, 12, 0.5)).toBe(13);
  });

  test("from===to is a constant — no movement regardless of t", () => {
    for (const t of [0, 0.25, 0.5, 1, 2]) {
      expect(countUpAt(7, 7, t)).toBe(7);
    }
  });
});
