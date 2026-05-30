// Pre-game rotation plan — manual-tweak (swap) unit tests.
//
// The coach auto-suggests a plan, then taps two players to swap them
// before copying. swapPlayersInPeriod is the pure operation behind that
// gesture. These tests pin that a swap:
//   • exchanges the two players' slots in exactly the target period,
//   • leaves every other period untouched,
//   • keeps the period structurally valid (no dup, field size held),
//   • recomputes per-player totals when a swap crosses field↔bench,
//   • never mutates the input plan, and no-ops on bad input.

import { describe, it, expect } from "vitest";
import { projectGamePlan, swapPlayersInPeriod } from "@/lib/game-plan";
import type { GamePlan } from "@/lib/game-plan";
import { getAgeGroupConfig } from "@/lib/sports/registry";

function makeSquad(size: number): { id: string }[] {
  return Array.from({ length: size }, (_, i) => ({
    id: `P${(i + 1).toString().padStart(2, "0")}`,
  }));
}

function onFieldIds(plan: GamePlan, periodIndex: number): string[] {
  return plan.periods[periodIndex].groups.flatMap((g) => g.playerIds);
}

function periodsOnFieldOf(plan: GamePlan, id: string): number {
  return plan.totals.find((t) => t.playerId === id)?.periodsOnField ?? -1;
}

function aflPlan(): GamePlan {
  const ageGroup = getAgeGroupConfig("afl", "U10");
  return projectGamePlan({
    sport: "afl",
    ageGroup,
    players: makeSquad(15),
    onFieldSize: 12,
    seed: 7,
  });
}

describe("swapPlayersInPeriod — field ↔ bench (a substitution)", () => {
  const plan = aflPlan();
  // Q1 (index 0): pick an on-field player and a benched player.
  const onField = onFieldIds(plan, 0)[0];
  const benched = plan.periods[0].bench[0];
  const swapped = swapPlayersInPeriod(plan, 0, onField, benched);

  it("brings the benched player on and sits the field player", () => {
    const newField = new Set(onFieldIds(swapped, 0));
    expect(newField.has(benched)).toBe(true);
    expect(newField.has(onField)).toBe(false);
    expect(swapped.periods[0].bench).toContain(onField);
    expect(swapped.periods[0].bench).not.toContain(benched);
  });

  it("holds the on-field size and accounts for everyone once", () => {
    const field = onFieldIds(swapped, 0);
    const all = [...field, ...swapped.periods[0].bench];
    expect(field.length).toBe(onFieldIds(plan, 0).length);
    expect(new Set(all).size).toBe(all.length);
  });

  it("recomputes starts: the subbed-on gains a period, the other loses one", () => {
    expect(periodsOnFieldOf(swapped, benched)).toBe(
      periodsOnFieldOf(plan, benched) + 1,
    );
    expect(periodsOnFieldOf(swapped, onField)).toBe(
      periodsOnFieldOf(plan, onField) - 1,
    );
  });

  it("keeps minutes even across the squad (rolling subs are swap-invariant)", () => {
    // This is a rotating AFL plan (15 in a 12-spot squad), so rolling
    // subs spread time evenly — a starter↔interchange swap changes who
    // *starts*, not anyone's planned minutes.
    expect(plan.rotatesWithinPeriod).toBe(true);
    const minutes = new Set(swapped.totals.map((t) => t.minutes));
    expect(minutes.size).toBe(1);
    expect(swapped.totals[0].minutes).toBe(plan.totals[0].minutes);
  });

  it("leaves the other periods untouched", () => {
    for (let i = 1; i < plan.periods.length; i++) {
      expect(swapped.periods[i]).toEqual(plan.periods[i]);
    }
  });

  it("does not mutate the input plan", () => {
    expect(new Set(onFieldIds(plan, 0)).has(onField)).toBe(true);
    expect(plan.periods[0].bench).toContain(benched);
  });
});

describe("swapPlayersInPeriod — field ↔ field (trade zones)", () => {
  const plan = aflPlan();

  it("exchanges two on-field players' groups without changing totals", () => {
    // Two players in different groups in Q1.
    const g0 = plan.periods[0].groups[0].playerIds[0];
    const g1 = plan.periods[0].groups[1].playerIds[0];
    const swapped = swapPlayersInPeriod(plan, 0, g0, g1);

    expect(swapped.periods[0].groups[0].playerIds).toContain(g1);
    expect(swapped.periods[0].groups[1].playerIds).toContain(g0);
    // Both stayed on field, so period counts are unchanged.
    expect(periodsOnFieldOf(swapped, g0)).toBe(periodsOnFieldOf(plan, g0));
    expect(periodsOnFieldOf(swapped, g1)).toBe(periodsOnFieldOf(plan, g1));
  });
});

describe("swapPlayersInPeriod — guards", () => {
  const plan = aflPlan();

  it("no-ops when the two ids are the same", () => {
    const id = onFieldIds(plan, 0)[0];
    expect(swapPlayersInPeriod(plan, 0, id, id)).toBe(plan);
  });

  it("no-ops on an out-of-range period", () => {
    const [a, b] = onFieldIds(plan, 0);
    expect(swapPlayersInPeriod(plan, 99, a, b)).toBe(plan);
  });

  it("no-ops when an id is not present in the period", () => {
    const a = onFieldIds(plan, 0)[0];
    expect(swapPlayersInPeriod(plan, 0, a, "GHOST")).toBe(plan);
  });
});
