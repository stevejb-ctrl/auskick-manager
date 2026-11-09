// Rows for a crowd on one line of the field (FieldLines' `rows`).

/**
 * A crowd of kids on one line, staggered down it in rows of three and
 * two (8 → 3, 2, 3), so they stand across the field rather than in a
 * tight block of fours (Steve, 10 Nov 2026: Oztag looked cramped). Four
 * or fewer stay one row.
 */
export function staggerRows<T>(tiles: readonly T[]): T[][] {
  if (tiles.length <= 4) return [[...tiles]];
  const rows: T[][] = [];
  let i = 0;
  let wide = true;
  while (i < tiles.length) {
    const n = Math.min(wide ? 3 : 2, tiles.length - i);
    rows.push(tiles.slice(i, i + n));
    i += n;
    wide = !wide;
  }
  return rows;
}
