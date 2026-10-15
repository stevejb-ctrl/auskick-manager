// ─── Rugby Union sport registration ──────────────────────────
// Junior rugby union runs on the rugby engine (two lines, rolling
// subs, halves, tries and conversions) with its own rules, all stated
// here (sports are independent, 14 Oct 2026): nothing is borrowed from
// league.
//
// Sources (.planning/RUGBY-UNION-PLAN.md, 14 Oct 2026):
//   - Sizes and halves: Rugby Australia's Kids Pathway by default (NSW
//     and WA play it as is). The range covers what other states play
//     (Sydney TriTag 5 / 6, Victoria 10 or 12, Brisbane 15); the coach
//     picks their competition's size per team or per game. Minimums
//     follow WA's. Half lengths: Hunter (NSW, 2025) from U10, Sydney
//     below.
//   - Scores: try 5, conversion 2, penalty goal 3, drop goal 3. The
//     pathway keeps no ladders to U12, so scores default off to U11.
//   - Interchange: unlimited rolling subs at every junior age.
//   - No vests, no kick rotations, no minimum-game-time law: How we
//     play's 50% floor applies.
//
// To confirm with Steve: kicking from U8 (U6–U7 is tag), and penalty
// and drop goals counting from U10 (the national pathway's junior law
// review didn't publish its kicking table).

import type {
  PositionDef,
  RugbyAgeGroupConfig,
  ScoreTypeDef,
  SportConfig,
  ZoneDef,
} from "@/lib/sports/types";
import { deriveSubIntervalSeconds } from "@/lib/sports/subInterval";
import { validateRugbyLineup } from "@/lib/sports/rugby/lineup";
import { aflSport } from "@/lib/sports/afl";

// One field region and one synthetic position, as league: who plays
// forwards or backs lives on the lineup, not on a position list.
const RU_ZONES: ZoneDef[] = [{ id: "field", label: "Field", shortLabel: "Fld" }];
const RU_POSITIONS: PositionDef[] = [{ id: "player", label: "Player", shortLabel: "P" }];

// A drop goal is recorded as the `field_goal` event (no event-type
// migration), labelled for union.
const RU_SCORE_TYPES: ScoreTypeDef[] = [
  { id: "try", label: "Try", shortLabel: "T", points: 5 },
  { id: "conversion", label: "Conversion", shortLabel: "C", points: 2 },
  { id: "penalty_goal", label: "Penalty goal", shortLabel: "PG", points: 3 },
  { id: "field_goal", label: "Drop goal", shortLabel: "DG", points: 3 },
  { id: "opponent_try", label: "Opponent Try", shortLabel: "+T", points: 5, opponent: true },
  { id: "opponent_conversion", label: "Opp. Conversion", shortLabel: "+C", points: 2, opponent: true },
  { id: "opponent_penalty_goal", label: "Opp. Penalty goal", shortLabel: "+PG", points: 3, opponent: true },
  { id: "opponent_field_goal", label: "Opp. Drop goal", shortLabel: "+DG", points: 3, opponent: true },
];

// Forwards at each on-field size: Hunter's by-laws from 10 to 14 a side
// (10 is 5/5, 11 is 5/6, 12 is 6/6, 13 is 6/7, 14 is 8/6) and the full
// 15 (8/7). Below 10, to confirm: 7 a side as 3/4, and the others near
// half.
const FORWARDS_BY_SIZE: Record<number, number> = {
  5: 2,
  6: 3,
  7: 3,
  8: 4,
  9: 4,
  10: 5,
  11: 5,
  12: 6,
  13: 6,
  14: 8,
  15: 8,
};

interface UnionAge {
  id: string;
  label: string;
  players: number;
  min: number;
  max: number;
  /** Minutes a half. */
  minutes: number;
  squad: number;
  tag: boolean;
  scores: boolean;
  goalsFromPlay: boolean;
  forwards: number;
  strategy: RugbyAgeGroupConfig["recommendedStrategy"];
  notes: string;
}

