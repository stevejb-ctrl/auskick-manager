// Plan-ahead rotation — live-seeded projector adapter (RED-first).
//
// `projectUpcomingRotation` is the FOUNDATION both F1 (override the next
// sub) and F2 (build the next period) share: it seeds the sport-agnostic
// Game Plan projector from the CURRENT live game state instead of a
// from-scratch pre-game suggestion. The coach is mid-game, so the period
// they are IN must mirror the on-field reality right now — not what the
// projector would have picked cold — while later periods are projected
// forward exactly as `projectGamePlan` would.
//
// These tests pin that contract before the adapter exists:
//   • period[0] of the returned plan mirrors the seeded currentGroups /
//     currentBench EXACTLY (anchored to reality, not re-suggested),
//   • the current period keeps its absolute label (e.g. "Q2"),
//   • later periods are projected forward (field filled, count correct),
//   • totals are recomputed to match the (overwritten) periods,
//   • the adapter is pure + deterministic for a fixed seed.

import { describe, it, expect } from "vitest";
import { projectGamePlan, projectUpcomingRotation } from "@/lib/game-plan";
import type { GamePlan } from "@/lib/game-plan";
import { getAgeGroupConfig } from "@/lib/sports/registry";
import type { SportId } from "@/lib/sports/types";

function makeSquad(size: number): { id: string }[] {
  return Array.from({ length: size }, (_, i) => ({
    id: `P${(i + 1).toString().padStart(2, "0")}`,
  }));
}

describe("projectUpcomingRotation — seeds the projector from current live state", () => {
  const ageGroup = getAgeGroupConfig("afl", "U10"); // 3-zone, rolling subs
  const onField = ageGroup.defaultOnFieldSize;
  const players = makeSquad(onField + 3); // flex so 3 rotate through the bench

  // A from-scratch projection — only used to (a) derive realistic zone ids
  // and a valid Q2 lineup, and (b) prove the adapter does NOT just reproduce
  // it for the current period.
  const baseline: GamePlan = projectGamePlan({
    sport: "afl",
    ageGroup,
    players,
    onFieldSize: onField,
    seed: 7,
  });

  // The coach is mid-game in Q2 (0-based index 1).
  const fromPeriodIndex = 1;

  // Build a "current on-field reality" that DIFFERS from the fresh
  // projection: take Q2's projected lineup, then swap the first on-field
  // player with the first benched player. This is something the projector
  // would not itself pick — so if the adapter mirrors it, it is genuinely
  // seeded from reality rather than re-suggesting.
  const q2 = baseline.periods[fromPeriodIndex];
  const currentGroups: Record<string, string[]> = {};
  for (const g of q2.groups) currentGroups[g.groupId] = [...g.playerIds];
  const currentBench = [...q2.bench];

  const firstGroupId = q2.groups[0].groupId;
  const fieldPlayer = currentGroups[firstGroupId][0];
  const benchPlayer = currentBench[0];
  currentGroups[firstGroupId][0] = benchPlayer;
  currentBench[0] = fieldPlayer;

  const baseArgs = {
    sport: "afl" as SportId,
    ageGroup,
    players,
    onFieldSize: onField,
    seed: 7,
    fromPeriodIndex,
    currentGroups,
    currentBench,
  };

  it("anchors period[0] to the seeded current on-field reality, exactly", () => {
    const cur = projectUpcomingRotation(baseArgs).periods[0];
    for (const g of cur.groups) {
      expect(g.playerIds).toEqual(currentGroups[g.groupId]);
    }
    expect(cur.bench).toEqual(currentBench);
  });

  it("keeps the current period's absolute label (the coach is in Q2)", () => {
    const cur = projectUpcomingRotation(baseArgs).periods[0];
    expect(cur.label).toBe(baseline.periods[fromPeriodIndex].label);
  });

  it("does not reproduce the fresh projector's lineup for the current period", () => {
    // The seed was perturbed away from the from-scratch projection, so the
    // adapter's current period must reflect the seed, not projectGamePlan's
    // cold pick.
    const cur = projectUpcomingRotation(baseArgs).periods[0];
    expect(cur.groups.map((g) => g.playerIds)).not.toEqual(
      baseline.periods[fromPeriodIndex].groups.map((g) => g.playerIds),
    );
    const firstGroup = cur.groups.find((g) => g.groupId === firstGroupId)!;
    expect(firstGroup.playerIds).toContain(benchPlayer);
    expect(firstGroup.playerIds).not.toContain(fieldPlayer);
  });

  it("projects later periods forward (field filled), starting from the current one", () => {
    const plan = projectUpcomingRotation(baseArgs);
    // Only the upcoming periods (current → end) are returned.
    expect(plan.periods).toHaveLength(ageGroup.periodCount - fromPeriodIndex);
    for (let i = 1; i < plan.periods.length; i++) {
      const onFieldCount = plan.periods[i].groups.flatMap((g) => g.playerIds).length;
      expect(onFieldCount).toBe(onField);
    }
  });

  it("recomputes totals to match the (overwritten) periods", () => {
    const plan = projectUpcomingRotation(baseArgs);
    const startsFromPeriods = (id: string) =>
      plan.periods.reduce(
        (n, p) => n + (p.groups.some((g) => g.playerIds.includes(id)) ? 1 : 0),
        0,
      );
    // Every squad player is accounted for in totals…
    expect(new Set(plan.totals.map((t) => t.playerId))).toEqual(
      new Set(players.map((p) => p.id)),
    );
    // …and each tally matches the actual periods (including the seeded one).
    for (const t of plan.totals) {
      expect(t.periodsOnField).toBe(startsFromPeriods(t.playerId));
    }
  });

  it("is pure + deterministic for a fixed seed", () => {
    expect(projectUpcomingRotation(baseArgs)).toEqual(
      projectUpcomingRotation(baseArgs),
    );
  });
});
