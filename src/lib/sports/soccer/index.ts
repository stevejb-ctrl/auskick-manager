// ─── Football (soccer) sport registration ────────────────────
// Junior soccer runs on its own engine (.planning/SOCCER-PLAN.md,
// decided 17 Oct 2026): a keeper slot, lines, rolling subs or sub
// windows, halves, goals. Every rule is stated here (sports are
// independent): nothing is borrowed from AFL, rugby or netball.
//
// Decided with Steve (17 Oct 2026):
//   - Name "Football (soccer)", short name "Football", code id `soccer`
//     (never "football" in code: to Siren that has meant AFL).
//   - Ages: MiniRoos national up to U11 (U6–U7 4v4 with no keeper,
//     U8–U9 7v7, U10–U11 9v9); U12–U13 9v9 at 2×30; U14 11v11 at 2×35;
//     U15–U17 11v11 at 2×40. The team overrides players on the field
//     and half length (migration 0067).
//   - Scores off by default up to U11 (MiniRoos keeps none), on from
//     U12. The coach's Track scoring switch stays.
//   - Keeper: "Everyone has a turn" at U8–U11, "Keepers" from U12.
//   - Subs: rolling by default; windows per half are the other mode.
//   - 4v4: no lines, minutes only.
//   - Brand: the main Siren brand, no site of its own (as union).
//
// Siren's own calls, not in the plan (flagged for Steve):
//   - Size ranges let a short squad start one or two down (and U12–U13
//     go up to 11, where NSW plays it); squads are the most on the
//     field plus the plan's bench.
//   - Shapes for the short sizes (5, 6, 8 and 10 with a keeper): the
//     plan lists 7, 9 and 11 only.

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
import { validateSoccerLineup } from "@/lib/sports/soccer/lineup";
import type {
  SoccerAgeGroupConfig,
  SoccerFamilyRules,
  SoccerFormation,
  SoccerKeeperStrategy,
  SoccerLine,
  SoccerSubMode,
} from "@/lib/sports/soccer/types";

// One field region and one synthetic position, as rugby: who keeps goal
// and who plays which line lives on the lineup, not on a position list.
const SOCCER_ZONES: ZoneDef[] = [{ id: "field", label: "Field", shortLabel: "Fld" }];
const SOCCER_POSITIONS: PositionDef[] = [{ id: "player", label: "Player", shortLabel: "P" }];

// A goal is a point, for both sides. The chips read as AFL's (+G) so the
// score bug keeps the shared token.
const SOCCER_SCORE_TYPES: ScoreTypeDef[] = [
  { id: "goal", label: "Goal", shortLabel: "G", points: 1 },
  { id: "opponent_goal", label: "Opponent goal", shortLabel: "+G", points: 1, opponent: true },
];

/** A shape with a keeper: kids in defence, midfield and attack. */
function shape(def: number, mid: number, att: number): SoccerFormation {
  return { id: `${def}-${mid}-${att}`, keeper: true, lines: { def, mid, att, field: 0 } };
}

/** No keeper and no lines (4 a side): everyone in the field. */
function noLines(players: number): SoccerFormation {
  return { id: "no-lines", keeper: false, lines: { def: 0, mid: 0, att: 0, field: players } };
}

// Shapes with a keeper, by players on the field (keeper included),
// default first. 7, 9 and 11 are the plan's (2-3-1 or 3-2-1; 3-3-2 or
// 3-2-3; 4-3-3 or 4-4-2), each with at least three lines (FV's U12–U13
// rule). The rest are for a side one or two short.
const KEEPER_SHAPES: Record<number, SoccerFormation[]> = {
  5: [shape(2, 1, 1), shape(1, 2, 1)],
  6: [shape(2, 2, 1), shape(2, 1, 2)],
  7: [shape(2, 3, 1), shape(3, 2, 1)],
  8: [shape(3, 3, 1), shape(3, 2, 2)],
  9: [shape(3, 3, 2), shape(3, 2, 3)],
  10: [shape(4, 3, 2), shape(3, 4, 2)],
  11: [shape(4, 3, 3), shape(4, 4, 2)],
};

/**
 * Football Tasmania's windows (three a half, none in the last 2
 * minutes): what windows mode starts from when a coach turns it on.
 * Every age defaults to rolling subs.
 */
export const SOCCER_WINDOWS_PRESET: SoccerSubMode = { kind: "windows", perPeriod: 3, cutoffSeconds: 120 };

const ROLLING: SoccerSubMode = { kind: "rolling" };

interface SoccerAge {
  id: string;
  label: string;
  players: number;
  min: number;
  max: number;
  /** The plan's bench: kids on the team sheet beyond those on the field. */
  bench: number;
  /** Minutes a half. */
  minutes: number;
  scores: boolean;
  keeper: SoccerKeeperStrategy;
  notes: string;
}

