// ─── Sport abstraction — type definitions ─────────────────────
// Each sport is a declarative module exporting a `SportConfig`.
// Callers use `getSportConfig(id)` to look up the config for a team.
//
// AFL (registered in ./afl) and netball (registered in ./netball) are
// siblings — they share the fairness engine, live-game machinery, auth,
// teams, games, etc. What differs is: position layout, score shape,
// substitution rule, period structure, and field/court UI.

/** Stable identifier for a sport. New sports extend this union. */
export type SportId =
  | "afl"
  | "netball"
  | "rugby_league"
  | "rugby_union"
  | "soccer"
  | "basketball"
  | "futsal"
  | "hockey"
  | "touch"
  | "oztag";

/**
 * Sports that share an engine. Rugby league and rugby union share the
 * rugby engine — live game, replay, fairness — each with its own rules.
 * Ask `isRugby(sport)`, never `sport === "rugby_league"`. Football
 * (soccer) is a family of its own (keeper slot, lines, sub windows);
 * ask `isSoccer(sport)`. Futsal and hockey join it, each with its own
 * rules (.planning/FOUR-SPORTS-PLAN.md). So is basketball (five on
 * court, optional positions, fouls); ask `isBasketball(sport)`. Touch
 * football and Oztag share the touch family (lanes, no keeper, a boys'
 * cap in mixed teams); ask `isTouch(sport)`.
 */
export type SportFamily = "afl" | "netball" | "rugby" | "soccer" | "basketball" | "touch";

/** Identifier for one on-field position within a sport (e.g. "gs", "mid"). */
export type PositionId = string;

/** Identifier for one zone/region of the field/court (e.g. "attack-third"). */
export type ZoneId = string;

/** Identifier for one score type (e.g. "goal", "behind", "try"). */
export type ScoreTypeId = string;

/** Identifier for one age group (e.g. "U10", "11u", "set"). */
export type AgeGroupId = string;

// ─── Zone (field/court region) ───────────────────────────────
// A zone is a spatial area used for:
//   1. Netball rules-of-play — `PositionDef.allowedZones` pins down where
//      a position may stand.
//   2. UI layout — the Field/Court component draws one region per zone.
// AFL uses "zones" synonymously with positions (back/mid/fwd or 5-position);
// netball separates them (3 thirds + 2 goal circles; 7 positions).
export interface ZoneDef {
  id: ZoneId;
  label: string;
  shortLabel: string;
}

// ─── Position (on-field role) ────────────────────────────────
// A position is the named role a player fills — GS, GA, WA for netball;
// Back, Mid, Forward for AFL. `allowedZones` expresses netball's rules-
// of-play (GS may only enter attack third + goal circle). For sports
// where positions ARE zones (current AFL), leave this undefined — the
// validator treats it as "no zone restriction".
export interface PositionDef {
  id: PositionId;
  label: string;
  shortLabel: string;
  /** Zones this position may enter. Empty/undefined = unrestricted. */
  allowedZones?: ZoneId[];
  /** Optional: safety-critical position (e.g. rugby front row). */
  requiresAccreditation?: boolean;
}

// ─── Score type ──────────────────────────────────────────────
// One row in the score UI. AFL: goal (6) + behind (1) for team &
// opponent. Netball: goal (1) for team & opponent.
export interface ScoreTypeDef {
  id: ScoreTypeId;
  label: string;
  shortLabel: string;
  points: number;
  /** true = opponent score button; false/omitted = our team. */
  opponent?: boolean;
}

