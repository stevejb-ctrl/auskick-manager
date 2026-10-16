// Stagehand round 3: for a set-position team, Game plan listed kids under
// Back / Centre / Forward with no positions. A kid who plays ruck sat
// under "Centre" and parents couldn't tell who plays where.

import { describe, expect, it } from "vitest";
import { formatGamePlan, periodPositionLabels } from "@/lib/game-plan";
import type { GamePlan, GamePlanPeriod } from "@/lib/game-plan";

const aflPeriod: GamePlanPeriod = {
  period: 1,
  label: "Q1",
  groups: [
    { groupId: "back", groupLabel: "Back", playerIds: ["fb", "x1"] },
    { groupId: "mid", groupLabel: "Centre", playerIds: ["ru", "x2"] },
    { groupId: "fwd", groupLabel: "Forward", playerIds: ["ff", "x3"] },
  ],
  bench: ["b1"],
};

const aflPlaybook = {
  strategy: "set-positions",
  seasonWeight: 0,
  roles: {},
  positions: [
    { key: "fb", label: "FB", line: "back" as const },
    { key: "chb", label: "CHB", line: "back" as const },
    { key: "r", label: "R", line: "mid" as const },
    { key: "c", label: "C", line: "mid" as const },
    { key: "ff", label: "FF", line: "fwd" as const },
    { key: "chf", label: "CHF", line: "fwd" as const },
  ],
  positionRoles: {
    fb: { home: "fb", also: [], never: [] },
    ru: { home: "r", also: [], never: [] },
    ff: { home: "ff", also: [], never: [] },
  },
};

describe("periodPositionLabels", () => {
  it("AFL set positions: each on-field kid gets a position, homes first", () => {
    const labels = periodPositionLabels("afl", aflPeriod, { aflPlaybook });
    expect(labels).toMatchObject({ fb: "FB", ru: "R", ff: "FF", x1: "CHB", x2: "C", x3: "CHF" });
    expect(labels.b1).toBeUndefined();
  });

  it("no positions in force (or netball, whose groups are positions): none", () => {
    expect(periodPositionLabels("afl", aflPeriod, { aflPlaybook: { ...aflPlaybook, positions: [] } })).toEqual({});
    expect(periodPositionLabels("netball", aflPeriod, {})).toEqual({});
  });
});

describe("formatGamePlan with positions", () => {
  it("names each kid's position in the chat text", () => {
    const plan: GamePlan = {
      sport: "afl",
      periods: [aflPeriod],
      totals: [],
      periodLabel: "quarter",
      periodLabelPlural: "quarters",
      periodMinutes: 12,
      rotatesWithinPeriod: false,
    };
    const labels = periodPositionLabels("afl", aflPeriod, { aflPlaybook });
    const text = formatGamePlan(plan, {
      teamName: "Kew",
      playerName: (id) => id.toUpperCase(),
      positionLabel: (_period, id) => labels[id],
    });
    expect(text).toContain("Centre: RU (R), X2 (C)");
    expect(text).toContain("Bench: B1");
  });
});
