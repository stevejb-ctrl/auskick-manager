// ─── The break's words for what changed ──────────────────────
// Stagehand round 11, #2 and #3: the score chip's "+1" said nothing, and
// the break re-planned its lineup without a word (after Bring back, a
// late kid, an injury: anything that changes who can play). One set of
// words for every sport's break (PeriodBreak).

/** The score margin, said: "Up by 1", "Down by 2", "Level". */
export function marginWords(margin: number): string {
  if (margin > 0) return `Up by ${margin}`;
  if (margin < 0) return `Down by ${-margin}`;
  return "Level";
}

/** Where each kid is on a lineup: their group (a zone, or the bench). */
export type PlacedGroups = Readonly<Record<string, string>>;

/**
 * How many kids a re-plan moved: kids in both lineups whose group
 * changed, and kids new to the lineup who start on the field (a kid back
 * on the bench isn't a move). Kids who can't play now aren't counted.
 */
export function kidsMoved(before: PlacedGroups, after: PlacedGroups, bench: string, out: ReadonlySet<string> = new Set()): number {
  let n = 0;
  for (const [id, group] of Object.entries(after)) {
    if (out.has(id)) continue;
    const was = before[id];
    if (was === undefined ? group !== bench : was !== group) n += 1;
  }
  return n;
}

/** "Lineup re-planned: 3 kids moved." */
export function replannedText(moved: number): string {
  return `Lineup re-planned: ${moved} ${moved === 1 ? "kid" : "kids"} moved.`;
}

/** What the break says once Undo has put the lineup back. */
export const replanUndoneText = "Lineup put back.";
