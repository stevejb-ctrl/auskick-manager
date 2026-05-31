// ─── Rugby League sport registration ─────────────────────────
// Sources:
//   - 2026 National Junior Rugby League Laws (6–12 years).
//     https://www.playrugbyleague.com/media/18199/2026-national-6-12-junior-league-laws.pdf
//
// Junior rugby league is positionless from a roster-management point
// of view: the coach has 6–13 kids on the field at any moment, plus a
// bench, and rotates them. There's no GS/GK-style rules-of-play
// constraint. What IS sport-specific:
//
//   - 4 × 8-minute quarters for U6–U9 (with 1-min break between Q
//     and a 3-min half-time option). 2 × 20-min halves for U10–U12.
//   - Try = 4 points. Conversion = 2 points.
//   - U6 + U7 = tag rugby, no scoring tracked, no kicking allowed.
//   - U8+ = modified tackle, scoring enabled, conversions allowed.
//   - Vested roles (Law 12) rotate per period and no player wears a
//     given vest twice in one match. U8 = FR only; U9+ = FR and DH.
//   - Goal-kick rotation (Law 15): everyone on field must attempt
//     before any player kicks twice in a row.
//   - Kickoff rotation (Law 16): a player can't take consecutive
//     kickoffs until everyone in the team has had one.
//   - Min unbroken period (Law 6): each player must play 2 unbroken
//     quarters (U6–U9) or 1 unbroken half (U10–U12).
//
// Internally this sport reuses AFL's rolling-sub event model
// (`swap`, `lineup_set`, `quarter_start`, `quarter_end`). The
// rotation / vest / unbroken-period rules are layered on as new
// event types: `try`, `conversion_attempt`, `kickoff_taken`,
// `vest_assigned`.

import type {
  SportConfig,
  ZoneDef,
  PositionDef,
  ScoreTypeDef,
  AgeGroupConfig,
  ValidationResult,
  ValidationIssue,
} from "@/lib/sports/types";

// ─── Field zones ─────────────────────────────────────────────
// Junior RL is positionless and the field is treated as a single
// region from a roster point of view. We model a single "field"
// zone so the SportConfig + AgeGroupConfig shape stays uniform with
// AFL and netball; the live-game UI renders it as one on-field
// bucket + bench.
const RL_ZONES: ZoneDef[] = [
  { id: "field", label: "Field", shortLabel: "Fld" },
];

// ─── Positions ───────────────────────────────────────────────
// A single synthetic position. Vested roles (FR/DH) are tracked
// separately as event metadata, not as positions — a player can
// be wearing a vest AND be on-field as "player" simultaneously.
const RL_POSITIONS: PositionDef[] = [
  { id: "player", label: "Player", shortLabel: "P" },
];

// ─── Score types ─────────────────────────────────────────────
// try = 4, conversion = 2. Opponent variants for both. U6/U7 have
// `tracksScoreDefault: false` on the age-group so the score UI
// hides itself — no separate "no-score" config needed.
const RL_SCORE_TYPES: ScoreTypeDef[] = [
  { id: "try", label: "Try", shortLabel: "T", points: 4 },
  { id: "conversion", label: "Conversion", shortLabel: "C", points: 2 },
  { id: "opponent_try", label: "Opponent Try", shortLabel: "+T", points: 4, opponent: true },
  { id: "opponent_conversion", label: "Opp. Conversion", shortLabel: "+C", points: 2, opponent: true },
];

// ─── Age group templates ─────────────────────────────────────
// Two repeating blocks reduce duplication: the U6–U9 quarters
// block and the U10–U12 halves block. Per-age values (squad size,
// vests, scoring, kicking) layer on top.

// U6/U7/U8/U9 — 4 × 8-minute quarters. Subs allowed during quarters
// (rolling subs are legal in junior RL); we default the rotation
// suggestion interval to 4 min = half a quarter.
const QUARTER_PERIOD_SECONDS = 8 * 60;
const HALF_PERIOD_SECONDS = 20 * 60;
const QUARTER_SUB_INTERVAL = 4 * 60;
const HALF_SUB_INTERVAL = 10 * 60;

