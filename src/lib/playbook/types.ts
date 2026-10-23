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
   * none   — lines only (AFL zoned ages, rugby without named positions)
   * fixed  — set by the rules of play (netball bibs)
   * custom — the coach names, adds and removes positions, seeded from
   *          the sport's standard list (AFL open ages, rugby's named-
   *          position ages — Steve 2026-10-16: a rugby coach creates
   *          their own preferred positions, as an AFL coach does)
   */
  kind: "none" | "fixed" | "custom";
  lines: LineDef[];
  defaults: PositionDef[];
  canRename: boolean;
  canAddRemove: boolean;
  /**
   * Lays coach-edited positions out on the sport's own field (custom
   * kind only): AFL's oval bands, rugby's forwards-up pitch. Without
   * it the defaults' coordinates are the only layout.
   */
  layout?(list: Omit<PositionDef, "x" | "y">[]): PositionDef[];
  /** The sport's full name for a standard label ("CHB" → "Centre half back"). */
  positionName?(label: string): string;
  /**
   * Positions only kids picked for them play (union's front row: props
   * and hooker), by key, label or name so a coach's own list keeps it.
   */
  restricted?(position: { key: string; label: string; name: string }): boolean;
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
  /**
   * Without set positions, where a kid's home is on the role sheet: a
   * line they lean to (preferred lines) or a position they keep
   * (netball partners). Each sport tags its own strategies.
   */
  roleHome?: "line" | "position";
  /**
   * Without set positions or a home, the role sheet offers the sport's
   * positions rather than its lines (basketball's All five positions).
   */
  rolePositions?: boolean;
  /**
   * False where a kid's "Plays as" would do nothing: the strategy has no
   * lines or positions on court (basketball's Equal minutes).
   */
  rolePlaysAs?: boolean;
  /** What season balance evens out, or null when it doesn't apply. */
  balanceUnit: BalanceUnit | null;
  /** Season balance on by default for this strategy (off for set positions). */
  balanceByDefault: boolean;
}

/** A locked rule: shown with its source, changed elsewhere (or not at all). */
export interface LockedRule {
  id: string;
  text: string;
  source: string;
}

/** How a team is set up, where it changes which laws apply. */
export interface LawRulesTeam {
  /** The team keeps score (teams.track_scoring). */
  trackScoring?: boolean;
}

/**
 * Everything How we play knows about one sport. Each sport owns its own
 * rules, words and laws — nothing here is shared between sports or
 * falls back to another one (sports are independent, 14 Oct 2026).
 */
export interface SportPlaybook {
  sport: Sport;
  /** What a kid moves between: "line" (AFL, league) or "third" (netball). */
  unitWord: string;
  /**
   * What "nobody sits out N … in a row" counts. Sports that sub on the
   * run count stints; netball sits kids out for whole periods.
   */
  benchPeriodWord(periodWord: string): string;
  /**
   * Every catalogue rule this sport's engine acts on. A team keeps the
   * saved rules in this list, whatever its strategy (a coach who switches
   * strategy and back keeps their rules); anything else is dropped.
   */
  engineRuleKinds: readonly import("@/lib/playbook/rules").RuleKind[];
  /** The rules the Add-a-rule list offers, for the team's strategy and policy. */
  ruleKinds(strategy: StrategyDef, policy: EffectivePolicy): import("@/lib/playbook/rules").RuleKind[];
  /**
   * This sport's own laws shown as locked rules (zones, unbroken periods,
   * vests), for the team as it's set up (a no-scores law goes once the
   * team keeps score).
   */
  lawRules(policy: EffectivePolicy, agePolicy: AgePolicy, team?: LawRulesTeam): LockedRule[];
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

// ─── Stored How we play (migration 0053) ────────────────────────────────────

/** Season balance as the coach sets it; "off" switches the rule off. */
export type SeasonBalanceSetting = "off" | "light" | "balanced" | "strong";

export interface TeamPlaybookRow {
  team_id: string;
  strategy: string | null;
  policy_overrides: PolicyOverrides;
  rules: unknown[];
  /** null = the strategy's default (Balanced when it rotates, off for set positions). */
  season_balance: SeasonBalanceSetting | null;
  /** When the coach last reset season balance; only games after it count. */
  season_balance_since: string | null;
  /**
   * Rugby league: how the FR / DH vests are chosen (migration 0055).
   * Null for AFL and netball, which wear no vests (migration 0064).
   */
  vest_strategy?: "auto" | "fixed-order" | "coach" | null;
  updated_by: string | null;
  updated_at: string;
}

/** AFL open ages: a team's own named position. */
export interface TeamPositionRow {
  id: string;
  team_id: string;
  label: string;
  name: string | null;
  /** The team's sport's own line id (0062's trigger refuses the rest). */
  line: string;
  sort: number;
  on_field_size: number | null;
  archived_at: string | null;
  created_at: string;
}

/** `plays`: every spot ticked as "Plays as" (engines don't read it). */
export type PositionPrefKind = "home" | "also" | "never" | "keep_on" | "plays";

export interface PlayerPositionPrefRow {
  id: string;
  team_id: string;
  player_id: string;
  /** team_positions.id (AFL), a netball bib, or a league catalogue key. */
  position_key: string | null;
  line: string | null;
  kind: PositionPrefKind;
  rank: number | null;
  created_at: string;
}

/** What a game was played under, frozen at kickoff (games.playbook_snapshot). */
export interface PlaybookSnapshot {
  policy: EffectivePolicy;
  strategy: string;
  seasonBalance: SeasonBalanceSetting;
  seasonBalanceSince: string | null;
  /** Named positions in force, so renaming one later never rewrites history. */
  positions: { key: string; label: string; line: string }[];
  /** The team's rules that were on at kickoff (How we play › Rules). */
  rules?: import("@/lib/playbook/rules").RuleInstance[];
  takenAt: string;
}
