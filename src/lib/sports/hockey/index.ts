// ─── Hockey sport registration ───────────────────────────────
// Junior (field) hockey runs on the soccer family's engine
// (.planning/FOUR-SPORTS-PLAN.md): a keeper slot, lines, rolling subs,
// halves or quarters, goals. It joins the family as rugby union joined
// league's: shared code, hockey's own rules, every one stated here
// (sports are independent): nothing is borrowed from soccer.
//
// The plan's recommended defaults (taken 22 Oct 2026). The states
// disagree (VIC even ages and Hockey5s minis, NSW odd ages and half
// fields, WA quarters by school year), so these are a middle path the
// team overrides (players on the field, period length, halves or
// quarters):
//   - Name "Hockey", code id `hockey`, the main Siren brand.
//   - U7–U8: 6 a side, no keeper and no lines, 2 × 15.
//   - U9–U10: 7 with a keeper, 2 × 20. U11: 8 with a keeper, 2 × 20.
//     U12: 11 with a keeper, 2 × 25.
//   - U13–U17: 11 with a keeper, 4 × 15 quarters (FIH; SEHA 4 × 14, WA
//     4 × 17). VIC plays 2 × 30: teams.period_count (migration 0069).
//   - Keeper: none at U7–U8; "Everyone has a turn" U9–U12, changed only
//     at a break (keeper kit takes minutes to put on); "Keepers" from
//     U13.
//   - Scores off to U10 (VIC shows no U8/U10 results; SEHA's U9 is
//     non-competitive), on from U11.
//   - Squads: 12 to U10, 13 at U11 (SEHA), 16 from U12 (VIC, WA).
//
// Siren's own calls, not in the plan (flagged for Steve):
//   - The shapes at each size are a first cut: Newcastle's sheets name
//     the lines (defenders, midfield, strikers) but not junior shapes.
//     A hockey coach should check them.

import type { PositionDef, ScoreTypeDef, SportConfig, ZoneDef } from "@/lib/sports/types";
import { deriveSubIntervalSeconds } from "@/lib/sports/subInterval";
import { aflSport } from "@/lib/sports/afl";
import { validateSoccerLineup } from "@/lib/sports/soccer/lineup";
import type {
  SoccerAgeGroupConfig,
  SoccerFamilyRules,
  SoccerFormation,
  SoccerKeeperStrategy,
} from "@/lib/sports/soccer/types";

const HOCKEY_ZONES: ZoneDef[] = [{ id: "field", label: "Field", shortLabel: "Fld" }];
const HOCKEY_POSITIONS: PositionDef[] = [{ id: "player", label: "Player", shortLabel: "P" }];

// A field goal is a point, for both sides, on the shared +G chip.
const HOCKEY_SCORE_TYPES: ScoreTypeDef[] = [
  { id: "goal", label: "Goal", shortLabel: "G", points: 1 },
  { id: "opponent_goal", label: "Opponent goal", shortLabel: "+G", points: 1, opponent: true },
];

/**
 * A hockey shape with a keeper: defenders, midfield and strikers, back
 * to front ("4-3-3").
 */
function shape(def: number, mid: number, att: number): SoccerFormation {
  return { id: `${def}-${mid}-${att}`, keeper: true, lines: { def, mid, att, field: 0 } };
}

/** No keeper and no lines (the minis): everyone in the field. */
function noLines(players: number): SoccerFormation {
  return { id: "no-lines", keeper: false, lines: { def: 0, mid: 0, att: 0, field: players } };
}

// Shapes with a keeper, by players on the field (keeper included),
// default first.
const KEEPER_SHAPES: Record<number, SoccerFormation[]> = {
  5: [shape(2, 1, 1), shape(1, 2, 1)],
  6: [shape(2, 2, 1), shape(2, 1, 2)],
  7: [shape(2, 2, 2), shape(3, 2, 1)],
  8: [shape(3, 2, 2), shape(2, 3, 2)],
  9: [shape(3, 3, 2), shape(3, 2, 3)],
  10: [shape(3, 3, 3), shape(4, 3, 2)],
  11: [shape(4, 3, 3), shape(3, 4, 3)],
};

interface HockeyAge {
  id: string;
  label: string;
  players: number;
  min: number;
  max: number;
  squad: number;
  periods: 2 | 4;
  /** Minutes a period. */
  minutes: number;
  scores: boolean;
  keeper: SoccerKeeperStrategy;
}

const MINIS = { players: 6, min: 4, max: 7, squad: 12, periods: 2, minutes: 15, scores: false, keeper: "none" } as const;
const HALF_FIELD = { players: 7, min: 5, max: 8, squad: 12, periods: 2, minutes: 20, scores: false, keeper: "turns" } as const;
const FULL_FIELD = { players: 11, min: 9, max: 11, squad: 16, periods: 4, minutes: 15, scores: true, keeper: "keepers" } as const;

const AGES: HockeyAge[] = [
  { id: "U7", label: "Under 7", ...MINIS },
  { id: "U8", label: "Under 8", ...MINIS },
  { id: "U9", label: "Under 9", ...HALF_FIELD },
  { id: "U10", label: "Under 10", ...HALF_FIELD },
  { id: "U11", label: "Under 11", players: 8, min: 7, max: 11, squad: 13, periods: 2, minutes: 20, scores: true, keeper: "turns" },
  { id: "U12", label: "Under 12", players: 11, min: 7, max: 11, squad: 16, periods: 2, minutes: 25, scores: true, keeper: "turns" },
  { id: "U13", label: "Under 13", ...FULL_FIELD },
  { id: "U14", label: "Under 14", ...FULL_FIELD },
  { id: "U15", label: "Under 15", ...FULL_FIELD },
  { id: "U16", label: "Under 16", ...FULL_FIELD },
  { id: "U17", label: "Under 17", ...FULL_FIELD },
];

