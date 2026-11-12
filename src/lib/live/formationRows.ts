// ─── Formation rows for the big live field ───────────────────
// The live screen draws a big field (AFL 15/16/18, union 15, …) as the
// playbook's formation: each line, then its rows top to bottom, each row
// left to right. The playbook keeps positions as x/y on the drawn field
// (attacking up the page), so this reads the rows back out of the
// coordinates. Pure.

/** What the rows need of a position: its line and where it's drawn. */
export interface FormationSpot {
  line: string;
  /** 0–1 across the field, left to right. */
  x: number;
  /** 0–1 down the field, attacking end first. */
  y: number;
}

export interface FormationLine<P extends FormationSpot> {
  line: string;
  /** Top to bottom; each row left to right. */
  rows: P[][];
}

/**
 * Spots closer than this down the field share a row. Union's back row
 * (6 and 7 at 0.30, 8 at 0.33) and its centres (0.64–0.70) sit inside
 * it; its second row (0.22) and back row (0.30) don't.
 */
export const ROW_TOLERANCE = 0.07;

/**
 * Groups positions into lines (in the order they're drawn, top first)
 * and each line into rows. Two rows of one spot each that sit next to
 * each other are one staggered row: union's halfback (0.46) and
 * five-eighth (0.54) are drawn on a diagonal but read as a pair.
 */
export function formationRows<P extends FormationSpot>(positions: readonly P[]): FormationLine<P>[] {
  const byLine = new Map<string, P[]>();
  for (const p of positions) byLine.set(p.line, [...(byLine.get(p.line) ?? []), p]);

  const lines = Array.from(byLine.entries()).map(([line, spots]) => ({ line, rows: rowsOf(spots) }));
  const top = (l: { rows: P[][] }) => Math.min(...l.rows.flat().map((p) => p.y));
  // Stable: lines drawn at the same height keep the order they came in.
  return lines
    .map((l, i) => ({ l, i }))
    .sort((a, b) => top(a.l) - top(b.l) || a.i - b.i)
    .map(({ l }) => l);
}

function rowsOf<P extends FormationSpot>(spots: P[]): P[][] {
  const down = spots.map((p, i) => ({ p, i })).sort((a, b) => a.p.y - b.p.y || a.i - b.i);
  const rows: P[][] = [];
  let lastY = -Infinity;
  for (const { p } of down) {
    if (rows.length === 0 || p.y - lastY >= ROW_TOLERANCE) rows.push([p]);
    else rows[rows.length - 1].push(p);
    lastY = p.y;
  }
  const merged: P[][] = [];
  for (const row of rows) {
    const prev = merged[merged.length - 1];
    if (prev && prev.length === 1 && row.length === 1 && row[0].y - prev[0].y < 2 * ROW_TOLERANCE) prev.push(row[0]);
    else merged.push([...row]);
  }
  return merged.map((row) => row.map((p, i) => ({ p, i })).sort((a, b) => a.p.x - b.p.x || a.i - b.i).map(({ p }) => p));
}
