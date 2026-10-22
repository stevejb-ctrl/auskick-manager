// What the break after a period is called, for every sport's scorebug
// and break screen: AFL's words (GameHeader, the reference), so a coach
// running quarters in two sports hears the same call.

/** "Quarter time", "Half time", "Three-quarter time" or "Full time". */
export function periodBreakName(period: number, periodCount: number): string {
  if (period >= periodCount) return "Full time";
  if (periodCount === 2) return "Half time";
  if (periodCount === 4) {
    if (period === 1) return "Quarter time";
    if (period === 2) return "Half time";
    return "Three-quarter time";
  }
  return "Break";
}
