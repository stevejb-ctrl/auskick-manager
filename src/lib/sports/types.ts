// ─── Sport abstraction — type definitions ─────────────────────
// Each sport is a declarative module exporting a `SportConfig`.
// Callers use `getSportConfig(id)` to look up the config for a team.
//
// AFL (registered in ./afl) and netball (registered in ./netball) are
// siblings — they share the fairness engine, live-game machinery, auth,
// teams, games, etc. What differs is: position layout, score shape,
// substitution rule, period structure, and field/court UI.

/** Stable identifier for a sport. New sports extend this union. */
export type SportId = "afl" | "netball" | "rugby_league";

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

// Forward-declared — the concrete Lineup shape lives in `@/lib/types`
// and is imported into `SportConfig.validateLineup` where needed.
// Phase 1 refactors this to `{ positions: Record<PositionId, string[]>, bench: string[] }`.

// ─── SportConfig ─────────────────────────────────────────────
export interface SportConfig {
  id: SportId;
  name: string;
  /** Customer-facing short name (e.g. "AFL" / "Netball"). */
  shortName: string;
  brand: BrandConfig;
  zones: ZoneDef[];
  allPositions: PositionDef[];
  scoreTypes: ScoreTypeDef[];
  ageGroups: AgeGroupConfig[];
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
