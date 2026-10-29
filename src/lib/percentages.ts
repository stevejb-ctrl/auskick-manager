// ─── Whole percentages that add up to 100 ────────────────────
// Rounding each share on its own can total 99 or 101 (30.4 + 55.4 +
// 14.2 → 30 + 55 + 14 = 99): a usability pass on 26 Oct 2026 found
// season stats rows that did. Largest remainder instead: floor every
// share, then give the points left over to the biggest remainders.

/** Each value's share of their total, in whole percent, summing to 100 (all 0 when the total is 0). */
export function wholePercents(values: readonly number[]): number[] {
  const total = values.reduce((sum, v) => sum + Math.max(0, v), 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map((v) => (Math.max(0, v) / total) * 100);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((sum, v) => sum + v, 0);
  const byRemainder = exact
    .map((e, i) => ({ i, r: e - Math.floor(e) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}