const RL_AGE_GROUPS: AgeGroupConfig[] = [
  {
    id: "U6",
    label: "U6 (Tag)",
    positions: ["player"],
    zones: ["field"],
    defaultOnFieldSize: 6,
    minOnFieldSize: 4,
    maxOnFieldSize: 6,
    maxSquadSize: 10,
    periodCount: 4,
    periodSeconds: QUARTER_PERIOD_SECONDS,
    subIntervalSeconds: QUARTER_SUB_INTERVAL,
    subIntervalFloorSeconds: 240,
    tracksScoreDefault: false,
    notes: "League Tag — no tackling, no kicking, no scoring tracked. 4 × 8-min quarters.",
    periodLabel: "quarter",
    periodLabelPlural: "quarters",
    kickingAllowed: false,
    // No vests at U6.
    minUnbrokenPeriods: 2,
    // Tag is positionless in spirit; 3F/3B is a balanced default the
    // coach can rebalance per game.
    forwardCount: 3,
  },
  {
    id: "U7",
    label: "U7 (Tag → Tackle)",
    positions: ["player"],
    zones: ["field"],
    defaultOnFieldSize: 6,
    minOnFieldSize: 4,
    maxOnFieldSize: 6,
    maxSquadSize: 10,
    periodCount: 4,
    periodSeconds: QUARTER_PERIOD_SECONDS,
    subIntervalSeconds: QUARTER_SUB_INTERVAL,
    subIntervalFloorSeconds: 240,
    tracksScoreDefault: false,
    notes: "Tag rugby, transitioning to tackle via TackleReady program. No kicking, no scoring tracked.",
    periodLabel: "quarter",
    periodLabelPlural: "quarters",
    kickingAllowed: false,
    minUnbrokenPeriods: 2,
    forwardCount: 3,
  },
  {
    id: "U8",
    label: "U8",
    positions: ["player"],
    zones: ["field"],
    defaultOnFieldSize: 8,
    minOnFieldSize: 6,
    maxOnFieldSize: 8,
    maxSquadSize: 12,
    periodCount: 4,
    periodSeconds: QUARTER_PERIOD_SECONDS,
    subIntervalSeconds: QUARTER_SUB_INTERVAL,
    subIntervalFloorSeconds: 240,
    tracksScoreDefault: true,
    notes: "Modified tackle — try (4), conversion (2). FR vest rotates each quarter; no player wears it twice.",
    periodLabel: "quarter",
    periodLabelPlural: "quarters",
    kickingAllowed: true,
    vestRequirements: { fr: true, dh: false },
    minUnbrokenPeriods: 2,
    // 8 on field, 4F/4B.
    forwardCount: 4,
  },
  {
    id: "U9",
    label: "U9",
    positions: ["player"],
    zones: ["field"],
    defaultOnFieldSize: 8,
    minOnFieldSize: 6,
    maxOnFieldSize: 8,
    maxSquadSize: 12,
    periodCount: 4,
    periodSeconds: QUARTER_PERIOD_SECONDS,
    subIntervalSeconds: QUARTER_SUB_INTERVAL,
    subIntervalFloorSeconds: 240,
    tracksScoreDefault: true,
    notes: "Modified tackle. FR + DH vests rotate each quarter; no player wears either twice.",
    periodLabel: "quarter",
    periodLabelPlural: "quarters",
    kickingAllowed: true,
    vestRequirements: { fr: true, dh: true },
    minUnbrokenPeriods: 2,
    forwardCount: 4,
  },
  {
    id: "U10",
    label: "U10",
    positions: ["player"],
    zones: ["field"],
    defaultOnFieldSize: 11,
    minOnFieldSize: 8,
    maxOnFieldSize: 11,
    // 20 matches AFL's U8-U12 cap and the squad-step copy
    // ("15-20 kids gives you plenty of cover"). Junior Laws §3-4
    // don't impose a cap on U10+, so we use the same ceiling as
    // AFL to keep cross-sport expectations consistent.
    maxSquadSize: 20,
    periodCount: 2,
    periodSeconds: HALF_PERIOD_SECONDS,
    subIntervalSeconds: HALF_SUB_INTERVAL,
    subIntervalFloorSeconds: 240,
    tracksScoreDefault: true,
    notes: "Modified tackle — 2 × 20-min halves, 5-min break. Each player must play 1 unbroken half. FR + DH vests rotate each half.",
    periodLabel: "half",
    periodLabelPlural: "halves",
    kickingAllowed: true,
    vestRequirements: { fr: true, dh: true },
    minUnbrokenPeriods: 1,
    // 11 on field. 5F/6B mirrors the typical 9-a-side junior split
    // (4F/5B) scaled up — backs carry the extra body because RL adds
    // a fullback to the back line, not the forward pack.
    forwardCount: 5,
  },
  {
    id: "U11",
    label: "U11",
    positions: ["player"],
    zones: ["field"],
    defaultOnFieldSize: 11,
    minOnFieldSize: 8,
    maxOnFieldSize: 11,
    maxSquadSize: 20,
    periodCount: 2,
    periodSeconds: HALF_PERIOD_SECONDS,
    subIntervalSeconds: HALF_SUB_INTERVAL,
    subIntervalFloorSeconds: 240,
    tracksScoreDefault: true,
    notes: "Modified tackle — 2 × 20-min halves. Same vest + rotation rules as U10.",
    periodLabel: "half",
    periodLabelPlural: "halves",
    kickingAllowed: true,
    vestRequirements: { fr: true, dh: true },
    minUnbrokenPeriods: 1,
    forwardCount: 5,
  },
  {
    id: "U12",
    label: "U12",
    positions: ["player"],
    zones: ["field"],
    defaultOnFieldSize: 13,
    minOnFieldSize: 11,
    maxOnFieldSize: 13,
    // 20 keeps cover for 13-on-field with the same headroom AFL
    // age groups get; bench depth matters more once two halves
    // run unbroken.
    maxSquadSize: 20,
    periodCount: 2,
    periodSeconds: HALF_PERIOD_SECONDS,
    subIntervalSeconds: HALF_SUB_INTERVAL,
    subIntervalFloorSeconds: 240,
    tracksScoreDefault: true,
    notes: "Full-field modified tackle (100×68m) — 13-a-side, place-kick conversions only, 40/20 rule applies.",
    periodLabel: "half",
    periodLabelPlural: "halves",
    kickingAllowed: true,
    vestRequirements: { fr: true, dh: true },
    minUnbrokenPeriods: 1,
    // 13 on field — front-row pack of 6, back-line of 7.
    forwardCount: 6,
  },
];

