// ─── Basketball sport registration ───────────────────────────
// Junior basketball runs on its own engine (.planning/BASKETBALL-PLAN.md):
// five on court, rolling subs at a dead ball, halves (or quarters, the
// team's choice), 1-, 2- and 3-point baskets, personal fouls. Every rule
// is stated here (sports are independent): nothing is borrowed from
// AFL, netball, rugby or soccer.
//
// The plan's recommended defaults (built 18 Oct 2026):
//   - Name "Basketball", code id `basketball`, the main Siren brand.
//   - Ages U8–U18 in twos. 2 × 20-minute halves on a running clock from
//     U10 (VIC and WA domestic); U8 plays 2 × 12. A team can play
//     quarters instead (QLD, ACT: 4 × 10), migration 0069's
//     teams.period_count.
//   - Scores off at U8, on from U10; 3-pointers from U12; the coach's
//     foul tally on from U12; fouled out at 5.
//   - Positions optional, as in netball: Equal minutes ★ U8–U10, Guards
//     and forwards ★ U12–U14, Home line ★ U16–U18.
//
// Siren's own calls, not in the plan (flagged for Steve):
//   - A side can start one short (4 on court), as ACT's by-laws allow.
//   - The five positions keep basketball's standard labels (PG, SG, SF,
//     PF, C) and aren't renamed, as netball's bibs aren't.

import type {
  BreakZoneColor,
  PositionDef,
  ScoreTypeDef,
  SportBreakSpec,
  SportConfig,
  ZoneDef,
} from "@/lib/sports/types";
import { deriveSubIntervalSeconds } from "@/lib/sports/subInterval";
import { aflSport } from "@/lib/sports/afl";
import { validateBasketballLineup } from "@/lib/sports/basketball/lineup";
import type {
  BasketballAgeGroupConfig,
  BasketballLine,
  BasketballPositionDef,
  BasketballShape,
  BasketballStrategy,
} from "@/lib/sports/basketball/types";

// One court region and one synthetic position, as soccer: who plays
// which line or position lives on the lineup, not on a position list.
const BASKETBALL_ZONES: ZoneDef[] = [{ id: "court", label: "Court", shortLabel: "Crt" }];
const BASKETBALL_SYNTHETIC: PositionDef[] = [{ id: "player", label: "Player", shortLabel: "P" }];

// Baskets for both sides: a free throw is 1, a basket 2, a three 3.
const BASKETBALL_SCORE_TYPES: ScoreTypeDef[] = [
  { id: "free_throw", label: "Free throw", shortLabel: "+1", points: 1 },
  { id: "two_pointer", label: "Two", shortLabel: "+2", points: 2 },
  { id: "three_pointer", label: "Three", shortLabel: "+3", points: 3 },
  { id: "opponent_free_throw", label: "Opponent free throw", shortLabel: "+1", points: 1, opponent: true },
  { id: "opponent_two_pointer", label: "Opponent two", shortLabel: "+2", points: 2, opponent: true },
  { id: "opponent_three_pointer", label: "Opponent three", shortLabel: "+3", points: 3, opponent: true },
];

/** Points for each score event type, ours and theirs. */
export const BASKETBALL_POINTS: Record<string, number> = Object.fromEntries(
  BASKETBALL_SCORE_TYPES.map((t) => [t.id, t.points]),
);

/** Our score event types, 1 to 3 points. */
export const BASKETBALL_OWN_SCORES = ["free_throw", "two_pointer", "three_pointer"] as const;
/** Their score event types, 1 to 3 points. */
export const BASKETBALL_OPPONENT_SCORES = ["opponent_free_throw", "opponent_two_pointer", "opponent_three_pointer"] as const;
export type BasketballOwnScore = (typeof BASKETBALL_OWN_SCORES)[number];
export type BasketballOpponentScore = (typeof BASKETBALL_OPPONENT_SCORES)[number];

/**
 * The five positions, 1 to 5. Guards are 1–2 and forwards 3–5; the
 * centre counts as a forward.
 */