const AGES: SoccerAge[] = [
  { id: "U6", label: "Under 6", players: 4, min: 3, max: 4, bench: 3, minutes: 20, scores: false, keeper: "none", notes: "MiniRoos — 4 a side, no keeper, 2 × 20-min halves, no score kept." },
  { id: "U7", label: "Under 7", players: 4, min: 3, max: 4, bench: 3, minutes: 20, scores: false, keeper: "none", notes: "MiniRoos — 4 a side, no keeper, 2 × 20-min halves, no score kept." },
  { id: "U8", label: "Under 8", players: 7, min: 5, max: 7, bench: 4, minutes: 20, scores: false, keeper: "turns", notes: "MiniRoos — 7 a side with a keeper, 2 × 20-min halves, no score kept." },
  { id: "U9", label: "Under 9", players: 7, min: 5, max: 7, bench: 4, minutes: 20, scores: false, keeper: "turns", notes: "MiniRoos — 7 a side with a keeper, 2 × 20-min halves, no score kept." },
  { id: "U10", label: "Under 10", players: 9, min: 7, max: 9, bench: 5, minutes: 25, scores: false, keeper: "turns", notes: "MiniRoos — 9 a side with a keeper, 2 × 25-min halves, no score kept." },
  { id: "U11", label: "Under 11", players: 9, min: 7, max: 9, bench: 5, minutes: 25, scores: false, keeper: "turns", notes: "MiniRoos — 9 a side with a keeper, 2 × 25-min halves, no score kept." },
  { id: "U12", label: "Under 12", players: 9, min: 7, max: 11, bench: 5, minutes: 30, scores: true, keeper: "keepers", notes: "9 a side (11 in parts of NSW), 2 × 30-min halves." },
  { id: "U13", label: "Under 13", players: 9, min: 7, max: 11, bench: 5, minutes: 30, scores: true, keeper: "keepers", notes: "9 a side (11 in parts of NSW), 2 × 30-min halves." },
  { id: "U14", label: "Under 14", players: 11, min: 9, max: 11, bench: 5, minutes: 35, scores: true, keeper: "keepers", notes: "11 a side, 2 × 35-min halves." },
  { id: "U15", label: "Under 15", players: 11, min: 9, max: 11, bench: 5, minutes: 40, scores: true, keeper: "keepers", notes: "11 a side, 2 × 40-min halves." },
  { id: "U16", label: "Under 16", players: 11, min: 9, max: 11, bench: 5, minutes: 40, scores: true, keeper: "keepers", notes: "11 a side, 2 × 40-min halves." },
  { id: "U17", label: "Under 17", players: 11, min: 9, max: 11, bench: 5, minutes: 40, scores: true, keeper: "keepers", notes: "11 a side, 2 × 40-min halves." },
];

function formationsFor(a: SoccerAge): Record<number, SoccerFormation[]> {
  const out: Record<number, SoccerFormation[]> = {};
  for (let n = a.min; n <= a.max; n++) {
    out[n] = a.keeper === "none" ? [noLines(n)] : KEEPER_SHAPES[n];
  }
  return out;
}

export const SOCCER_AGE_GROUPS: SoccerAgeGroupConfig[] = AGES.map((a) => {
  const periodSeconds = a.minutes * 60;
  return {
    id: a.id,
    label: a.label,
    positions: ["player"],
    zones: ["field"],
    defaultOnFieldSize: a.players,
    minOnFieldSize: a.min,
    maxOnFieldSize: a.max,
    maxSquadSize: a.max + a.bench,
    periodCount: 2,
    periodSeconds,
    subIntervalSeconds: deriveSubIntervalSeconds(periodSeconds, 240),
    subIntervalFloorSeconds: 240,
    tracksScoreDefault: a.scores,
    notes: a.notes,
    periodLabel: "half",
    periodLabelPlural: "halves",
    keeper: a.keeper,
    formations: formationsFor(a),
    subMode: ROLLING,
  };
});

/**
 * The shapes for an age group at an on-field size, the default first. A
 * size outside the age group's range takes the nearest it plays.
 */
export function soccerFormations(ageGroup: SoccerAgeGroupConfig, onFieldSize: number): SoccerFormation[] {
  const size = Math.min(ageGroup.maxOnFieldSize, Math.max(ageGroup.minOnFieldSize, Math.round(onFieldSize)));
  return ageGroup.formations[size];
}

/** The MiniRoos ages (U6–U11), whose laws and formats come from Football Australia. */
const MINIROOS_AGES = ["U6", "U7", "U8", "U9", "U10", "U11"] as const;
const MINIROOS = "Football Australia MiniRoos";

/**
 * Soccer's settings on the family's engine (soccer/types.ts): its line
 * words, its pitch, keeper swaps any time, and MiniRoos' laws.
 */
