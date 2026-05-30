// Pre-game rotation plan — projector unit tests.
//
// The projector loops each sport's fairness engine across every
// period of a game (AFL zone-minutes, netball position-counts) or, for
// rugby league, a block-based bench-fair rotation. These tests pin the
// invariants a coach relies on when reading a pre-game plan:
//
//   • Structural: every period fills the on-field size, everyone is
//     accounted for (on-field XOR bench), no one is double-booked.
//   • Fairness: bench time is shared evenly (within the sport's natural
//     granularity).
//   • Rotation: AFL/netball move kids across zones/positions; RL keeps
//     each on-field run unbroken within a block (Law 6).

import { describe, it, expect } from "vitest";
import { projectGamePlan } from "@/lib/game-plan";
import type { GamePlan } from "@/lib/game-plan";
import { getAgeGroupConfig } from "@/lib/sports/registry";
import type { SportId } from "@/lib/sports/types";

function makeSquad(size: number): { id: string }[] {
  return Array.from({ length: size }, (_, i) => ({
    id: `P${(i + 1).toString().padStart(2, "0")}`,
  }));
}

function onFieldIdsForPeriod(plan: GamePlan, periodIndex: number): string[] {
  return plan.periods[periodIndex].groups.flatMap((g) => g.playerIds);
}

// Structural invariants shared by every sport.
function assertStructurallyValid(
  plan: GamePlan,
  squadIds: string[],
  expectedOnField: number,
) {
  for (const period of plan.periods) {
    const onField = period.groups.flatMap((g) => g.playerIds);
    const all = [...onField, ...period.bench];

    // On-field size matches the target.
    expect(onField.length).toBe(expectedOnField);

    // No duplicates anywhere (across groups, and across field + bench).
    expect(new Set(all).size).toBe(all.length);

    // Everyone in the squad is accounted for exactly once.
    expect(new Set(all)).toEqual(new Set(squadIds));
    expect(all.length).toBe(squadIds.length);
  }
}

// Spread of on-field periods across the squad should be tight.
function periodsSpread(plan: GamePlan): number {
  const counts = plan.totals.map((t) => t.periodsOnField);
  return Math.max(...counts) - Math.min(...counts);
}