// ─── Age group config ────────────────────────────────────────
// Per-age-group rules. Position list can vary by age (e.g. U8 Auskick
// uses 3-zone rotation; U13+ uses 5-position layout). Rugby league
// adds three age-group-specific knobs (periodLabel, vestRequirements,
// kickingAllowed) because junior RL uses both quarters (U6–U9) and
// halves (U10–U12) under one sport, has scoring + kicking gates by
// age, and rotates FR/DH vests differently at U8 vs U9+.
export interface AgeGroupConfig {
  id: AgeGroupId;
  label: string;
  /** Positions this age group uses. Subset of SportConfig.allPositions. */
  positions: PositionId[];
  /** Zones this age group uses. Subset of SportConfig.zones. */
  zones: ZoneId[];
  defaultOnFieldSize: number;
  minOnFieldSize: number;
  maxOnFieldSize: number;
  maxSquadSize: number;
  periodCount: number;
  periodSeconds: number;
  subIntervalSeconds: number;
  /**
   * Floor (in seconds) for the auto-derived sub interval. Phase 10 (SUB-02)
   * reads this to compute the smallest even divisor of periodSeconds >= floor.
   * Phase 8 only DEFINES it. Every age group sets its own explicit value
   * (no central default). Currently 240 (4 min) for all sports.
   */
  subIntervalFloorSeconds: number;
  tracksScoreDefault: boolean;
  notes: string;
  /**
   * Optional per-age-group override for the period noun. Junior rugby
   * league plays quarters in U6–U9 but halves in U10–U12 under one
   * SportConfig. Falls back to SportConfig.periodLabel when unset.
   */
  periodLabel?: "quarter" | "half" | "period";
  periodLabelPlural?: "quarters" | "halves" | "periods";
  /**
   * Junior rugby league: which vested roles this age group requires.
   * U6–U7 = no vests. U8 = FR only. U9+ = FR and DH. Other sports
   * leave this undefined.
   */
  vestRequirements?: {
    fr: boolean;
    dh: boolean;
  };
  /**
   * Whether kicking is allowed in general play. Junior RL bans kicks
   * other than starts/restarts at U6/U7 (Law 19); U8+ allows kicking.
   * Other sports leave undefined (treated as "allowed").
   */
  kickingAllowed?: boolean;
  /**
   * Minimum unbroken playing time per player, in number of full
   * periods. Junior RL Law 6: U6–U9 = 2 unbroken quarters; U10–U12 =
   * 1 unbroken half. The fairness engine flags players who haven't
   * met this minimum. Other sports leave undefined.
   */
  minUnbrokenPeriods?: number;
  /**
   * Rugby league only — how many of the on-field players should be
   * forwards (the remainder are backs). Drives the chip-aware
   * lineup auto-suggester and the field visual split. Optional; if
   * omitted, the suggester falls back to `floor(defaultOnFieldSize/2)`
   * forwards and the rest backs.
   */
  forwardCount?: number;
  /**
   * Rugby: forwards at each on-field size the age group plays, when the
   * sport states one (union: Hunter's by-laws from 10 a side). Without
   * it, `forwardCount` holds at every size (league).
   */
  forwardsBySize?: Record<number, number>;
  /**
   * Rugby league only — the grade plays international (open-age) laws
   * rather than the national 6–12 junior laws (U13 and up). It names
   * the law set; the knobs below say what those laws do, so a sport
   * with other laws (union) can mix them.
   */
  internationalLaws?: boolean;
  /**
   * Rugby: penalty goals and field (drop) goals score. League's junior
   * laws forbid both (Law 17); its international grades allow them.
   */
  goalsFromPlay?: boolean;
  /**
   * Rugby league junior laws §15–16: the goal-kick and kickoff
   * rotations (nobody kicks twice until everyone has had a turn).
   */
  kickRotations?: boolean;
  /**
   * Rugby league junior laws §6: the unbroken-period rule applies at
   * this age (`minUnbrokenPeriods` says how many periods).
   */
  unbrokenPeriods?: boolean;
  /** Rugby: How we play's suggested strategy for this age (★). */
  recommendedStrategy?: RugbyStrategyId;
}

/** Rugby How we play strategies (rugby_league/playbook.ts). */
export type RugbyStrategyId = "both-lines" | "preferred-line" | "named-positions";

/**
 * A rugby age group states every rugby rule itself (sports are
 * independent): nothing is left to a default or borrowed from another
 * rugby sport.
 */
export interface RugbyAgeGroupConfig extends AgeGroupConfig {
  kickingAllowed: boolean;
  minUnbrokenPeriods: number;
  forwardCount: number;
  goalsFromPlay: boolean;
  kickRotations: boolean;
  unbrokenPeriods: boolean;
  recommendedStrategy: RugbyStrategyId;
}

// ─── Brand (domain) config ───────────────────────────────────
// One brand per sibling marketing site. Middleware reads host header
// and sets x-brand, which RSC pages read to pick strings/palette.
export interface BrandConfig {
  id: SportId;
  /** Root host this brand serves, e.g. "sirenfooty.com.au". */
  host: string;
  /** Short product name for chrome ("Siren Footy"). */
  name: string;
  /** Long tagline used in hero + meta description. */
  tagline: string;
  /** Default sport created when a user signs up on this brand. */
  defaultSport: SportId;
  /** Tailwind brand palette key. */
  palette: "brand" | "netball";
}

