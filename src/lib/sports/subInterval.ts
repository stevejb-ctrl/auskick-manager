/**
 * SUB-02 / F4 — derive the sub interval from the period length.
 *
 * Coaches shouldn't hand-tune a sub cadence per age group. The interval
 * falls out of the period length: pick the smallest CLEAN (evenly-dividing)
 * divisor of the period that is >= the age group's `subIntervalFloorSeconds`.
 *
 * "Clean" means the period splits into equal stints with no ragged
 * remainder — every kid's shift is the same length and the final stint
 * isn't a stub. When no clean divisor >= the floor exists (e.g. a prime
 * period), fall back to the nearest even split that still clears the floor.
 * If even a 2-way split can't clear the floor, run the whole period as one
 * stint.
 *
 * Pure: no config reads, no imports, integer seconds in → integer seconds
 * out. Callers (afl/netball/rugby_league index.ts) pass their own
 * periodSeconds + subIntervalFloorSeconds.
 *
 * Worked examples:
 *   deriveSubIntervalSeconds(480, 240)  = 240  // RL quarter: 480/240 = 2
 *   deriveSubIntervalSeconds(1200, 240) = 240  // RL half: 1200/240 = 5
 *   deriveSubIntervalSeconds(600, 240)  = 300  // netball: 240∤600, next is 300
 *   deriveSubIntervalSeconds(240, 240)  = 240  // period == floor → one stint
 *   deriveSubIntervalSeconds(180, 240)  = 180  // period < floor → one stint
 *   deriveSubIntervalSeconds(251, 120)  = 126  // prime: 2-way split round(125.5)
 *   deriveSubIntervalSeconds(130, 70)   = 130  // only 1 stint fits → run whole
 */
export function deriveSubIntervalSeconds(
  periodSeconds: number,
  floorSeconds: number,
): number {
  // A period at or below the floor can't be carved into >= floor stints.
  if (periodSeconds <= floorSeconds) return periodSeconds;

  // Smallest CLEAN divisor of the period that clears the floor wins — every
  // stint is equal length and the period divides exactly.
  const start = Math.ceil(floorSeconds);
  for (let d = start; d < periodSeconds; d++) {
    if (periodSeconds % d === 0) return d;
  }

  // No clean divisor >= floor (e.g. a prime period). Fall back to the
  // nearest even split that still clears the floor: how many >= floor
  // stints fit, then divide evenly into that many (rounded to whole seconds).
  const stints = Math.floor(periodSeconds / floorSeconds);
  if (stints >= 2) return Math.round(periodSeconds / stints);

  // Even a 2-way split can't clear the floor → run the whole period as one
  // stint.
  return periodSeconds;
}