describe("projectGamePlan — AFL (zone-minutes, looped suggester)", () => {
  const ageGroup = getAgeGroupConfig("afl", "U10"); // 3-zone, rolling subs
  const onField = ageGroup.defaultOnFieldSize;
  const squad = makeSquad(onField + 3); // flex so 3 rotate through the bench

  const plan = projectGamePlan({
    sport: "afl",
    ageGroup,
    players: squad,
    onFieldSize: onField,
    seed: 7,
  });

  it("projects one period per quarter with Q-labels", () => {
    expect(plan.periods).toHaveLength(ageGroup.periodCount);
    expect(plan.periods.map((p) => p.label)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    expect(plan.periodLabel).toBe("quarter");
  });

  it("fills the field and accounts for everyone each quarter", () => {
    assertStructurallyValid(
      plan,
      squad.map((p) => p.id),
      onField,
    );
  });

  it("shares bench time evenly (max−min ≤ 1 quarter)", () => {
    expect(periodsSpread(plan)).toBeLessThanOrEqual(1);
  });

  it("rotates every full-game player through more than one zone", () => {
    for (const total of plan.totals) {
      if (total.periodsOnField !== ageGroup.periodCount) continue;
      const zones = new Set<string>();
      for (const period of plan.periods) {
        for (const g of period.groups) {
          if (g.playerIds.includes(total.playerId)) zones.add(g.groupId);
        }
      }
      // A kid who plays all four quarters must not be parked in one zone.
      expect(zones.size).toBeGreaterThan(1);
    }
  });

  it("flags rolling-sub rotation with the age-group's sub cadence", () => {
    expect(plan.rotatesWithinPeriod).toBe(true);
    expect(plan.subIntervalSeconds).toBe(ageGroup.subIntervalSeconds);
  });

  it("spreads planned minutes evenly — rolling subs, so no one sits a whole quarter", () => {
    // Field-minutes pool ÷ squad → the even share every present kid is
    // planned to get once the bench rotates through within each quarter.
    const perQuarter = ageGroup.periodSeconds / 60;
    const expected = Math.round(
      (onField * perQuarter * ageGroup.periodCount) / squad.length,
    );
    for (const total of plan.totals) {
      expect(total.minutes).toBe(expected);
    }
  });

  it("orders each quarter's interchange queue fewest-minutes-first", () => {
    // Banked minutes ∝ prior on-field quarters, so the queue must be
    // non-decreasing in each benched kid's prior-quarter start count —
    // the kid most owed game time comes on first.
    const priorStarts = (id: string, beforePeriod: number): number => {
      let n = 0;
      for (let i = 0; i < beforePeriod; i++) {
        for (const g of plan.periods[i].groups) {
          if (g.playerIds.includes(id)) n++;
        }
      }
      return n;
    };
    for (let pi = 0; pi < plan.periods.length; pi++) {
      const banked = plan.periods[pi].bench.map((id) => priorStarts(id, pi));
      const sorted = [...banked].sort((a, b) => a - b);
      expect(banked).toEqual(sorted);
    }
  });
});

describe("projectGamePlan — netball (position-counts, looped suggester)", () => {
  const ageGroup = getAgeGroupConfig("netball", "11u"); // 7 positions
  const onField = ageGroup.defaultOnFieldSize; // 7
  const squad = makeSquad(onField + 3); // 10: three rotate through the bench

  const plan = projectGamePlan({
    sport: "netball",
    ageGroup,
    players: squad,
    onFieldSize: onField,
    seed: 3,
  });

  it("projects one period per quarter and fills 7 positions", () => {
    expect(plan.periods).toHaveLength(4);
    for (const period of plan.periods) {
      expect(period.groups).toHaveLength(onField);
      for (const g of period.groups) {
        // Each netball position holds at most one player.
        expect(g.playerIds.length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("fills the court and accounts for everyone each quarter", () => {
    assertStructurallyValid(
      plan,
      squad.map((p) => p.id),
      onField,
    );
  });

  it("shares bench time evenly (max−min ≤ 1 quarter)", () => {
    expect(periodsSpread(plan)).toBeLessThanOrEqual(1);
  });

  it("rotates every multi-period player through more than one position", () => {
    for (const total of plan.totals) {
      if (total.periodsOnField < 2) continue;
      const positions: string[] = [];
      for (const period of plan.periods) {
        for (const g of period.groups) {
          if (g.playerIds.includes(total.playerId)) positions.push(g.groupId);
        }
      }
      // The suggester's tier-2 same-position penalty (−50000) is a strong
      // *soft* preference, not a hard constraint: a greedy last-assigned
      // slot can be forced to repeat a position when it's the only one
      // left. So we don't assert "never repeats" — we assert the
      // coach-facing promise that matters: a kid on court for 2+ periods
      // is never parked in a single spot. (Mirrors the AFL zone test.)
      expect(new Set(positions).size).toBeGreaterThan(1);
    }
  });
});

describe("projectGamePlan — rugby league (block-based bench-fair)", () => {
  describe("U9 — quarters, 2 unbroken-quarter blocks", () => {
    const ageGroup = getAgeGroupConfig("rugby_league", "U9");
    const onField = ageGroup.defaultOnFieldSize; // 8
    const squad = makeSquad(onField + 3); // 11

    const plan = projectGamePlan({
      sport: "rugby_league",
      ageGroup,
      players: squad,
      onFieldSize: onField,
      seed: 5,
    });

    it("projects four quarters split into forwards + backs", () => {
      expect(plan.periods).toHaveLength(4);
      expect(plan.periods.map((p) => p.label)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
      for (const period of plan.periods) {
        const [fwd, back] = period.groups;
        expect(fwd.groupId).toBe("forwards");
        expect(back.groupId).toBe("backs");
        expect(fwd.playerIds.length).toBe(ageGroup.forwardCount);
        expect(back.playerIds.length).toBe(onField - (ageGroup.forwardCount ?? 0));
      }
    });

    it("fills the field and accounts for everyone each quarter", () => {
      assertStructurallyValid(
        plan,
        squad.map((p) => p.id),
        onField,
      );
    });

    it("keeps each block's on-field set unbroken across its two quarters", () => {
      // minUnbrokenPeriods = 2 → blocks are [Q1,Q2] and [Q3,Q4].
      expect(new Set(onFieldIdsForPeriod(plan, 0))).toEqual(
        new Set(onFieldIdsForPeriod(plan, 1)),
      );
      expect(new Set(onFieldIdsForPeriod(plan, 2))).toEqual(
        new Set(onFieldIdsForPeriod(plan, 3)),
      );
    });

    it("shares bench time within one block's worth of periods", () => {
      // A benched player sits a whole 2-quarter block, so the spread is
      // bounded by the block size, not 1.
      expect(periodsSpread(plan)).toBeLessThanOrEqual(2);
    });
  });

  describe("U10 — halves, 1 unbroken-half blocks", () => {
    const ageGroup = getAgeGroupConfig("rugby_league", "U10");
    const onField = ageGroup.defaultOnFieldSize; // 11
    const squad = makeSquad(onField + 2); // 13

    const plan = projectGamePlan({
      sport: "rugby_league",
      ageGroup,
      players: squad,
      onFieldSize: onField,
      seed: 9,
    });

    it("projects two halves with H-labels", () => {
      expect(plan.periods).toHaveLength(2);
      expect(plan.periods.map((p) => p.label)).toEqual(["H1", "H2"]);
      expect(plan.periodLabel).toBe("half");
    });

    it("fills the field and accounts for everyone each half", () => {
      assertStructurallyValid(
        plan,
        squad.map((p) => p.id),
        onField,
      );
    });

    it("rotates the bench between halves so spread stays ≤ 1", () => {
      expect(periodsSpread(plan)).toBeLessThanOrEqual(1);
    });
  });
});

describe("projectGamePlan — short squad (fewer players than the field)", () => {
  it("everyone plays every period when squad ≤ on-field (AFL)", () => {
    const ageGroup = getAgeGroupConfig("afl", "U10");
    const squad = makeSquad(6); // well under the field size
    const plan = projectGamePlan({
      sport: "afl",
      ageGroup,
      players: squad,
      onFieldSize: 6,
      seed: 1,
    });
    for (const period of plan.periods) {
      const onFieldCount = period.groups.flatMap((g) => g.playerIds).length;
      expect(onFieldCount).toBe(6);
      expect(period.bench).toHaveLength(0);
    }
    // No bench → nothing to rotate, so the plan stays whole-quarter:
    // everyone plays every quarter, minutes are whole-quarter blocks.
    expect(plan.rotatesWithinPeriod).toBe(false);
    expect(plan.subIntervalSeconds).toBeUndefined();
    const perQuarter = ageGroup.periodSeconds / 60;
    for (const total of plan.totals) {
      expect(total.periodsOnField).toBe(ageGroup.periodCount);
      expect(total.minutes).toBe(Math.round(ageGroup.periodCount * perQuarter));
    }
  });
});

describe("projectGamePlan — determinism", () => {
  it("same seed + squad yields an identical plan", () => {
    const ageGroup = getAgeGroupConfig("afl", "U10");
    const squad = makeSquad(15);
    const input = {
      sport: "afl" as SportId,
      ageGroup,
      players: squad,
      onFieldSize: 12,
      seed: 42,
    };
    expect(projectGamePlan(input)).toEqual(projectGamePlan(input));
  });
});
