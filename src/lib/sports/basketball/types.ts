// ─── Basketball — its own types ──────────────────────────────
// Basketball is a family of its own (.planning/BASKETBALL-PLAN.md): five
// on court and a bench, no keeper, rolling subs at a dead ball, fouls.
// Positions are optional, as in netball: How we play picks no positions
// (one `court` line), a guard/forward rotation (two lines), or the five
// positions, 1 to 5. Every rule below is basketball's, stated in
// ./index.ts.

import type { AgeGroupConfig } from "@/lib/sports/types";

/**
 * Where a kid on court plays. Equal minutes has no positions, so
 * everyone is in `court`; the line and position strategies put kids in
 * `guard` or `forward`. These are basketball's `sport_lines` rows
 * (migration 0069).
 */
export type BasketballLine = "guard" | "forward" | "court";

export const BASKETBALL_LINES: readonly BasketballLine[] = ["guard", "forward", "court"];

/** The two lines of the line and position strategies, ball end first. */
export const BASKETBALL_TWO_LINES: readonly BasketballLine[] = ["guard", "forward"];

/** The five positions, numbered 1 to 5 as basketball numbers them. */
export type BasketballPosition = "pg" | "sg" | "sf" | "pf" | "c";

export interface BasketballPositionDef {
  key: BasketballPosition;
  /** The number basketball calls it by. */
  number: 1 | 2 | 3 | 4 | 5;
  /** Short label on tiles. */
  label: string;
  name: string;
  /** Guards are 1–2, forwards 3–5 (the centre counts as a forward). */
  line: "guard" | "forward";
}

/**
 * How many kids play in each line. "2-3" reads ball end first: 2 guards,
 * 3 forwards. Equal minutes plays one `court` line.
 */
export interface BasketballShape {
  id: string;
  lines: Record<BasketballLine, number>;
}

/**
 * How kids rotate (How we play, the plan's "Positions and rotations"):
 *   minutes              — Equal minutes: no positions, minutes only
 *   both-lines           — Guards and forwards: every kid plays both
 *   preferred-line       — Home line: a kid's line, time on the other too
 *   position-by-position — All five positions: 1 to 5, most different
 *   set-positions        — Set positions: a home position plus backups
 */
export type BasketballStrategy =
  | "minutes"
  | "both-lines"
  | "preferred-line"
  | "position-by-position"
  | "set-positions";

export const BASKETBALL_STRATEGIES: readonly BasketballStrategy[] = [
  "minutes",
  "both-lines",
  "preferred-line",
  "position-by-position",
  "set-positions",
];

/** The strategies that play the five named positions. */
export function usesBasketballPositions(strategy: BasketballStrategy): boolean {
  return strategy === "position-by-position" || strategy === "set-positions";
}

/** The strategies that play in lines (guards and forwards), positions or not. */
export function usesBasketballLines(strategy: BasketballStrategy): boolean {
  return strategy !== "minutes";
}

/** Subs go like-for-like: guard for guard, or 1 for 1. */
export function basketballLikeForLike(strategy: BasketballStrategy): boolean {
  return strategy === "preferred-line" || strategy === "set-positions";
}

/**
 * A basketball age group states every basketball rule itself (sports
 * are independent).
 */
export interface BasketballAgeGroupConfig extends AgeGroupConfig {
  /** 3-point shots count (the +3 chip shows). ACT: none to U12. */
  threePointers: boolean;
  /** The coach's foul tally is on by default (off at U8–U10). */
  tracksFoulsDefault: boolean;
  /** Personal fouls that foul a player out (FIBA: 5). */
  foulOutAt: number;
  /** How we play's suggested rotation (★). */
  suggestedStrategy: BasketballStrategy;
  /**
   * No sub prompt in the last N seconds of a period: a sub there lands
   * after the hooter, and some by-laws (Nunawading) allow none in the
   * last minute of the first half.
   */
  subCutoffSeconds: number;
}
