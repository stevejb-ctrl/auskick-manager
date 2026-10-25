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
 *   windows — N windows a period (a half, or a hockey quarter), none in
 *             the final M minutes; sub-due batches the bench into each
 *             window
 */
export type SoccerSubMode =
  | { kind: "rolling" }
  | { kind: "windows"; perPeriod: number; cutoffSeconds: number };

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

// ─── The family's settings, per sport ────────────────────────
// Football (soccer), futsal and hockey share this engine
// (.planning/FOUR-SPORTS-PLAN.md), as league and union share rugby's.
// What differs between them is stated by each sport as the settings
// below, named for what they do rather than for a sport: no screen asks
// "is this hockey?".

/** A sport's words for one unit: a line, or goal. */
export interface SoccerUnitWords {
  /** Its name: "Defence", "Back", "Strikers". */
  label: string;
  /** Its label on a tile and the sub card: "DEF", "BACK", "STR". Empty for `field` (no lines). */
  short: string;
  /** How a sentence names it: "defence", "the back", "the strikers". */
  phrase: string;
}

/** What the live screens draw the game on. */
export type SoccerSurface = "pitch" | "court" | "hockey";

/** One of a sport's laws How we play shows locked, for the ages it covers. */
export interface SoccerLaw {
  id: string;
  text: string;
  source: string;
  /** The age ids it covers; every age when omitted. */
  ages?: readonly string[];
  /** A law about keeping no score: not shown for a team that keeps one. */
  noScoreboard?: boolean;
}

/** How we play's three keeper strategies, in a sport's own words. */
export type SoccerStrategyCopy = Record<"turns" | "keepers" | "minutes", { blurb: string; fit: string }>;

export interface SoccerFamilyRules {
  /** The words for each line (`def` / `mid` / `att`, and `field` with no lines) and for goal. */
  lineLabels: Record<SoccerUnit, SoccerUnitWords>;
  /** A pitch (soccer), a futsal court, or a hockey pitch with shooting circles. */
  surface: SoccerSurface;
  /**
   * Whether goal can change hands mid-period: "Swap keeper" in the
   * keeper's actions, or a tap-swap with the keeper. False means goal
   * changes hands only at a break (hockey: keeper kit takes minutes to
   * put on). An injury can still replace the keeper either way.
   */
  keeperSwapMidPeriod: boolean;
  /**
   * Game seconds before a break when the next keeper is told to get
   * ready ("Mia's in goal next half: start kitting up"), or null for no
   * heads-up.
   */
  keeperKitUpSeconds: number | null;
  /** What the keeper wears, as the handover card names it ("Keeper top: Sam → Mia"). */
  keeperGear: string;
  /** The team may play halves or quarters (teams.period_count). */
  halvesOrQuarters: boolean;
  /**
   * What the sport calls subs on the run ("Rolling subs"; futsal's
   * "Flying subs") and how they work, for the lineup's sub settings.
   */
  rollingSubs: { label: string; note: string };
  /**
   * A lines warning: at these ages, with at least `count` outfield kids,
   * kids should play in at least `count` lines.
   */
  minLines: { ages: readonly string[]; count: number; message: string } | null;
  /** The rules How we play and the policy card quote, and where they come from. */
  ruleSource: {
    /** The laws How we play shows locked. */
    laws: readonly SoccerLaw[];
    /** The body that sets an age's format, quoted on the policy card, and the ages it covers. */
    format: { source: string; ages: readonly string[] } | null;
    /** Where the equal-time target comes from. */
    equalTime: string;
  };
  /** The setup wizard's scoring note: why an age keeps score, or keeps none. */
  scoringCopy: { on: string; off: string };
  strategyCopy: SoccerStrategyCopy;
  /** The share text's emoji ("⚽ Full time — …"). */
  emoji: string;
}
