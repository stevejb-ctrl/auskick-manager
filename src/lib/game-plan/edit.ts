// ─── Pre-game rotation plan — manual tweaks ──────────────────
// The projector (./project) auto-suggests a fair full-game rotation;
// the coach then nudges individual slots before copying ("auto-suggest,
// coach tweaks"). This module holds the pure edit operations the
// GamePlanModal drives, kept out of the component so they're unit-
// testable and the modal stays a thin shell.

import { computeRotationTotals, computeTotals } from "./project";
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
    // A rotating plan (AFL rolling subs) spreads minutes evenly across
    // everyone present, so a starter↔interchange swap doesn't change the
    // totals — but recompute through the same path so the contract holds
    // and we never snap back to whole-period blocks.
    totals: plan.rotatesWithinPeriod
      ? computeRotationTotals(periods, playerIds, plan.periodMinutes)
      : computeTotals(periods, playerIds, plan.periodMinutes),
  };
}
