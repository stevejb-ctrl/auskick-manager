// ─── The break's game-time floor ─────────────────────────────
// What every sport's break check needs to hold a kid to the game-time
// floor (checkRules' "can't reach 50% now") fairly:
//
//   - How much of the coming period a kid who starts it on the bench can
//     still play. Where subs roll on at any time (soccer's MiniRoos,
//     futsal, basketball, touch and Oztag), the whole period; where they
//     come in windows, from the first window; where they wait for the
//     breaks, none. Counting only the periods after made each sport's
//     Suggested fail its own floor and forced "Start anyway" (futsal
//     audit, 23 Oct 2026; basketball and touch, 24 Oct 2026).
//   - The time each kid couldn't play so far (late, hurt, lent), which
//     comes off their game as How we played takes it off (awayTime): a
//     kid who arrived at the last break is held to the time they could
//     play, not the whole game.

import { awayMsByPeriod } from "@/lib/playbook/awayTime";
import type { GameEvent } from "@/lib/types";

/**
 * How much of a `periodMs` period a kid who starts it on the bench can
 * still play: `firstSubMs` is when the first sub can bring them on (0
 * for rolling subs, the first window's start), null when subs wait for
 * the next break.
 */
export function benchReachMs(periodMs: number, firstSubMs: number | null): number {
  if (firstSubMs === null) return 0;
  return Math.max(0, periodMs - Math.max(0, firstSubMs));
}

/**
 * ms each kid couldn't play in the periods played so far (late, hurt,
 * fouled out, lent): awayMsByPeriod summed over periods 1..`throughPeriod`.
 * An absence still open at the break runs to the end of that period.
 */
export function awayMsSoFar(
  events: readonly GameEvent[],
  periodLen: (period: number) => number,
  throughPeriod: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (throughPeriod < 1) return out;
  for (const [pid, periods] of Object.entries(awayMsByPeriod(events, periodLen, throughPeriod))) {
    let sum = 0;
    for (const [p, ms] of Object.entries(periods)) if (Number(p) <= throughPeriod) sum += ms;
    if (sum > 0) out[pid] = sum;
  }
  return out;
}
