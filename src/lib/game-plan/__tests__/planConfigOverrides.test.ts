// Issue 8: the game plan must reflect THIS game's configured period
// length + sub cadence, not the age-group defaults. The live plan-ahead
// caller passes periodMinutes + subIntervalSeconds; without the override
// the plan showed a stale "4 min" default even when the game ran 3.

import { describe, it, expect } from "vitest";
import { projectGamePlan } from "@/lib/game-plan";
import { getAgeGroupConfig } from "@/lib/sports/registry";

function makeSquad(size: number): { id: string }[] {
  return Array.from({ length: size }, (_, i) => ({ id: `P${i + 1}` }));
}

describe("projectGamePlan — game-config overrides (issue 8)", () => {
  const ageGroup = getAgeGroupConfig("afl", "U10");
  const players = makeSquad(ageGroup.defaultOnFieldSize + 3);

  it("defaults periodMinutes to the age group when no override", () => {
    const plan = projectGamePlan({
      sport: "afl",
      ageGroup,
      players,
      onFieldSize: ageGroup.defaultOnFieldSize,
      seed: 7,
    });
    expect(plan.periodMinutes).toBe(ageGroup.periodSeconds / 60);
  });

  it("honours a periodMinutes override (3-min game, not the 4-min default)", () => {
    const plan = projectGamePlan({
      sport: "afl",
      ageGroup,
      players,
      onFieldSize: ageGroup.defaultOnFieldSize,
      seed: 7,
      periodMinutes: 3,
    });
    expect(plan.periodMinutes).toBe(3);
  });

  it("honours a subIntervalSeconds override on a rolling-sub sport", () => {
    const plan = projectGamePlan({
      sport: "afl",
      ageGroup,
      players,
      onFieldSize: ageGroup.defaultOnFieldSize,
      seed: 7,
      periodMinutes: 3,
      subIntervalSeconds: 45, // 3-min quarter / (3 subs + 1) = 45s spacing
    });
    expect(plan.rotatesWithinPeriod).toBe(true);
    expect(plan.subIntervalSeconds).toBe(45);
  });
});