export const SOCCER_RULES: SoccerFamilyRules = {
  lineLabels: {
    gk: { label: "Keeper", short: "GK", phrase: "goal" },
    def: { label: "Defence", short: "DEF", phrase: "defence" },
    mid: { label: "Midfield", short: "MID", phrase: "midfield" },
    att: { label: "Attack", short: "ATT", phrase: "attack" },
    field: { label: "Field", short: "", phrase: "the field" },
  },
  surface: "pitch",
  keeperSwapMidPeriod: true,
  keeperKitUpSeconds: null,
  keeperGear: "Keeper top",
  halvesOrQuarters: false,
  rollingSubs: { label: "Rolling subs", note: "any time, as often as you like" },
  minLines: {
    ages: ["U12", "U13"],
    count: 3,
    message: "Football Victoria's U12–U13 rules ask for at least three lines.",
  },
  ruleSource: {
    laws: [
      { id: "miniroos-scores", text: "No scores or ladders are kept", source: MINIROOS, ages: MINIROOS_AGES },
      { id: "miniroos-subs", text: "Subs roll on and off at any time, as often as you like", source: MINIROOS, ages: MINIROOS_AGES },
      { id: "miniroos-offside", text: "No offside", source: MINIROOS, ages: MINIROOS_AGES },
    ],
    format: { source: MINIROOS, ages: MINIROOS_AGES },
    equalTime: "Football Australia: equal playing time is a priority",
  },
  scoringCopy: {
    on: "Junior competitions keep score from about Under 12",
    off: "MiniRoos keeps no scores or ladders",
  },
  strategyCopy: {
    turns: {
      blurb: "One keeper a half, the fewest keeper minutes first. Mark keen keepers, and kids who'd rather not.",
      fit: "MiniRoos (Under 8 to Under 11)",
    },
    keepers: {
      blurb: "You mark your keepers (Keen keeper, under Role) and they share goal. Everyone else rotates through the lines.",
      fit: "Under 12 and up",
    },
    minutes: {
      blurb: "4 a side, no keeper and no lines: kids just play, and Siren evens out their minutes.",
      fit: "Under 6 and Under 7",
    },
  },
  emoji: "⚽",
};

// Break screen, for every soccer-family sport: attack at the top, then
// the middle, the back and the keeper (the `gk` unit the family counts
// keeper minutes under), in the sport's own line words. A shape with no
// lines is one Field (or Court) zone. Slots are the staged lineup's
// lines, else the age group's default shape at this game's size.
const SOCCER_BREAK_ZONES: { key: SoccerLine | "gk"; color: BreakZoneColor }[] = [
  { key: "att", color: "zone1" },
  { key: "mid", color: "zone2" },
  { key: "def", color: "zone3" },
  { key: "gk", color: "zone4" },
  { key: "field", color: "zone2" },
];

/** A soccer-family sport's break zones and words, from its rules. */
export function soccerFamilyPeriodBreak(rules: SoccerFamilyRules): SportBreakSpec {
  return {
    zones: ({ ageGroup, onFieldSize, shape }) => {
      const formation = soccerFormations(ageGroup as SoccerAgeGroupConfig, onFieldSize)[0];
      const defaults: Record<string, number> = { ...formation.lines, gk: formation.keeper ? 1 : 0 };
      return SOCCER_BREAK_ZONES.map((z) => {
        const words = rules.lineLabels[z.key];
        return { ...z, label: words.label.toUpperCase(), short: words.label, slots: shape?.[z.key] ?? defaults[z.key] ?? 0 };
      }).filter((z) => z.slots > 0);
    },
    scoreDetail: "goals",
    lowTimeMs: 4 * 60_000,
  };
}

// Soccer lives under the main Siren brand, as union: the main site's
// host (so no host resolves to soccer; see getBrandForHost) and the
// "Siren" name on what it sends, such as invites.
export const soccerSport: SportConfig = {
  id: "soccer",
  family: "soccer",
  name: "Football (soccer)",
  shortName: "Football",
  brand: {
    ...aflSport.brand,
    name: "Siren",
    tagline: "Junior Football (soccer) coaching — fair game time, keeper turns, rolling subs.",
    defaultSport: "soccer",
  },
  zones: SOCCER_ZONES,
  allPositions: SOCCER_POSITIONS,
  scoreTypes: SOCCER_SCORE_TYPES,
  ageGroups: SOCCER_AGE_GROUPS,
  substitutionRule: "rolling",
  periodLabel: "half",
  periodLabelPlural: "halves",
  // Minutes per line and in goal.
  fairnessModel: "zone-minutes",
  jerseyNumbers: true,
  // Like rugby's, soccer's live screen plays no team song (the plan's call).
  teamSong: false,
  periodBreak: soccerFamilyPeriodBreak(SOCCER_RULES),
  validateLineup: (lineup, ageGroup, onFieldSize) => validateSoccerLineup(lineup, ageGroup, onFieldSize, SOCCER_RULES),
};
