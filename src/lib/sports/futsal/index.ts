// ─── Futsal sport registration ───────────────────────────────
// Junior futsal runs on the soccer family's engine
// (.planning/FOUR-SPORTS-PLAN.md): a keeper slot, lines, rolling
// ("flying") subs, halves, goals. It joins the family as rugby union
// joined league's: shared code, futsal's own rules, every one stated
// here (sports are independent): nothing is borrowed from soccer.
//
// The plan's recommended defaults (taken 22 Oct 2026):
//   - Name "Futsal", code id `futsal`, the main Siren brand.
//   - 5 a side with a keeper at every age (Capital Football, Chandler,
//     Sydney Olympic Park, Football NSW); a side can start with 3
//     (Capital's Minis). Squads up to 12 (Football NSW's junior cup).
//   - Halves on a running clock: 2 × 15 to U9 (Capital's Minis), 2 × 20
//     from U10.
//   - Keeper: "Everyone has a turn" to U11 (the MiniRoos game-time
//     template rotates U6–U11 through goal), "Keepers" from U12.
//   - Scores off to U9 (Capital's Minis record none), on from U10.
//   - Shapes: 2-2 first (the easiest for kids), the diamond (1-2-1) and
//     3-1; smaller shapes for a side one or two short.

import type { PositionDef, ScoreTypeDef, SportConfig, ZoneDef } from "@/lib/sports/types";
import { deriveSubIntervalSeconds } from "@/lib/sports/subInterval";
import { aflSport } from "@/lib/sports/afl";
import { validateSoccerLineup } from "@/lib/sports/soccer/lineup";
import { soccerFamilyPeriodBreak } from "@/lib/sports/soccer";
import type {
  SoccerAgeGroupConfig,
  SoccerFamilyRules,
  SoccerFormation,
  SoccerKeeperStrategy,
} from "@/lib/sports/soccer/types";

const FUTSAL_ZONES: ZoneDef[] = [{ id: "field", label: "Court", shortLabel: "Crt" }];
const FUTSAL_POSITIONS: PositionDef[] = [{ id: "player", label: "Player", shortLabel: "P" }];

// A goal is a point, for both sides, on the shared +G chip.
const FUTSAL_SCORE_TYPES: ScoreTypeDef[] = [
  { id: "goal", label: "Goal", shortLabel: "G", points: 1 },
  { id: "opponent_goal", label: "Opponent goal", shortLabel: "+G", points: 1, opponent: true },
];

/**
 * A futsal shape with a keeper. The family's lines read back to front:
 * `def` is the back (fixo), `mid` the wings (alas), `att` the front
 * (pivô). "2-2" is two back and two up front.
 */
function shape(id: string, def: number, mid: number, att: number): SoccerFormation {
  return { id, keeper: true, lines: { def, mid, att, field: 0 } };
}

// By players on the court, keeper included, default first.
const FUTSAL_SHAPES: Record<number, SoccerFormation[]> = {
  3: [shape("1-1", 1, 0, 1)],
  4: [shape("2-1", 2, 0, 1), shape("1-1-1", 1, 1, 1)],
  5: [shape("2-2", 2, 0, 2), shape("1-2-1", 1, 2, 1), shape("3-1", 3, 0, 1)],
};

interface FutsalAge {
  id: string;
  label: string;
  /** Minutes a half. */
  minutes: number;
  scores: boolean;
  keeper: SoccerKeeperStrategy;
}

const AGES: FutsalAge[] = [
  { id: "U6", label: "Under 6", minutes: 15, scores: false, keeper: "turns" },
  { id: "U7", label: "Under 7", minutes: 15, scores: false, keeper: "turns" },
  { id: "U8", label: "Under 8", minutes: 15, scores: false, keeper: "turns" },
  { id: "U9", label: "Under 9", minutes: 15, scores: false, keeper: "turns" },
  { id: "U10", label: "Under 10", minutes: 20, scores: true, keeper: "turns" },
  { id: "U11", label: "Under 11", minutes: 20, scores: true, keeper: "turns" },
  { id: "U12", label: "Under 12", minutes: 20, scores: true, keeper: "keepers" },
  { id: "U13", label: "Under 13", minutes: 20, scores: true, keeper: "keepers" },
  { id: "U14", label: "Under 14", minutes: 20, scores: true, keeper: "keepers" },
  { id: "U15", label: "Under 15", minutes: 20, scores: true, keeper: "keepers" },
  { id: "U16", label: "Under 16", minutes: 20, scores: true, keeper: "keepers" },
  { id: "U17", label: "Under 17", minutes: 20, scores: true, keeper: "keepers" },
];

/** 5 a side with a keeper at every age; a side can start with 3. */
const ON_COURT = 5;
const MIN_ON_COURT = 3;
/** Football NSW's junior cup: at most 12 on the team sheet. */
const MAX_SQUAD = 12;

