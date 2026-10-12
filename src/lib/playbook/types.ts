// ─── How we play — shared types ─────────────────────────────────────────────
// UX plan §7: three layers, and only the last belongs to the coach.
//
//   Sport model   — code, per sport: lines, positions, which strategies
//                   and rules exist (SportPlaybook).
//   Age policy    — code defaults per age group; a team can override where
//                   leagues differ, unless locked (AgePolicy).
//   How we play   — the coach's choices for their team (strategy,
//                   positions, roles, rules), within the policy.
//
// The code keeps the name "playbook"; the UI says "How we play".

import type { Sport } from "@/lib/types";

/** A policy value with its default, and whether a team may change it. */
export interface Overridable<T> {
  default: T;
  overridable: boolean;
  /** Where the default comes from ("AFL Junior Rules, May 2024"). */
  source?: string;
}

/** The age group's rules of the game, before any team override. */
export interface AgePolicy {
  /** AFL U8–U10: kids play in zones; named positions don't apply. */
  zonesEnforced: Overridable<boolean>;
  /** Every player's minimum share of game time, in percent. */
  minGameTimePct: Overridable<number> & {
    /** The range a league may set (AFL: 50–75). */
    band: [number, number];
    /** Shown as a locked Must rule (AFL junior rules). */
    locked: boolean;
  };
  /** Rugby league §6: full periods each player plays without a break. */
  minUnbrokenPeriods?: Overridable<number>;
  /** Rugby league vests worn at this age. */
  vests?: { fr: boolean; dh: boolean };
  tracksScoreDefault: boolean;
}

/** Team-level overrides of the overridable policy values. */
export interface PolicyOverrides {
  zonesEnforced?: boolean;
  minGameTimePct?: number;
  minUnbrokenPeriods?: number;
}

/** The age policy after the team's overrides, as the engines read it. */
export interface EffectivePolicy {
  sport: Sport;
  ageGroup: string;
  zonesEnforced: boolean;
  minGameTimePct: number;
  minUnbrokenPeriods: number;
  vests: { fr: boolean; dh: boolean };
  tracksScoreDefault: boolean;
  /** Which values came from the team rather than the age group. */
  overridden: (keyof PolicyOverrides)[];
}

/** A line of the field: AFL Back/Centre/Forward, netball thirds, RL F/B. */
export interface LineDef {
  id: string;
  label: string;
  /** Tailwind colour token for the line's accent (zone-b / zone-c / zone-f). */
  colorToken: "zone-b" | "zone-c" | "zone-f";
}

/** A named position on the field (or a fixed netball bib). */
export interface PositionDef {
  /** Stable key — "fb", "bp1", "gs", "pr2"… */
  key: string;
  /** Short label shown on tiles (≤ 4 characters for custom positions). */
  label: string;
  /** Full name, e.g. "Full back". */
  name: string;
  line: string;
  /** Formation coordinates, 0–1, attacking up the page. */
  x: number;
  y: number;
}

export interface PositionModel {
  /**
   * none      — lines only (AFL zoned ages, RL without named positions)
   * fixed     — set by the rules of play (netball bibs)
   * catalogue — pick from a standard list, no renaming (RL Mod League)
   * custom    — coach names, adds and removes positions (AFL open ages)
   */
  kind: "none" | "fixed" | "catalogue" | "custom";
  lines: LineDef[];
  defaults: PositionDef[];
  canRename: boolean;
  canAddRemove: boolean;
}

/** The unit season balance evens out for a strategy (§7.5). */
export type BalanceUnit = "zone" | "line" | "third" | "bib" | "position";

export interface StrategyDef {
  id: string;
  label: string;
  /** One line under the label in the strategy picker. */
  blurb: string;
  /** "Typical fit" hint, e.g. "U11–U12". */
  fit?: string;
  /** Kids have home positions (shows the positions + roles steps). */
  usesPositions: boolean;
  /** What season balance evens out, or null when it doesn't apply. */
  balanceUnit: BalanceUnit | null;
  /** Season balance on by default for this strategy (off for set positions). */
  balanceByDefault: boolean;
}

export interface SportPlaybook {
  sport: Sport;
  agePolicy(ageGroup: string): AgePolicy;
  positionModel(policy: EffectivePolicy, onFieldSize: number): PositionModel;
  strategies(policy: EffectivePolicy): StrategyDef[];
  /** The age group's suggested strategy (★ in the picker). */
  recommendedStrategy(policy: EffectivePolicy): string;
  /**
   * The strategy a team with no saved choice plays — today's engine
   * behaviour, so existing teams don't change under them.
   */
  fallbackStrategy(policy: EffectivePolicy): string;
}
