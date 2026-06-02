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