// ─── Lineup shape used by validateLineup ─────────────────────
// Junior RL is positionless: `{ field: PlayerId[], bench: PlayerId[] }`.
// Defined as `LeagueLineup` in `@/lib/types` for cross-module reuse
// (the server actions and replay engine consume the same shape).
import type { LeagueLineup } from "@/lib/types";

function validateRugbyLeagueLineup(
  lineup: unknown,
  ageGroup: AgeGroupConfig,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const l = lineup as LeagueLineup;

  if (
    !l ||
    typeof l !== "object" ||
    !Array.isArray(l.forwards) ||
    !Array.isArray(l.backs) ||
    !Array.isArray(l.bench)
  ) {
    return {
      ok: false,
      issues: [{ kind: "error", message: "Invalid lineup shape." }],
    };
  }

  // On-field count = forwards + backs. Coach can ignore the
  // position split (everyone in one bucket), but the totals still
  // have to land inside the age-group's legal window.
  const onFieldCount = l.forwards.length + l.backs.length;
  if (onFieldCount > ageGroup.maxOnFieldSize) {
    issues.push({
      kind: "error",
      message: `Too many players on field (${onFieldCount}); max is ${ageGroup.maxOnFieldSize}.`,
      positionId: "player",
    });
  } else if (onFieldCount < ageGroup.minOnFieldSize) {
    issues.push({
      kind: "warn",
      message: `Below the recommended minimum (${ageGroup.minOnFieldSize}); local-league discretion to proceed.`,
      positionId: "player",
    });
  }

  // No player double-booked across forwards / backs / bench (or
  // repeated within a single pool).
  const seen = new Map<string, string>();
  const mark = (pid: string, slot: string) => {
    if (!pid) return;
    const existing = seen.get(pid);
    if (existing && existing !== slot) {
      issues.push({
        kind: "error",
        message: `Player is in both ${existing} and ${slot}.`,
        playerId: pid,
      });
    } else if (existing === slot) {
      issues.push({
        kind: "error",
        message: `Player listed twice in ${slot}.`,
        playerId: pid,
      });
    }
    seen.set(pid, slot);
  };
  for (const playerId of l.forwards) mark(playerId, "forwards");
  for (const playerId of l.backs) mark(playerId, "backs");
  for (const playerId of l.bench) mark(playerId, "bench");

  return { ok: issues.filter((i) => i.kind === "error").length === 0, issues };
}

// ─── SportConfig export ──────────────────────────────────────
// `brand.palette` reuses AFL's `"brand"` palette while v1 ships under
// the existing Siren brand. A future brand phase will widen the
// palette union and introduce a rugby_league-specific colour ladder
// keyed off `sirenleague.com.au`.
export const rugbyLeagueSport: SportConfig = {
  id: "rugby_league",
  name: "Rugby League",
  shortName: "League",
  brand: {
    id: "rugby_league",
    // Reserved host for the future brand phase; harmless until then
    // because getBrandForHost falls back to AFL on no-match.
    host: "sirenleague.com.au",
    name: "Siren League",
    tagline:
      "Junior rugby league coaching — fair playing time, rotated vests, live game control.",
    defaultSport: "rugby_league",
    palette: "brand",
  },
  zones: RL_ZONES,
  allPositions: RL_POSITIONS,
  scoreTypes: RL_SCORE_TYPES,
  ageGroups: RL_AGE_GROUPS,
  substitutionRule: "rolling",
  // The SportConfig-level label is U6–U9's default. U10–U12 override to
  // "half" via AgeGroupConfig.periodLabel; resolve via
  // `ageGroup.periodLabel ?? sport.periodLabel`.
  periodLabel: "quarter",
  periodLabelPlural: "quarters",
  fairnessModel: "unbroken-period",
  validateLineup: validateRugbyLeagueLineup,
};