function formationsFor(a: HockeyAge): Record<number, SoccerFormation[]> {
  const out: Record<number, SoccerFormation[]> = {};
  for (let n = a.min; n <= a.max; n++) {
    out[n] = a.keeper === "none" ? [noLines(n)] : KEEPER_SHAPES[n];
  }
  return out;
}

function notesFor(a: HockeyAge): string {
  const side = a.keeper === "none" ? `${a.players} a side, no keeper` : `${a.players} a side with a keeper`;
  const periods = a.periods === 4 ? `4 × ${a.minutes}-min quarters` : `2 × ${a.minutes}-min halves`;
  return `${side}, ${periods}${a.scores ? "" : ", no score kept"}.`;
}

export const HOCKEY_AGE_GROUPS: SoccerAgeGroupConfig[] = AGES.map((a) => {
  const periodSeconds = a.minutes * 60;
  const quarters = a.periods === 4;
  return {
    id: a.id,
    label: a.label,
    positions: ["player"],
    zones: ["field"],
    defaultOnFieldSize: a.players,
    minOnFieldSize: a.min,
    maxOnFieldSize: a.max,
    maxSquadSize: a.squad,
    periodCount: a.periods,
    periodSeconds,
    subIntervalSeconds: deriveSubIntervalSeconds(periodSeconds, 240),
    subIntervalFloorSeconds: 240,
    tracksScoreDefault: a.scores,
    notes: notesFor(a),
    periodLabel: quarters ? "quarter" : "half",
    periodLabelPlural: quarters ? "quarters" : "halves",
    keeper: a.keeper,
    formations: formationsFor(a),
    subMode: { kind: "rolling" },
  };
});

/**
 * Hockey's settings on the soccer family's engine (soccer/types.ts):
 * Defenders, Midfield and Strikers (the words Newcastle's sheets use),
 * a hockey pitch with shooting circles, and goal changing hands only at
 * a break: keeper kit takes minutes to put on, so the next keeper hears
 * two minutes before the break. Halves or quarters are the team's.
 */
export const HOCKEY_RULES: SoccerFamilyRules = {
  lineLabels: {
    gk: { label: "Keeper", short: "GK", phrase: "goal" },
    def: { label: "Defenders", short: "DEF", phrase: "the defenders" },
    mid: { label: "Midfield", short: "MID", phrase: "the midfield" },
    att: { label: "Strikers", short: "STR", phrase: "the strikers" },
    field: { label: "Field", short: "", phrase: "the field" },
  },
  surface: "hockey",
  keeperSwapMidPeriod: false,
  keeperKitUpSeconds: 120,
  keeperGear: "Keeper kit",
  halvesOrQuarters: true,
  minLines: null,
  ruleSource: {
    laws: [
      {
        id: "hockey-subs",
        text: "Subs roll on and off at any time, as often as you like, except during a penalty corner",
        source: "FIH Rules of Hockey",
      },
      {
        id: "hockey-equal",
        text: "Equal time on the field and in all positions",
        source: "Hockey NSW, Under 8 to Under 10",
        ages: ["U7", "U8", "U9", "U10"],
      },
    ],
    // The states play different formats (VIC, NSW, the ACT, WA), so no
    // one body's is quoted.
    format: null,
    equalTime: "Hockey NSW: equal time on the field",
  },
  scoringCopy: {
    on: "Junior hockey keeps results from about Under 11",
    off: "Junior hockey keeps no results up to about Under 10",
  },
  strategyCopy: {
    turns: {
      blurb: "Goal changes hands only at the breaks (keeper kit takes a few minutes), the fewest keeper minutes first. Siren names the next keeper before the break.",
      fit: "Under 9 to Under 12",
    },
    keepers: {
      blurb: "You name your keepers (home: Keeper) and they share goal, changing at the breaks. Everyone else rotates through the lines.",
      fit: "Under 13 and up",
    },
    minutes: {
      blurb: "6 a side, no keeper and no lines: kids just play, and Siren evens out their minutes.",
      fit: "Under 7 and Under 8",
    },
  },
  emoji: "🏑",
};

// Hockey lives under the main Siren brand, as soccer: the main site's
// host (so no host resolves to hockey; see getBrandForHost) and the
// "Siren" name on what it sends.
export const hockeySport: SportConfig = {
  id: "hockey",
  family: "soccer",
  name: "Hockey",
  shortName: "Hockey",
  brand: {
    ...aflSport.brand,
    name: "Siren",
    tagline: "Junior hockey coaching — fair minutes, keeper turns at the break, rolling subs.",
    defaultSport: "hockey",
  },
  zones: HOCKEY_ZONES,
  allPositions: HOCKEY_POSITIONS,
  scoreTypes: HOCKEY_SCORE_TYPES,
  ageGroups: HOCKEY_AGE_GROUPS,
  substitutionRule: "rolling",
  // Halves to U12; the quarters from U13 are each age group's own words.
  periodLabel: "half",
  periodLabelPlural: "halves",
  // Minutes per line and in goal.
  fairnessModel: "zone-minutes",
  jerseyNumbers: true,
  teamSong: false,
  validateLineup: (lineup, ageGroup, onFieldSize) => validateSoccerLineup(lineup, ageGroup, onFieldSize, HOCKEY_RULES),
};