export const BASKETBALL_POSITION_DEFS: readonly BasketballPositionDef[] = [
  { key: "pg", number: 1, label: "PG", name: "Point guard", line: "guard" },
  { key: "sg", number: 2, label: "SG", name: "Shooting guard", line: "guard" },
  { key: "sf", number: 3, label: "SF", name: "Small forward", line: "forward" },
  { key: "pf", number: 4, label: "PF", name: "Power forward", line: "forward" },
  { key: "c", number: 5, label: "C", name: "Centre", line: "forward" },
];

/** A shape in guards and forwards. */
function shape(guard: number, forward: number): BasketballShape {
  return { id: `${guard}-${forward}`, lines: { guard, forward, court: 0 } };
}

// Shapes in lines by players on court, the default first. The plan's
// 2 guards and 3 forwards, or 3 and 2; a side one or two short keeps
// the balance.
const LINE_SHAPES: Record<number, BasketballShape[]> = {
  3: [shape(1, 2), shape(2, 1)],
  4: [shape(2, 2), shape(1, 3)],
  5: [shape(2, 3), shape(3, 2)],
};

/** Equal minutes: everyone on court, no lines. */
export function basketballCourtShape(players: number): BasketballShape {
  return { id: "court", lines: { guard: 0, forward: 0, court: players } };
}

/**
 * The line shapes at an on-court size, the default first. A size outside
 * 3–5 takes the nearest.
 */
export function basketballShapes(onCourtSize: number): BasketballShape[] {
  const size = Math.min(5, Math.max(3, Math.round(onCourtSize)));
  return LINE_SHAPES[size];
}

interface BasketballAge {
  id: string;
  label: string;
  /** Minutes a half. */
  minutes: number;
  scores: boolean;
  threes: boolean;
  fouls: boolean;
  strategy: BasketballStrategy;
  notes: string;
}

const AGES: BasketballAge[] = [
  { id: "U8", label: "Under 8", minutes: 12, scores: false, threes: false, fouls: false, strategy: "minutes", notes: "A skills session and a short game: 2 × 12-min halves, no score kept." },
  { id: "U10", label: "Under 10", minutes: 20, scores: true, threes: false, fouls: false, strategy: "minutes", notes: "2 × 20-min halves on a running clock. Lower ring, no zone, no 3-pointers." },
  { id: "U12", label: "Under 12", minutes: 20, scores: true, threes: true, fouls: true, strategy: "both-lines", notes: "2 × 20-min halves on a running clock. No zone defence." },
  { id: "U14", label: "Under 14", minutes: 20, scores: true, threes: true, fouls: true, strategy: "both-lines", notes: "2 × 20-min halves on a running clock. No zone defence." },
  { id: "U16", label: "Under 16", minutes: 20, scores: true, threes: true, fouls: true, strategy: "preferred-line", notes: "2 × 20-min halves on a running clock." },
  { id: "U18", label: "Under 18", minutes: 20, scores: true, threes: true, fouls: true, strategy: "preferred-line", notes: "2 × 20-min halves on a running clock." },
];

export const BASKETBALL_AGE_GROUPS: BasketballAgeGroupConfig[] = AGES.map((a) => {
  const periodSeconds = a.minutes * 60;
  return {
    id: a.id,
    label: a.label,
    positions: ["player"],
    zones: ["court"],
    defaultOnFieldSize: 5,
    minOnFieldSize: 4,
    maxOnFieldSize: 5,
    // Most comps take 10 on the scoresheet; the ACT and Gold Coast 12.
    maxSquadSize: 12,
    periodCount: 2,
    periodSeconds,
    subIntervalSeconds: deriveSubIntervalSeconds(periodSeconds, 240),
    subIntervalFloorSeconds: 240,
    tracksScoreDefault: a.scores,
    notes: a.notes,
    periodLabel: "half",
    periodLabelPlural: "halves",
    threePointers: a.threes,
    tracksFoulsDefault: a.fouls,
    foulOutAt: 5,
    suggestedStrategy: a.strategy,
    subCutoffSeconds: 60,
  };
});

/**
 * A basketball age group, with basketball's own rules. The id must be
 * one of basketball's (an unknown one is an error, not another age's
 * rules).
 */
