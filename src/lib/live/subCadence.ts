// ─── Sub-cadence helpers ──────────────────────────────────────────
// Pure helpers for reasoning about WHEN within-period subs fall due.
// No React, no clock, no Supabase — safe to unit-test and to call from
// a client component on every tick.

export interface FinalSubWindowInput {
  /** Wall-clock ms elapsed in the current period (the live clock). */
  nowMs: number;
  /** Effective period duration in ms (clock-multiplier adjusted). */
  quarterMs: number;
  /**
   * Effective sub interval in ms (clock-multiplier adjusted) — one
   * rotation window.
   */
  effectiveSubIntervalMs: number;
}

/**
 * Are we inside the FINAL rotation window of the period — i.e. less
 * than one sub interval remains before the hooter, so the upcoming sub
 * is the last one this period?
 *
 * Two surfaces depend on this:
 *   • the "Plan next period" entry (F2) — offered only once the current
 *     period is winding down;
 *   • the "Plan ahead" entry (F1) — gated here so the coach overrides a
 *     DEFINITE final sub rather than guessing among several still queued
 *     (Steve 2026-06-02).
 *
 * Returns false for a non-running / mis-configured clock (quarterMs or
 * interval <= 0) so callers don't light the affordance pre-game.
 */
export function isFinalSubWindow(input: FinalSubWindowInput): boolean {
  const { nowMs, quarterMs, effectiveSubIntervalMs } = input;
  if (quarterMs <= 0 || effectiveSubIntervalMs <= 0) return false;
  return nowMs >= quarterMs - effectiveSubIntervalMs;
}

export interface CanPlanNextPeriodInput {
  /** True during an in-flight period (not pre-game / break / finished). */
  isLivePlay: boolean;
  /** True on the last period — there's no next period to plan. */
  isLastPeriod: boolean;
  /** Within one sub interval of the hooter (the last sub window). */
  inFinalWindow: boolean;
  /** The next sub-due moment would fall after the hooter — no more subs. */
  subPastHooter: boolean;
  /** A healthy bench player exists to rotate on (i.e. subs can happen). */
  hasSwappableBench: boolean;
}

/**
 * Should the "Plan next period" entry be offered right now?
 *
 * The planner projects the next period from the CURRENT on-field
 * reality, so it's only meaningful once the rest of THIS period won't
 * churn the lineup further. That's true when:
 *   • we're in the final sub window (the last rotation is imminent), OR
 *   • the next sub would fall after the hooter (no more subs coming), OR
 *   • there's no swappable bench at all — a small-squad / no-subs game
 *     never rotates, so the coach can plan the next period any time
 *     (Steve 2026-06-13: ran a no-subs AFL game and couldn't set the
 *     next quarter's lineup mid-quarter).
 *
 * Always false on the last period (nothing to plan) or outside live play.
 */
export function canPlanNextPeriod(input: CanPlanNextPeriodInput): boolean {
  const { isLivePlay, isLastPeriod, inFinalWindow, subPastHooter, hasSwappableBench } =
    input;
  if (!isLivePlay || isLastPeriod) return false;
  return inFinalWindow || subPastHooter || !hasSwappableBench;
}
