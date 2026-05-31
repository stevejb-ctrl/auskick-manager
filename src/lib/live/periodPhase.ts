/**
 * Single source of truth for period-boundary state across all live
 * surfaces. Mirrors LeagueLiveGame.tsx:1222-1239 (the reference impl) but
 * as a pure function the AFL/netball components and the live/page.tsx
 * sticky bars all call — replacing hardcoded `currentQuarter >= 4` / `< 4`.
 * `periodCount` comes from getAgeGroupConfig(sport, ageGroup).periodCount,
 * never the literal 4.
 */
export function periodPhase(
  currentPeriod: number,
  periodCount: number,
  periodEnded: boolean,
  finalised: boolean,
): { isAtFullTime: boolean; isBetweenPeriods: boolean; isLastPeriod: boolean } {
  const isLastPeriod = currentPeriod >= periodCount;
  return {
    isAtFullTime: !finalised && periodEnded && isLastPeriod,
    isBetweenPeriods: periodEnded && currentPeriod >= 1 && currentPeriod < periodCount,
    isLastPeriod,
  };
}