const AGES: UnionAge[] = [
  { id: "U6", label: "Under 6 (Tag)", players: 7, min: 5, max: 7, minutes: 10, squad: 12, tag: true, scores: false, goalsFromPlay: false, forwards: 3, strategy: "both-lines", notes: "Tag rugby — 7 a side (TriTag 5 in Sydney), 2 × 10-min halves, no kicking, no score kept." },
  { id: "U7", label: "Under 7 (Tag)", players: 7, min: 6, max: 7, minutes: 15, squad: 12, tag: true, scores: false, goalsFromPlay: false, forwards: 3, strategy: "both-lines", notes: "Tag rugby — 7 a side (TriTag 6 in Sydney), 2 × 15-min halves, no kicking, no score kept." },
  { id: "U8", label: "Under 8", players: 7, min: 6, max: 7, minutes: 15, squad: 12, tag: false, scores: false, goalsFromPlay: false, forwards: 3, strategy: "both-lines", notes: "Tackle — 7 a side, 2 × 15-min halves. No score kept by default." },
  { id: "U9", label: "Under 9", players: 10, min: 7, max: 10, minutes: 20, squad: 16, tag: false, scores: false, goalsFromPlay: false, forwards: 5, strategy: "both-lines", notes: "Tackle — 10 a side, 2 × 20-min halves. No score kept by default." },
  { id: "U10", label: "Under 10", players: 12, min: 10, max: 15, minutes: 20, squad: 22, tag: false, scores: false, goalsFromPlay: true, forwards: 6, strategy: "preferred-line", notes: "Tackle — 12 a side (10 in Victoria, 15 in Brisbane), 2 × 20-min halves. No score kept by default." },
  { id: "U11", label: "Under 11", players: 12, min: 10, max: 15, minutes: 20, squad: 22, tag: false, scores: false, goalsFromPlay: true, forwards: 6, strategy: "preferred-line", notes: "Tackle — 12 a side (Victoria 12 or 15, Brisbane 15), 2 × 20-min halves. No score kept by default." },
  { id: "U12", label: "Under 12", players: 15, min: 12, max: 15, minutes: 25, squad: 23, tag: false, scores: true, goalsFromPlay: true, forwards: 8, strategy: "named-positions", notes: "Tackle — 15 a side (Victoria 12 or 15), 2 × 25-min halves." },
  { id: "U13", label: "Under 13", players: 15, min: 12, max: 15, minutes: 25, squad: 23, tag: false, scores: true, goalsFromPlay: true, forwards: 8, strategy: "named-positions", notes: "U19 law variations — 15 a side, 2 × 25-min halves." },
  { id: "U14", label: "Under 14", players: 15, min: 12, max: 15, minutes: 25, squad: 23, tag: false, scores: true, goalsFromPlay: true, forwards: 8, strategy: "named-positions", notes: "U19 law variations — 15 a side, 2 × 25-min halves." },
  { id: "U15", label: "Under 15", players: 15, min: 12, max: 15, minutes: 30, squad: 23, tag: false, scores: true, goalsFromPlay: true, forwards: 8, strategy: "named-positions", notes: "U19 law variations — 15 a side, 2 × 30-min halves." },
  { id: "U16", label: "Under 16", players: 15, min: 12, max: 15, minutes: 30, squad: 23, tag: false, scores: true, goalsFromPlay: true, forwards: 8, strategy: "named-positions", notes: "U19 law variations — 15 a side, 2 × 30-min halves." },
  { id: "U17", label: "Under 17", players: 15, min: 12, max: 15, minutes: 35, squad: 23, tag: false, scores: true, goalsFromPlay: true, forwards: 8, strategy: "named-positions", notes: "U19 law variations — 15 a side, 2 × 35-min halves." },
  { id: "U18", label: "Under 18", players: 15, min: 12, max: 15, minutes: 35, squad: 23, tag: false, scores: true, goalsFromPlay: true, forwards: 8, strategy: "named-positions", notes: "U19 law variations — 15 a side, 2 × 35-min halves." },
];

const RU_AGE_GROUPS: RugbyAgeGroupConfig[] = AGES.map((a) => {
  const periodSeconds = a.minutes * 60;
  return {
    id: a.id,
    label: a.label,
    positions: ["player"],
    zones: ["field"],
    defaultOnFieldSize: a.players,
    minOnFieldSize: a.min,
    maxOnFieldSize: a.max,
    maxSquadSize: a.squad,
    periodCount: 2,
    periodSeconds,
    subIntervalSeconds: deriveSubIntervalSeconds(periodSeconds, 240),
    subIntervalFloorSeconds: 240,
    tracksScoreDefault: a.scores,
    notes: a.notes,
    periodLabel: "half",
    periodLabelPlural: "halves",
    kickingAllowed: !a.tag,
    // No vests (vestRequirements left out), no kick rotations, no
    // unbroken-period law.
    minUnbrokenPeriods: 0,
    forwardCount: a.forwards,
    forwardsBySize: Object.fromEntries(
      Object.entries(FORWARDS_BY_SIZE).filter(([n]) => Number(n) >= a.min && Number(n) <= a.max),
    ),
    goalsFromPlay: a.goalsFromPlay,
    kickRotations: false,
    unbrokenPeriods: false,
    recommendedStrategy: a.strategy,
  };
});

// Union lives under the main Siren brand: the main site's host (so no
// host resolves to union; see getBrandForHost) and the "Siren" name on
// what it sends, such as invites.
export const rugbyUnionSport: SportConfig = {
  id: "rugby_union",
  family: "rugby",
  name: "Rugby Union",
  shortName: "Rugby Union",
  brand: {
    ...aflSport.brand,
    name: "Siren",
    tagline: "Junior rugby union coaching — fair playing time, rolling subs, live game control.",
    defaultSport: "rugby_union",
  },
  zones: RU_ZONES,
  allPositions: RU_POSITIONS,
  scoreTypes: RU_SCORE_TYPES,
  ageGroups: RU_AGE_GROUPS,
  substitutionRule: "rolling",
  periodLabel: "half",
  periodLabelPlural: "halves",
  // The rugby engine's time-on-field fairness, without league's
  // unbroken-period law.
  fairnessModel: "zone-minutes",
  jerseyNumbers: true,
  // Like league, union's live screen plays no team song.
  teamSong: false,
  validateLineup: validateRugbyLineup,
};
