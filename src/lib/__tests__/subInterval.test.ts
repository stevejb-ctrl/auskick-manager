// SUB-02 / F4 — derive the sub interval from the period length.
//
// Coaches shouldn't hand-tune a sub cadence per age group. The interval
// should fall out of the period length: pick the smallest CLEAN (evenly-
// dividing) divisor of the period that is >= the age group's
// `subIntervalFloorSeconds`. "Clean" means the period splits into equal
// stints with no ragged remainder — every kid's shift is the same length
// and the last stint isn't a stub. When no clean divisor >= floor exists
// (e.g. a prime period), fall back to the nearest even split that still
// clears the floor; if even that can't beat the floor, run the whole
// period as one stint.
//
// This file is RED until `@/lib/sports/subInterval` exists.

import { describe, expect, it } from "vitest";
import { deriveSubIntervalSeconds } from "@/lib/sports/subInterval";
import { aflSport } from "@/lib/sports/afl";
import { netballSport } from "@/lib/sports/netball";
import { rugbyLeagueSport } from "@/lib/sports/rugby_league";
import type { SportConfig } from "@/lib/sports/types";

describe("deriveSubIntervalSeconds — contract", () => {
  it("rugby league quarter (480s) floors at 240 → 240 (clean half-period split)", () => {
    // 480 / 240 = 2 stints exactly. 240 IS the floor and divides cleanly.
    expect(deriveSubIntervalSeconds(480, 240)).toBe(240);
  });

  it("rugby league half (1200s) floors at 240 → 240, NOT the old hand-set 600", () => {
    // 1200 / 240 = 5 stints exactly. The smallest clean divisor >= 240 is
    // 240 itself (1200 % 240 === 0), so we get 5 short fair stints rather
    // than the previous hand-set 600 (two long halves).
    expect(deriveSubIntervalSeconds(1200, 240)).toBe(240);
  });

  it("netball period (600s) floors at 240 → 300 (240 does not divide 600)", () => {
    // 600 % 240 !== 0, so 240 is rejected. Walk up: 241..299 don't divide
    // 600 either; 300 is the first clean divisor >= 240 (600 / 300 = 2).
    expect(deriveSubIntervalSeconds(600, 240)).toBe(300);
  });
});

describe("deriveSubIntervalSeconds — floor is never undershot", () => {
  it("the derived interval is always >= the floor for realistic period lengths", () => {
    for (const period of [300, 480, 600, 720, 900, 1200]) {
      expect(deriveSubIntervalSeconds(period, 240)).toBeGreaterThanOrEqual(240);
    }
  });
});

describe("deriveSubIntervalSeconds — degenerate periods", () => {
  it("period equal to the floor returns the whole period (one stint)", () => {
    expect(deriveSubIntervalSeconds(240, 240)).toBe(240);
  });

  it("period shorter than the floor returns the whole period (one stint)", () => {
    // Can't carve a >=240 stint out of a 180s period — run it whole.
    expect(deriveSubIntervalSeconds(180, 240)).toBe(180);
  });
});

describe("deriveSubIntervalSeconds — near-even fallback for indivisible periods", () => {
  it("prime period with room for >=2 stints uses the rounded even split", () => {
    // 251 is prime → no clean divisor in [120, 250]. floor(251/120) = 2
    // stints fit, so split into 2: round(251 / 2) = 126 (>= floor 120).
    expect(deriveSubIntervalSeconds(251, 120)).toBe(126);
  });

  it("indivisible period with room for only 1 stint runs whole", () => {
    // floor(130/70) = 1 → can't fit two >=70 stints → run the 130 whole.
    expect(deriveSubIntervalSeconds(130, 70)).toBe(130);
  });
});

describe("deriveSubIntervalSeconds — wired into every shipped age group", () => {
  // The whole point of F4: every age group's subIntervalSeconds must be the
  // DERIVED value, not a hand-set literal. Iterate the real configs and
  // assert each one matches what the pure function produces from its own
  // periodSeconds + floor. This catches any age group someone forgets to
  // rewire (or rewires with the wrong floor).
  const sports: Array<[string, SportConfig]> = [
    ["afl", aflSport],
    ["netball", netballSport],
    ["rugby_league", rugbyLeagueSport],
  ];

  for (const [name, sport] of sports) {
    for (const ag of sport.ageGroups) {
      it(`${name}/${ag.id}: subIntervalSeconds is derived from period + floor`, () => {
        expect(ag.subIntervalSeconds).toBe(
          deriveSubIntervalSeconds(ag.periodSeconds, ag.subIntervalFloorSeconds),
        );
      });
    }
  }
});