// ─── Validation result ───────────────────────────────────────
export interface ValidationIssue {
  kind: "error" | "warn";
  message: string;
  /** Optional: identifies which position/player triggered the issue. */
  positionId?: PositionId;
  playerId?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

// ─── Period break (the screen between periods) ───────────────
// One break screen serves every sport (docs/handoffs/siren-footy-
// break-redesign-HANDOFF.md). Everything it says about a sport comes
// from here: which zones it shows and in what order, how many slots
// each has, the zone's colour, the bib on a netball slot, how the score
// reads and when a kid's game time turns orange. The screen never asks
// which sport it's showing.

/** The four zone colours the break screen paints with (bench is its own grey). */
export type BreakZoneColor = "zone1" | "zone2" | "zone3" | "zone4";

/** One section of the break screen: a zone of the field, in display order. */
export interface BreakZoneDef {
  /**
   * The lineup group this section shows: AFL "fwd"/"mid"/"back", soccer
   * "att"/"mid"/"def"/"keeper", netball "attack"/"centre"/"defence".
   */
  key: string;
  /** Section header, upper case ("FORWARD"). */
  label: string;
  /** Said in a tile's movement line: "From Fwd". */
  short: string;
  color: BreakZoneColor;
  /** Players on the field in this zone. */
  slots: number;
  /**
   * Netball: the position each slot is (["gs", "ga"]). A swap moves the
   * kids; the position stays with the slot. Length === slots.
   */
  slotIds?: string[];
  /** Netball: the bib printed on each slot (["GS", "GA"]). Length === slots. */
  slotLabels?: string[];
}

export interface BreakZoneContext {
  ageGroup: AgeGroupConfig;
  /** Players on the field this game. */
  onFieldSize: number;
  /**
   * Players per lineup group in the lineup being staged, when the caller
   * knows it (AFL's effective zone caps, a soccer formation's lines).
   * Absent: the age group's own shape at `onFieldSize`.
   */
  shape?: Readonly<Record<string, number>>;
}

export interface SportBreakSpec {
  /**
   * The zones, attack first, then the middle, then defence, then a
   * keeper. The bench always follows and isn't listed. Counts come from
   * the context, never a constant.
   */
  zones: (ctx: BreakZoneContext) => BreakZoneDef[];
  /**
   * The line under the score: "goals-behinds" reads AFL's "2.0 v 0.0";
   * "goals" and "points" name the unit ("Goals" / "Points").
   */
  scoreDetail: "goals-behinds" | "goals" | "points";
  /** A tile's game time turns orange this far under the team average. */
  lowTimeMs: number;
}

// Forward-declared — the concrete Lineup shape lives in `@/lib/types`
// and is imported into `SportConfig.validateLineup` where needed.
// Phase 1 refactors this to `{ positions: Record<PositionId, string[]>, bench: string[] }`.

// ─── SportConfig ─────────────────────────────────────────────
export interface SportConfig {
  id: SportId;
  /** The engine this sport runs on (see SportFamily). */
  family: SportFamily;
  name: string;
  /** Customer-facing short name (e.g. "AFL" / "Netball"). */
  shortName: string;
  brand: BrandConfig;
  zones: ZoneDef[];
  allPositions: PositionDef[];
  scoreTypes: ScoreTypeDef[];
  /** Age groups a new or edited team can pick, in picker order. */
  ageGroups: AgeGroupConfig[];
  /**
   * Retired ids that existing teams may still store (e.g. AFL's unsplit
   * "U16" / "U17"). `getAgeGroupConfig` resolves them; pickers never
   * offer them.
   */
  legacyAgeGroups?: AgeGroupConfig[];
  substitutionRule: "rolling" | "period-break-only";
  periodLabel: "quarter" | "half" | "period";
  periodLabelPlural: "quarters" | "halves" | "periods";
  /**
   * Fairness aggregation model.
   *   - "zone-minutes": AFL — accumulate minutes per zone (rolling subs).
   *   - "position-count-per-game": Netball — count appearances per
   *     position (period-break subs).
   *   - "unbroken-period": Rugby league — track each player's longest
   *     contiguous on-field run per period; flag players below the
   *     age-group's `minUnbrokenPeriods` requirement.
   */
  fairnessModel: "zone-minutes" | "position-count-per-game" | "unbroken-period";
  /**
   * Kids wear numbers the coach records (AFL guernseys, league jerseys).
   * Netball doesn't: the bib is the position. Every squad, availability
   * and live surface reads this — none decides for itself.
   */
  jerseyNumbers: boolean;
  /**
   * The live screen plays the team song when the team scores (AFL and
   * netball goals). League's doesn't, so its settings don't offer one.
   */
  teamSong: boolean;
  /** The period break screen's zones, score line and low-time threshold. */
  periodBreak: SportBreakSpec;
  /** Sport-specific event types layered on top of the base enum. */
  extraEventTypes?: string[];
  /**
   * Optional: validate a lineup against position/zone eligibility.
   *
   * `onFieldSize` lets short-squad games (e.g. 6 players in a 7-on-
   * court netball match) check that the lineup matches the chosen
   * on-court count rather than the age group's default. Callers that
   * don't care about a per-game override (or sports that don't yet
   * support short squads) can omit it and the validator falls back to
   * `ageGroup.defaultOnFieldSize`.
   */
  // Signature uses `any` to avoid a circular dep with @/lib/types — the
  // AFL / netball configs narrow this in their own modules.
  validateLineup?: (
    lineup: unknown,
    ageGroup: AgeGroupConfig,
    onFieldSize?: number,
  ) => ValidationResult;
}
