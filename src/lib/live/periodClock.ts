// Period-clock calculation shared by netball and rugby league — pure
// function first extracted from NetballLiveGame's inline IIFE so the
// freeze invariant can be unit-tested (and so the auto-hooter freeze
// behaviour has a documented contract, not just inline state and
// useEffect side effects). AFL keeps its own clock in the live store
// (liveGameStore.ts `clockElapsedMs`) with the same rules.
//
// The freeze invariant — Steve 2026-05-15 bug report (netball):
//   "At the end of a quarter the player time continues to accrue,
//    rather than pausing with the clock."
//
// Player time on each tile is derived from `clockMs` (this function's
// return value). Pre-fix, the auto-hooter useEffect in
// NetballLiveGame.tsx fired the `endNetballQuarter` server action but
// did NOT freeze the local clock. Between hooter and the server-side
// quarter_end refresh landing, clockMs kept growing — and player
// tiles kept ticking up.
//
// The fix is two-part:
//   1. The hooter useEffect now calls `setPausedAtMs(Date.now())`
//      immediately, so `pausedAtMs` is non-null in the window
//      between hooter and refresh.
//   2. This helper treats a non-null `pausedAtMs` as "freeze at the
//      pause moment" (which it already did before the fix — the
//      logic is unchanged here; the fix is in the call site).
//
// __tests__/periodClock.test.ts covers the freeze states this helper must respect.

export interface PeriodClockOpts {
  /** Current period number (0 = before the first, then 1..n quarters or halves). */
  currentQuarter: number;
  /** Server-confirmed quarter-ended flag. When true, clockMs falls
   *  back to `fallbackElapsedMs` (the server's quarter_end metadata). */
  quarterEnded: boolean;
  /** Game finalised. Same fallback as quarterEnded. */
  finalised: boolean;
  /** Wall-clock ms when the current quarter started (Date.parse of
   *  the quarter_start event timestamp). null = pre-Q1 / no quarter
   *  active yet. */
  quarterStartedAtMs: number | null;
  /** Wall-clock ms when the clock was paused (manual pause OR
   *  auto-hooter pause). null = clock is running. */
  pausedAtMs: number | null;
  /** Sum of pause durations earlier in the quarter, in wall-clock ms. */
  accumulatedPauseMs: number;
  /** Server's quarter_end metadata elapsed_ms, used as the source of
   *  truth once the quarter has officially ended. */
  fallbackElapsedMs: number;
  /** Demo-mode scale (default 1; 8 for the demo flow). The hooter
   *  trigger compares (clockMs >= quarterMs) using the multiplied
   *  value, so consumers stay in sync. */
  clockMultiplier: number;
  /** Wall-clock "now" — caller passes Date.now() at render time. */
  nowMs: number;
}

/**
 * Compute the displayed period-elapsed ms for a netball or league game.
 * Pure function — same inputs always produce the same output.
 *
 * Pre-Q1 (currentQuarter < 1) → 0.
 * Post-end (quarterEnded / finalised / no quarter_start yet) →
 *   fallbackElapsedMs.
 * Paused (pausedAtMs set) → frozen at pause moment.
 * Live → nowMs delta from quarterStartedAt, minus accumulated
 *   pauses, scaled by clockMultiplier.
 */
export function computePeriodClockMs(opts: PeriodClockOpts): number {
  const {
    currentQuarter,
    quarterEnded,
    finalised,
    quarterStartedAtMs,
    pausedAtMs,
    accumulatedPauseMs,
    fallbackElapsedMs,
    clockMultiplier,
    nowMs,
  } = opts;

  if (currentQuarter < 1) return 0;
  if (quarterEnded || finalised || quarterStartedAtMs === null) {
    return fallbackElapsedMs;
  }

  // When paused, freeze at the moment of pause. Subtract any pause
  // time that was already accumulated BEFORE this pause started so
  // multi-pause quarters credit the right total. The auto-hooter
  // sets pausedAtMs to Date.now() at the moment the quarter timer
  // hits zero — that's what stops player tile time from accruing
  // in the window between hooter and server-refresh confirmation.
  const refMs = pausedAtMs ?? nowMs;
  const rawElapsed = Math.max(0, refMs - quarterStartedAtMs - accumulatedPauseMs);
  return rawElapsed * clockMultiplier;
}
