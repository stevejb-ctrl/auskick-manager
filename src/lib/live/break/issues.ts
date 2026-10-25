// ─── Period break issues ─────────────────────────────────────
// A sport's rule check for the staged lineup, as the break screen shows
// it: broken rules ("must" rules and the game-time floor) inline, each
// with the swaps that would fix it when there are some; everything soft
// as a warning. Re-run after every swap, so a fixed rule drops off at
// once.

import type { RuleCheckItem } from "@/lib/playbook/ruleCheck";
import { BENCH, findFix, type BoardSlot } from "@/lib/live/break/board";

export interface BreakIssue {
  id: string;
  /** What's wrong, about these kids, now. */
  message: string;
  /** The rule it breaks. */
  rule?: string;
  /** The swaps that fix it, in order; absent → no Fix button. */
  fix?: [BoardSlot, BoardSlot][];
}

export interface BreakIssues {
  broken: BreakIssue[];
  warnings: string[];
}

export interface BreakIssuesInput<L> {
  /** The staged lineup, in the sport's own shape. */
  lineup: L;
  /** The sport's rule check for a lineup. */
  check: (lineup: L) => readonly RuleCheckItem[];
  /** The lineup as the screen's slots. */
  board: (lineup: L) => readonly BoardSlot[];
  /** The sport's swap of two slots. */
  swap: (lineup: L, a: BoardSlot, b: BoardSlot) => L;
  sidelined: ReadonlySet<string>;
  /**
   * Warn about empty field spots ("1 spot is empty"). Off for a sport
   * whose own check already says it (netball's empty bib is a rule).
   */
  emptySpots?: boolean;
  /** Other soft notes the check doesn't make. */
  extraWarnings?: readonly string[];
  /** The sport's ranking of a Fix swap, higher tried first (findFix's prefer). */
  preferFix?: (a: BoardSlot, b: BoardSlot) => number;
}

export function breakIssues<L>({
  lineup,
  check,
  board,
  swap,
  sidelined,
  emptySpots = true,
  extraWarnings = [],
  preferFix,
}: BreakIssuesInput<L>): BreakIssues {
  const items = check(lineup);
  const empty = emptySpots ? board(lineup).filter((s) => s.zone !== BENCH && !s.playerId).length : 0;
  const emptyNote = empty === 0 ? [] : [empty === 1 ? "1 spot is empty" : `${empty} spots are empty`];
  const broken = items
    .filter((i) => i.status === "fail")
    .map((i) => ({
      id: i.id,
      message: i.text,
      rule: i.rule || undefined,
      fix: findFix({ lineup, board, swap, check, sidelined, itemId: i.id, prefer: preferFix }) ?? undefined,
    }));
  const warnings = [...emptyNote, ...extraWarnings, ...items.filter((i) => i.status === "warn").map((i) => i.text)];
  return { broken, warnings };
}
