// ─── Pre-game rotation plan — manual tweaks ──────────────────
// The projector (./project) auto-suggests a fair full-game rotation;
// the coach then nudges individual slots before copying ("auto-suggest,
// coach tweaks"). This module holds the pure edit operations the
// GamePlanModal drives, kept out of the component so they're unit-
// testable and the modal stays a thin shell.

import { computeTotals } from "./project";
import type { GamePlan, GamePlanPeriod } from "./types";

function clonePeriod(p: GamePlanPeriod): GamePlanPeriod {
  return {
    period: p.period,
    label: p.label,
    groups: p.groups.map((g) => ({ ...g, playerIds: [...g.playerIds] })),
    bench: [...p.bench],
  };
}

/**
 * Swap two players within a single period, then recompute totals.
 *
 * Because the structural invariant guarantees each player appears
 * exactly once per period (in some group XOR the bench), swapping is
 * just exchanging the two ids wherever they sit:
 *
 *   • both on field (different groups) → they trade zones/positions
 *   • one on field, one benched        → the sub: bench player comes
 *     on into the field slot, field player drops to the bench
 *   • both benched                     → no-op (order is cosmetic)
 *
 * Returns a new GamePlan (the input is never mutated). `idA === idB`,
 * an out-of-range period, or an id missing from the period all return
 * the plan unchanged so the caller can swap optimistically.
 */
export function swapPlayersInPeriod(
  plan: GamePlan,
  periodIndex: number,
  idA: string,
  idB: string,
): GamePlan {
  if (idA === idB) return plan;
  const target = plan.periods[periodIndex];
  if (!target) return plan;

  const has = (id: string) =>
    target.groups.some((g) => g.playerIds.includes(id)) ||
    target.bench.includes(id);
  if (!has(idA) || !has(idB)) return plan;

  const swapId = (x: string) => (x === idA ? idB : x === idB ? idA : x);
  const edited = clonePeriod(target);
  edited.groups = edited.groups.map((g) => ({
    ...g,
    playerIds: g.playerIds.map(swapId),
  }));
  edited.bench = edited.bench.map(swapId);

  const periods = plan.periods.map((p, i) => (i === periodIndex ? edited : p));
  const playerIds = plan.totals.map((t) => t.playerId);

  return {
    ...plan,
    periods,
    // Recompute the start tally: a field↔bench swap changes who begins
    // the period on the field, so the per-player periods-on-field counts
    // shift. (A field↔field swap leaves them unchanged.)
    totals: computeTotals(periods, playerIds),
  };
}

/**
 * Clear a period's field — every on-field player moves to the FRONT of the
 * bench / interchange queue (in field order), leaving all groups empty so the
 * coach can build the period from scratch tap-by-tap. This is the plan-model
 * equivalent of the break's "Set manually" mode. Pure; input never mutated.
 * A period already empty (or out of range) returns the plan unchanged.
 */
export function clearPeriodToBench(
  plan: GamePlan,
  periodIndex: number,
): GamePlan {
  const target = plan.periods[periodIndex];
  if (!target) return plan;
  const onField = target.groups.flatMap((g) => g.playerIds);
  if (onField.length === 0) return plan;
  const edited: GamePlanPeriod = {
    ...clonePeriod(target),
    groups: target.groups.map((g) => ({ ...g, playerIds: [] })),
    bench: [...onField, ...target.bench],
  };
  const periods = plan.periods.map((p, i) => (i === periodIndex ? edited : p));
  return {
    ...plan,
    periods,
    totals: computeTotals(periods, plan.totals.map((t) => t.playerId)),
  };
}

/**
 * Replace a period's on-field groups + bench wholesale from an externally
 * computed assignment (groupId → player ids, plus the bench queue). Used by
 * the live "Rotate lines" action, which computes a fresh lineup via
 * `rotateLines` and drops it into the planned period. Groups not present in
 * `groupPlayerIds` are emptied; the caller owns the complete assignment.
 * Pure; input never mutated. Out-of-range period returns the plan unchanged.
 */
export function setPeriodGroups(
  plan: GamePlan,
  periodIndex: number,
  groupPlayerIds: Record<string, string[]>,
  bench: string[],
): GamePlan {
  const target = plan.periods[periodIndex];
  if (!target) return plan;
  const edited: GamePlanPeriod = {
    ...clonePeriod(target),
    groups: target.groups.map((g) => ({
      ...g,
      playerIds: [...(groupPlayerIds[g.groupId] ?? [])],
    })),
    bench: [...bench],
  };
  const periods = plan.periods.map((p, i) => (i === periodIndex ? edited : p));
  return {
    ...plan,
    periods,
    totals: computeTotals(periods, plan.totals.map((t) => t.playerId)),
  };
}
