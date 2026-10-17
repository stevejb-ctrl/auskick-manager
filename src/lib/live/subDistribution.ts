// ─── Even sub distribution across a period ─────────────────────────
// Issue 2 (Steve 2026-06-02): the sub-due reminder used to fire on a
// fixed interval measured from the last sub, so the reminders drifted
// and never lined up with the period. Coaches asked for "N subs per
// quarter, spread evenly" — e.g. 3 subs in a 12-min quarter at the 3,
// 6 and 9 minute marks.
//
// We place N subs at the interior boundaries that split the period into
// N+1 equal slabs: boundary k = quarterMs * k / (N+1), for k = 1..N.
// For N=3 / 12 min that's 3:00, 6:00, 9:00 — the last sub lands 3 min
// before the hooter, never ON it. Pure: no clock, no React, no DB.
//
// Sub windows (soccer plan, 17 Oct 2026): some competitions allow N
// windows per half and none in the final M minutes (Football Tasmania:
// three a half, none in the last 2). The windows are these boundaries,
// with `cutoffMs` = M. The even spread stands while its last window
// clears the cutoff; when it wouldn't, the N windows spread evenly up
// to the cutoff instead, the last on its edge. No cutoff, no change.

export interface SubBoundariesInput {
  /** Effective period duration in ms (already clock-multiplier adjusted). */
  quarterMs: number;
  /** How many subs (or sub windows) to spread across the period (>= 1). */
  subsPerQuarter: number;
  /**
   * No subs in the final `cutoffMs` of the period, in the same frame as
   * `quarterMs`. Omitted or 0 = no cutoff.
   */
  cutoffMs?: number;
}

/**
 * The span the subs spread across and how many equal slabs it splits
 * into: the whole period in N+1 slabs, or, when that would put the last
 * sub inside the cutoff, the open part of the period in N slabs. Null
 * when no sub fits.
 */
function subSpread(input: SubBoundariesInput): { span: number; slabs: number } | null {
  const { quarterMs, subsPerQuarter: n, cutoffMs = 0 } = input;
  if (quarterMs <= 0 || n <= 0) return null;
  const open = quarterMs - Math.max(0, cutoffMs);
  if (open <= 0) return null;
  // quarterMs/(n+1) <= open/n, without dividing: the even spread's last
  // sub (n slabs in) is still in the open part.
  if (quarterMs * n <= open * (n + 1)) return { span: quarterMs, slabs: n + 1 };
  return { span: open, slabs: n };
}

/**
 * The evenly-spaced sub-due boundaries within a period, in ms from the
 * period start, ascending. N subs → N boundaries at k/(N+1) of the
 * period (pulled in to end at the cutoff when there is one, see above).
 * Returns [] for a non-positive period or subs count, or a cutoff that
 * leaves no time open.
 */
export function subDueBoundariesMs(input: SubBoundariesInput): number[] {
  const spread = subSpread(input);
  if (!spread) return [];
  const out: number[] = [];
  for (let k = 1; k <= input.subsPerQuarter; k++) {
    out.push((spread.span * k) / spread.slabs);
  }
  return out;
}

export interface NextSubBoundaryInput extends SubBoundariesInput {
  /** Ms elapsed in the current period (already clock-multiplier adjusted). */
  nowMs: number;
}

/**
 * The next sub-due boundary STRICTLY after `nowMs`, or null when every
 * boundary for the period has already passed (no more subs this period —
 * the live UI then suppresses the suggestion until the break).
 */
export function nextSubBoundaryMs(input: NextSubBoundaryInput): number | null {
  const { nowMs } = input;
  for (const b of subDueBoundariesMs(input)) {
    if (b > nowMs) return b;
  }
  return null;
}

/**
 * The even spacing between subs (one slab) in ms — the value the live UI
 * uses for the countdown ring + the recency guard's minimum-stint window
 * when distributing by count. Equivalent to quarterMs/(N+1), or the open
 * part of the period / N when the cutoff pulls the subs in.
 */
export function subSpacingMs(input: SubBoundariesInput): number {
  const spread = subSpread(input);
  return spread ? spread.span / spread.slabs : 0;
}

/**
 * Whether `nowMs` is in the period's final `cutoffMs`, when no sub may
 * be made (a sub on the cutoff's edge is still allowed). Always false
 * without a cutoff.
 */
export function inSubCutoff(input: { quarterMs: number; cutoffMs?: number; nowMs: number }): boolean {
  const { quarterMs, cutoffMs = 0, nowMs } = input;
  if (!(cutoffMs > 0)) return false;
  return nowMs > quarterMs - cutoffMs;
}

/**
 * The start of the sub interval CURRENTLY in progress, derived purely
 * from the clock — the largest interval boundary at or before `nowMs`
 * (i.e. `floor(nowMs / intervalMs) * intervalMs`).
 *
 * This is the remount-safe seed for the sub-due countdown (issue 4). The
 * main clock already recomputes correctly on remount from a persisted
 * timestamp; flooring that same elapsed onto the fixed interval grid
 * gives a sub-interval start identical before and after a remount — so
 * the countdown continues from where it was instead of resetting to a
 * full interval. Because it depends only on the clock (not on when a sub
 * happened), a forced/unplanned swap can't move it either (issue 5):
 * only a planned rotation swap re-anchors the countdown, by setting the
 * interval start to the swap moment explicitly.
 *
 * `intervalMs` is the effective (clock-multiplier-adjusted) interval, in
 * the same frame as `nowMs`. Returns 0 before the first boundary or for a
 * non-positive interval.
 */
export function subIntervalStartFloor(input: {
  nowMs: number;
  intervalMs: number;
}): number {
  const { nowMs, intervalMs } = input;
  if (intervalMs <= 0 || nowMs <= 0) return 0;
  return Math.floor(nowMs / intervalMs) * intervalMs;
}
