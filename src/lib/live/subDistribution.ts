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

export interface SubBoundariesInput {
  /** Effective period duration in ms (already clock-multiplier adjusted). */
  quarterMs: number;
  /** How many subs to spread across the period (>= 1). */
  subsPerQuarter: number;
}

/**
 * The evenly-spaced sub-due boundaries within a period, in ms from the
 * period start, ascending. N subs → N boundaries at k/(N+1) of the
 * period. Returns [] for a non-positive period or subs count.
 */
export function subDueBoundariesMs(input: SubBoundariesInput): number[] {
  const { quarterMs, subsPerQuarter } = input;
  if (quarterMs <= 0 || subsPerQuarter <= 0) return [];
  const slabs = subsPerQuarter + 1;
  const out: number[] = [];
  for (let k = 1; k <= subsPerQuarter; k++) {
    out.push((quarterMs * k) / slabs);
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
 * when distributing by count. Equivalent to quarterMs/(N+1).
 */
export function subSpacingMs(input: SubBoundariesInput): number {
  const { quarterMs, subsPerQuarter } = input;
  if (quarterMs <= 0 || subsPerQuarter <= 0) return 0;
  return quarterMs / (subsPerQuarter + 1);
}
