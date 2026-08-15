import { describe, expect, it } from "vitest";
import { clearPeriodToBench, setPeriodGroups, type GamePlan } from "@/lib/game-plan";

// Minimal two-period AFL plan: Q1 fields b/m/f pairs, Q2 rotates them.
function fixture(): GamePlan {
  return {
    sport: "afl",
    periodLabel: "quarter",
    periodLabelPlural: "quarters",
    periodMinutes: 12,
    rotatesWithinPeriod: true,
    subIntervalSeconds: 180,
    periods: [
      {
        period: 1,
        label: "Q1",
        groups: [
          { groupId: "back", groupLabel: "Back", playerIds: ["b1", "b2"] },
          { groupId: "mid", groupLabel: "Centre", playerIds: ["m1", "m2"] },
          { groupId: "fwd", groupLabel: "Forward", playerIds: ["f1", "f2"] },
        ],
        bench: ["x1"],
      },
      {
        period: 2,
        label: "Q2",
        groups: [
          { groupId: "back", groupLabel: "Back", playerIds: ["m1", "m2"] },
          { groupId: "mid", groupLabel: "Centre", playerIds: ["f1", "f2"] },
          { groupId: "fwd", groupLabel: "Forward", playerIds: ["b1", "x1"] },
        ],
        bench: ["b2"],
      },
    ],
    totals: [
      { playerId: "b1", periodsOnField: 2 },
      { playerId: "b2", periodsOnField: 1 },
      { playerId: "m1", periodsOnField: 2 },
      { playerId: "m2", periodsOnField: 2 },
      { playerId: "f1", periodsOnField: 2 },
      { playerId: "f2", periodsOnField: 2 },
      { playerId: "x1", periodsOnField: 1 },
    ],
  };
}

describe("clearPeriodToBench — the planner's 'Set manually' shortcut", () => {
  it("empties every group and moves on-field players to the front of the bench", () => {
    const out = clearPeriodToBench(fixture(), 1);
    const p2 = out.periods[1];
    expect(p2.groups.every((g) => g.playerIds.length === 0)).toBe(true);
    // On-field players (field order) precede the already-benched b2.
    expect(p2.bench).toEqual(["m1", "m2", "f1", "f2", "b1", "x1", "b2"]);
  });

  it("leaves other periods untouched and never mutates the input", () => {
    const input = fixture();
    const out = clearPeriodToBench(input, 1);
    expect(out.periods[0]).toEqual(input.periods[0]);
    expect(input.periods[1].groups[0].playerIds).toEqual(["m1", "m2"]);
  });

  it("recomputes totals so the cleared period no longer counts anyone on field", () => {
    const out = clearPeriodToBench(fixture(), 1);
    // Only Q1 still fields players → b1 drops from 2 periods-on-field to 1.
    expect(out.totals.find((t) => t.playerId === "b1")?.periodsOnField).toBe(1);
  });

  it("is a no-op for an out-of-range period", () => {
    const input = fixture();
    expect(clearPeriodToBench(input, 9)).toBe(input);
  });
});

describe("setPeriodGroups — wholesale period assignment (Rotate lines)", () => {
  it("replaces a period's groups + bench from an external assignment", () => {
    const out = setPeriodGroups(
      fixture(),
      1,
      { back: ["f1", "f2"], mid: ["b1", "b2"], fwd: ["m1", "m2"] },
      ["x1"],
    );
    const p2 = out.periods[1];
    expect(p2.groups.find((g) => g.groupId === "back")?.playerIds).toEqual(["f1", "f2"]);
    expect(p2.groups.find((g) => g.groupId === "fwd")?.playerIds).toEqual(["m1", "m2"]);
    expect(p2.bench).toEqual(["x1"]);
  });

  it("empties a group not named in the assignment", () => {
    const out = setPeriodGroups(fixture(), 1, { back: ["b1", "b2"] }, ["m1", "m2", "f1", "f2", "x1"]);
    const p2 = out.periods[1];
    expect(p2.groups.find((g) => g.groupId === "mid")?.playerIds).toEqual([]);
    expect(p2.groups.find((g) => g.groupId === "fwd")?.playerIds).toEqual([]);
  });

  it("never mutates the input", () => {
    const input = fixture();
    setPeriodGroups(input, 1, { back: ["z1"] }, []);
    expect(input.periods[1].groups.find((g) => g.groupId === "back")?.playerIds).toEqual(["m1", "m2"]);
  });
});
