// ─── Football (soccer) — its own types ───────────────────────
// Soccer is a family of its own (.planning/SOCCER-PLAN.md, decided 17
// Oct 2026): the keeper is a slot, not a line; kids play in lines
// (Defence, Midfield, Attack), or in one `field` line at 4 a side; and
// every rule below is soccer's, stated in ./index.ts.

import type { AgeGroupConfig } from "@/lib/sports/types";

/**
 * Where an outfield kid plays. 4 a side has no lines, so everyone is in
 * `field`; from 7 a side kids play `def`, `mid` or `att`. A record of
 * lines (not three fixed arrays) leaves room for futsal or hockey to
 * join the family with lines of their own.
 */
export type SoccerLine = "def" | "mid" | "att" | "field";

export const SOCCER_LINES: readonly SoccerLine[] = ["def", "mid", "att", "field"];

/** The three lines of an 11, 9 or 7 a side shape, back to front. */
export const SOCCER_OUTFIELD_LINES: readonly SoccerLine[] = ["def", "mid", "att"];

/**
 * Where a kid's time is counted: a line, or `gk` (in goal). Keeper
 * minutes are kept apart from outfield minutes and still count as game
 * time. These are soccer's `sport_lines` rows (migration 0068).
 */
export type SoccerUnit = SoccerLine | "gk";

export const SOCCER_UNITS: readonly SoccerUnit[] = ["gk", "def", "mid", "att", "field"];

/**
 * A shape for one on-field size: kids per line, keeper not counted (the
 * keeper is a slot). "2-3-1" reads back to front: 2 in defence, 3 in
 * midfield, 1 in attack.
 */
export interface SoccerFormation {
  id: string;
  keeper: boolean;
  lines: Record<SoccerLine, number>;
}

/**
 * How the keeper is chosen (decided 17 Oct 2026):
 *   none    — no keeper (4 a side, U6–U7)
 *   turns   — "Everyone has a turn" (U8–U11): one keeper a half,
 *             changed at half-time, the fewest keeper minutes first,
 *             never a kid marked "not in goal"
 *   keepers — "Keepers" (U12 up): the coach names one or more, and the
 *             suggester rotates among them
 * The coach can switch between turns and keepers at any age with a
 * keeper (How we play, phase 3).
 */
export type SoccerKeeperStrategy = "none" | "turns" | "keepers";

/**
 * When subs happen (decided 17 Oct 2026):
 *   rolling — any time, unlimited re-entry (MiniRoos, Queensland)
 *   windows — N windows a half, none in the final M minutes; sub-due
 *             batches the bench into each window
 */
export type SoccerSubMode =
  | { kind: "rolling" }
  | { kind: "windows"; perHalf: number; cutoffSeconds: number };

/**
 * A soccer age group states every soccer rule itself (sports are
 * independent): who keeps goal, the shapes at each size it plays, and
 * how subs happen.
 */
export interface SoccerAgeGroupConfig extends AgeGroupConfig {
  keeper: SoccerKeeperStrategy;
  /** Shapes for each on-field size from min to max, the default first. */
  formations: Record<number, SoccerFormation[]>;
  subMode: SoccerSubMode;
}
