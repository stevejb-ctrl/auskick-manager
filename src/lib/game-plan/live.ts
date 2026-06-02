// ─── Plan-ahead rotation — live-seeded projector + pin honour ──────
// The pre-game projector (./project) builds a fair rotation from a cold
// start. Mid-game, the coach wants to plan the rotation AHEAD of the
// next break: review the upcoming sub (F1) or build the next period
// (F2). Both reuse the SAME sport-agnostic projector — they just seed it
// from the CURRENT on-field reality instead of a from-scratch suggestion.
//
// This module holds:
//   • `projectUpcomingRotation` — pure adapter that runs `projectGamePlan`
//     for the whole game, then anchors the period the coach is IN to the
//     live lineup (period[0] of the returned plan = current reality),
//     leaving later periods projected forward.
//   • `PlannedRotation` — the shape the live store persists once a coach
//     pins a plan (F1 pinned swaps and/or F2 next-period lineup).
//   • `resolveHonouredSwaps` — pure decision the live game uses when a
//     sub falls due: honour a VALID pin, otherwise fall back to the live
//     suggester. A stale/invalid pin is discarded whole (D-09).
//
// No Supabase, no React, no clock — pure functions, safe to unit-test and
// to call from a client component on every tweak.

import { projectGamePlan, computeTotals } from "./project";
import type { GamePlan, GamePlanPeriod, ProjectGamePlanInput } from "./types";
import type { Lineup } from "@/lib/types";
import type { SwapSuggestion } from "@/lib/fairness";

/**
 * Input to `projectUpcomingRotation`. Everything `projectGamePlan` needs,
 * plus the live anchor: which period the coach is in and who is on the
 * field / bench right now.
 */
export interface ProjectUpcomingRotationInput extends ProjectGamePlanInput {
  /** 0-based index of the period the coach is currently in. */
  fromPeriodIndex: number;
  /** groupId -> on-field player ids RIGHT NOW (mirrors live reality). */
  currentGroups: Record<string, string[]>;
  /** Ordered interchange / bench right now (index 0 = next on). */
  currentBench: string[];
}

function clonePeriod(p: GamePlanPeriod): GamePlanPeriod {
  return {
    period: p.period,
    label: p.label,
    groups: p.groups.map((g) => ({ ...g, playerIds: [...g.playerIds] })),
    bench: [...p.bench],
  };
}

/**
 * Project the rotation from the current period forward, anchored to live
 * reality. Calls `projectGamePlan` for the whole game (NO per-sport
 * projection re-implemented here), slices to the upcoming periods so the
 * current one becomes `period[0]`, then OVERWRITES that period so its
 * groups/bench mirror `currentGroups`/`currentBench` exactly — the coach
 * is mid-game, so the period they are in must reflect what's actually on
 * the field, not a cold suggestion. Later periods stay as projected.
 *
 * Pure + deterministic: the input is never mutated and a fixed seed yields
 * a deep-equal plan.
 */
export function projectUpcomingRotation(
  input: ProjectUpcomingRotationInput,
): GamePlan {
  const full = projectGamePlan(input);

  const lastIndex = Math.max(0, full.periods.length - 1);
  const fromIndex = Math.min(Math.max(0, input.fromPeriodIndex), lastIndex);

  // Upcoming = current period → end, with the current period at index 0.
  // Absolute period numbers/labels are preserved (period[0].label = "Q2").
  const upcoming = full.periods.slice(fromIndex).map(clonePeriod);

  // Anchor the current period to live reality.
  const current = upcoming[0];
  current.groups = current.groups.map((g) => ({
    ...g,
    playerIds: [...(input.currentGroups[g.groupId] ?? [])],
  }));
  current.bench = [...input.currentBench];

  const playerIds = input.players.map((p) => p.id);
  return {
    ...full,
    periods: upcoming,
    totals: computeTotals(upcoming, playerIds),
  };
}

/**
 * A coach's pinned rotation plan for the active game. Client-local
 * (persisted by the live store's partialize, keyed by `gameId`) — there's
 * no server trust and no new game-event type (D-04/D-05).
 *
 * F1 fields (`pinnedForPeriod` / `pinnedSwaps`) override the imminent
 * within-period sub; F2 fields (`nextPeriod*`, consumed in plan 11-02)
 * pre-build the next period's lineup.
 */
export interface PlannedRotation {
  /** Game this pin belongs to — ignored on read if it isn't the active game. */
  gameId: string;

  // ── F1: override the imminent within-period sub (AFL rolling subs) ──
  /** 1-indexed period the pinned swaps apply to. */
  pinnedForPeriod?: number;
  /** Off/on/zone pairs to honour when the sub falls due (advisory). */
  pinnedSwaps?: SwapSuggestion[];

  // ── F2: build the next period's lineup (consumed in plan 11-02) ──
  /** 0-based index of the period this next-period plan targets. */
  nextPeriodIndex?: number;
  /** groupId -> planned player ids for the next period. */
  nextPeriodGroups?: Record<string, string[]>;
  /** Planned interchange / bench for the next period. */
  nextPeriodBench?: string[];
}

export interface ResolveHonouredSwapsInput {
  /** The coach's pinned plan, or null when nothing is pinned. */
  pin: PlannedRotation | null | undefined;
  /** 1-indexed current period (currentQuarter). */
  currentPeriod: number;
  /** Current live lineup (on-field zones + bench). */
  lineup: Lineup;
  /** Players currently injured (excluded from rotation). */
  injuredIds: readonly string[];
  /** Players currently loaned to the opposition. */
  loanedIds: readonly string[];
  /** What the live suggester would pick — used when the pin can't be honoured. */
  fallback: SwapSuggestion[];
}

/**
 * Decide which swaps the live game should SUGGEST when a sub falls due:
 * the pinned swaps when the pin is valid for this period, otherwise the
 * live suggester's `fallback`.
 *
 * D-09 stale guard: every pinned swap must reference an outgoing player
 * who is still on the field and an incoming player who is still on a
 * swappable bench (not injured, not loaned). If ANY pair is invalid — or
 * the pin is for a different period, or absent — the whole pin is
 * discarded and the fallback is returned. An invalid swap is never
 * applied.
 */
export function resolveHonouredSwaps(
  input: ResolveHonouredSwapsInput,
): SwapSuggestion[] {
  const { pin, currentPeriod, lineup, injuredIds, loanedIds, fallback } = input;
  if (!pin) return fallback;
  if (pin.pinnedForPeriod !== currentPeriod) return fallback;

  const swaps = pin.pinnedSwaps;
  if (!swaps || swaps.length === 0) return fallback;

  const onField = new Set<string>([
    ...lineup.back,
    ...lineup.hback,
    ...lineup.mid,
    ...lineup.hfwd,
    ...lineup.fwd,
  ]);
  const bench = new Set(lineup.bench);
  const injured = new Set(injuredIds);
  const loaned = new Set(loanedIds);

  const everyPairValid = swaps.every((s) => {
    const outgoingOnField = onField.has(s.off_player_id);
    const incomingSwappable =
      bench.has(s.on_player_id) &&
      !injured.has(s.on_player_id) &&
      !loaned.has(s.on_player_id);
    return outgoingOnField && incomingSwappable;
  });

  return everyPairValid ? swaps : fallback;
}