export const FUTSAL_AGE_GROUPS: SoccerAgeGroupConfig[] = AGES.map((a) => {
  const periodSeconds = a.minutes * 60;
  return {
    id: a.id,
    label: a.label,
    positions: ["player"],
    zones: ["field"],
    defaultOnFieldSize: ON_COURT,
    minOnFieldSize: MIN_ON_COURT,
    maxOnFieldSize: ON_COURT,
    maxSquadSize: MAX_SQUAD,
    periodCount: 2,
    periodSeconds,
    subIntervalSeconds: deriveSubIntervalSeconds(periodSeconds, 240),
    subIntervalFloorSeconds: 240,
    tracksScoreDefault: a.scores,
    notes: `5 a side with a keeper, 2 × ${a.minutes}-min halves${a.scores ? "" : ", no score kept"}.`,
    periodLabel: "half",
    periodLabelPlural: "halves",
    keeper: a.keeper,
    formations: FUTSAL_SHAPES,
    subMode: { kind: "rolling" },
  };
});

const FIFA_FUTSAL = "FIFA Futsal Laws of the Game";

/**
 * Futsal's settings on the soccer family's engine (soccer/types.ts):
 * Back, Wings and Front (fixo, alas and pivô, explained in Help), a
 * futsal court, and a keeper who can swap mid-half (FIFA Law 3 lets a
 * sub swap with the keeper at any time; the kit is a different shirt).
 */
export const FUTSAL_RULES: SoccerFamilyRules = {
  lineLabels: {
    gk: { label: "Keeper", short: "GK", phrase: "goal" },
    def: { label: "Back", short: "BACK", phrase: "the back" },
    mid: { label: "Wings", short: "WING", phrase: "the wings" },
    att: { label: "Front", short: "FRONT", phrase: "the front" },
    field: { label: "Court", short: "", phrase: "the court" },
  },
  surface: "court",
  keeperSwapMidPeriod: true,
  keeperKitUpSeconds: null,
  keeperGear: "Keeper top",
  halvesOrQuarters: false,
  // FIFA futsal's flying substitutions, through the sub zone.
  rollingSubs: { label: "Flying subs", note: "on and off through the sub zone, as often as you like" },
  minLines: null,
  ruleSource: {
    laws: [
      { id: "futsal-subs", text: "Subs fly on and off at any time through the sub zone, as often as you like", source: FIFA_FUTSAL },
      { id: "futsal-keeper", text: "A sub can swap with the keeper at any time", source: FIFA_FUTSAL },
      { id: "futsal-scores", text: "No scores are kept", source: "Capital Football Minis", ages: ["U6", "U7", "U8", "U9"] },
    ],
    format: { source: FIFA_FUTSAL, ages: AGES.map((a) => a.id) },
    equalTime: "Football Australia: equal playing time is a priority",
  },
  scoringCopy: {
    on: "Junior futsal keeps score from about Under 10",
    off: "Capital Football's Minis keep no scores",
  },
  strategyCopy: {
    turns: {
      blurb: "One keeper a half, the fewest keeper minutes first. Mark keen keepers, and kids who'd rather not.",
      fit: "Under 6 to Under 11",
    },
    keepers: {
      blurb: "You mark your keepers (Keen keeper, under Role) and they share goal. Everyone else rotates through the back, the wings and the front.",
      fit: "Under 12 and up",
    },
    // Futsal always plays with a keeper, so this one isn't offered.
    minutes: {
      blurb: "No keeper and no lines: kids just play, and Siren evens out their minutes.",
      fit: "",
    },
  },
  emoji: "⚽",
};

// Futsal lives under the main Siren brand, as soccer: the main site's
// host (so no host resolves to futsal; see getBrandForHost) and the
// "Siren" name on what it sends.
export const futsalSport: SportConfig = {
  id: "futsal",
  family: "soccer",
  name: "Futsal",
  shortName: "Futsal",
  brand: {
    ...aflSport.brand,
    name: "Siren",
    tagline: "Junior futsal coaching — fair minutes, keeper turns, flying subs.",
    defaultSport: "futsal",
  },
  zones: FUTSAL_ZONES,
  allPositions: FUTSAL_POSITIONS,
  scoreTypes: FUTSAL_SCORE_TYPES,
  ageGroups: FUTSAL_AGE_GROUPS,
  substitutionRule: "rolling",
  periodLabel: "half",
  periodLabelPlural: "halves",
  // Minutes per line and in goal.
  fairnessModel: "zone-minutes",
  jerseyNumbers: true,
  teamSong: false,
  periodBreak: soccerFamilyPeriodBreak(FUTSAL_RULES),
  words: { sportName: "futsal", surface: "court", startCue: "whistle goes", endCue: "whistle" },
  surfaceArt: "futsal-court",
  validateLineup: (lineup, ageGroup, onFieldSize) => validateSoccerLineup(lineup, ageGroup, onFieldSize, FUTSAL_RULES),
};