export function basketballAgeGroup(id: string | null | undefined): BasketballAgeGroupConfig {
  const hit = BASKETBALL_AGE_GROUPS.find((a) => a.id === id);
  if (!hit) throw new Error(`Unknown basketball age group "${String(id)}"`);
  return hit;
}

/** The period counts a team can play: halves (the default) or quarters. */
export type BasketballPeriodCount = 2 | 4;

/**
 * The age group as a team plays it: halves, or quarters of half the
 * length (2 × 20 becomes 4 × 10), with the period words to match. The
 * team's own period length (teams.quarter_length_seconds) still wins,
 * through getEffectiveQuarterSeconds.
 */
export function basketballAgeGroupForTeam(
  ageGroupId: string | null | undefined,
  periodCount: number | null | undefined,
): BasketballAgeGroupConfig {
  const ag = basketballAgeGroup(ageGroupId);
  if (periodCount !== 4) return ag;
  const periodSeconds = ag.periodSeconds / 2;
  return {
    ...ag,
    periodCount: 4,
    periodSeconds,
    subIntervalSeconds: deriveSubIntervalSeconds(periodSeconds, ag.subIntervalFloorSeconds),
    periodLabel: "quarter",
    periodLabelPlural: "quarters",
  };
}

/**
 * Each line's colour, one token wherever it's drawn: the live tiles and
 * the break (UX audit 23 Oct 2026: guards were green on court, blue at
 * the break). Forwards take AFL's forward colour, guards its centre.
 */
export const BASKETBALL_LINE_ZONE: Record<BasketballLine, BreakZoneColor> = {
  forward: "zone1",
  guard: "zone2",
  court: "zone2",
};

// Break screen: forwards over guards, or one Court zone under Equal
// minutes (no lines). Slots are the staged lineup's lines, else the age
// group's suggested strategy's default shape.
const BASKETBALL_BREAK_ZONES: { key: BasketballLine; label: string; short: string; color: BreakZoneColor }[] = [
  { key: "forward", label: "FORWARDS", short: "Fwd", color: BASKETBALL_LINE_ZONE.forward },
  { key: "guard", label: "GUARDS", short: "Guard", color: BASKETBALL_LINE_ZONE.guard },
  { key: "court", label: "COURT", short: "Court", color: BASKETBALL_LINE_ZONE.court },
];

const basketballPeriodBreak: SportBreakSpec = {
  zones: ({ ageGroup, onFieldSize, shape }) => {
    const defaults =
      basketballAgeGroup(ageGroup.id).suggestedStrategy === "minutes"
        ? basketballCourtShape(onFieldSize)
        : basketballShapes(onFieldSize)[0];
    return BASKETBALL_BREAK_ZONES.map((z) => ({ ...z, slots: shape?.[z.key] ?? defaults.lines[z.key] })).filter(
      (z) => z.slots > 0,
    );
  },
  scoreDetail: "points",
  lowTimeMs: 4 * 60_000,
};

// Basketball lives under the main Siren brand, as union and soccer: the
// main site's host (so no host resolves to basketball; see
// getBrandForHost) and the "Siren" name on what it sends.
export const basketballSport: SportConfig = {
  id: "basketball",
  family: "basketball",
  name: "Basketball",
  shortName: "Basketball",
  brand: {
    ...aflSport.brand,
    name: "Siren",
    tagline: "Junior basketball coaching — fair minutes, guard and forward rotations, fouls on the bench.",
    defaultSport: "basketball",
  },
  zones: BASKETBALL_ZONES,
  allPositions: BASKETBALL_SYNTHETIC,
  scoreTypes: BASKETBALL_SCORE_TYPES,
  ageGroups: BASKETBALL_AGE_GROUPS,
  substitutionRule: "rolling",
  periodLabel: "half",
  periodLabelPlural: "halves",
  // Minutes in total, per line and per position.
  fairnessModel: "zone-minutes",
  jerseyNumbers: true,
  // As soccer's and rugby's, basketball's live screen plays no team song.
  teamSong: false,
  periodBreak: basketballPeriodBreak,
  validateLineup: validateBasketballLineup,
};
