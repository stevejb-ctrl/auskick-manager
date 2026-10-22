// ─── Touch football sport registration ───────────────────────
// Junior touch runs on the touch family's engine
// (.planning/FOUR-SPORTS-PLAN.md): lanes, no keeper, unlimited rolling
// subs, halves, tries. Every rule is stated here (sports are
// independent): nothing is borrowed from Oztag or any other sport.
//
// The plan's recommended defaults (taken 22 Oct 2026):
//   - Name "Touch football", short name "Touch", code id `touch`, the
//     main Siren brand.
//   - U6–U10: 5 a side on a half field, 2 × 15 (BMTA U7/U9, Newcastle
//     7s and 9s, ACT Tiny Touch, TFV U10). U11–U17: 6 a side, 2 × 20
//     (TFA 8th Edition). Squads up to 14 (rule 5.1); a side plays with
//     4 (rule 5.2). A team can play one continuous period (Newcastle's
//     25 minutes): teams.period_count 1 (migration 0071).
//   - Positions: 2 middles, 2 links, 2 wings at 6 a side; 1 middle at 5.
//     Minutes only ★ to U9, Rotate positions ★ from U10 (TFA's junior
//     framework brings positions in at 10 and rotates every player).
//   - Mixed teams: at most 3 boys, at least 1 boy and 1 girl (rule 5.4).
//   - A try is 1 point (rule 14.1). Scores off to U9, on from U10.

import type { PositionDef, ScoreTypeDef, SportConfig, ZoneDef } from "@/lib/sports/types";
import { deriveSubIntervalSeconds } from "@/lib/sports/subInterval";
import { aflSport } from "@/lib/sports/afl";
import { validateTouchLineup } from "@/lib/sports/touch/lineup";
import { touchPeriodBreak } from "@/lib/sports/touch/periodBreak";
import type { MixedRule, TouchAgeGroupConfig, TouchShape, TouchStrategy } from "@/lib/sports/touch/types";

// One field region and one synthetic position, as soccer: who plays
// which lane lives on the lineup, not on a position list.
const TOUCH_ZONES: ZoneDef[] = [{ id: "field", label: "Field", shortLabel: "Fld" }];
const TOUCH_POSITIONS: PositionDef[] = [{ id: "player", label: "Player", shortLabel: "P" }];

// A try is a point, for both sides (TFA rule 14.1).
const TOUCH_SCORE_TYPES: ScoreTypeDef[] = [
  { id: "try", label: "Try", shortLabel: "T", points: 1 },
  { id: "opponent_try", label: "Opponent try", shortLabel: "+T", points: 1, opponent: true },
];

/** TFA rule 5.4: at most 3 boys, at least 1 boy and 1 girl. */
export const TOUCH_MIXED_RULE: MixedRule = { maxBoys: 3, minGirls: 1, minBoys: 1 };

function lanes(middle: number, link: number, wing: number): TouchShape {
  return { id: `${middle}-${link}-${wing}`, lines: { middle, link, wing, field: 0 } };
}

// Lanes by players on the field, default first. A side one or two short
// keeps its wings and middles.
const TOUCH_SHAPES: Record<number, TouchShape[]> = {
  4: [lanes(2, 0, 2), lanes(1, 1, 2)],
  5: [lanes(1, 2, 2)],
  6: [lanes(2, 2, 2)],
};

interface TouchAge {
  id: string;
  label: string;
  players: number;
  /** Minutes a half. */
  minutes: number;
  scores: boolean;
  strategy: TouchStrategy;
}

const AGES: TouchAge[] = [
  { id: "U6", label: "Under 6", players: 5, minutes: 15, scores: false, strategy: "minutes" },
  { id: "U7", label: "Under 7", players: 5, minutes: 15, scores: false, strategy: "minutes" },
  { id: "U8", label: "Under 8", players: 5, minutes: 15, scores: false, strategy: "minutes" },
  { id: "U9", label: "Under 9", players: 5, minutes: 15, scores: false, strategy: "minutes" },
  { id: "U10", label: "Under 10", players: 5, minutes: 15, scores: true, strategy: "rotate-positions" },
  { id: "U11", label: "Under 11", players: 6, minutes: 20, scores: true, strategy: "rotate-positions" },
  { id: "U12", label: "Under 12", players: 6, minutes: 20, scores: true, strategy: "rotate-positions" },
  { id: "U13", label: "Under 13", players: 6, minutes: 20, scores: true, strategy: "rotate-positions" },
  { id: "U14", label: "Under 14", players: 6, minutes: 20, scores: true, strategy: "rotate-positions" },
  { id: "U15", label: "Under 15", players: 6, minutes: 20, scores: true, strategy: "rotate-positions" },
  { id: "U16", label: "Under 16", players: 6, minutes: 20, scores: true, strategy: "rotate-positions" },
  { id: "U17", label: "Under 17", players: 6, minutes: 20, scores: true, strategy: "rotate-positions" },
];

/** TFA rule 5.2: a side can play with 4. */
const MIN_ON_FIELD = 4;
/** TFA rule 5.1: at most 14 in a team. */
const MAX_SQUAD = 14;

function shapesFor(a: TouchAge): Record<number, TouchShape[]> {
  const out: Record<number, TouchShape[]> = {};
  for (let n = MIN_ON_FIELD; n <= a.players; n++) out[n] = TOUCH_SHAPES[n];
  return out;
}

export const TOUCH_AGE_GROUPS: TouchAgeGroupConfig[] = AGES.map((a) => {
  const periodSeconds = a.minutes * 60;
  const halfField = a.players === 5 ? " on a half field" : "";
  return {
    id: a.id,
    label: a.label,
    positions: ["player"],
    zones: ["field"],
    defaultOnFieldSize: a.players,
    minOnFieldSize: MIN_ON_FIELD,
    maxOnFieldSize: a.players,
    maxSquadSize: MAX_SQUAD,
    periodCount: 2,
    periodSeconds,
    subIntervalSeconds: deriveSubIntervalSeconds(periodSeconds, 240),
    subIntervalFloorSeconds: 240,
    tracksScoreDefault: a.scores,
    notes: `${a.players} a side${halfField}, 2 × ${a.minutes}-min halves${a.scores ? "" : ", no score kept"}.`,
    periodLabel: "half",
    periodLabelPlural: "halves",
    shapes: shapesFor(a),
    suggestedStrategy: a.strategy,
    mixedPreset: TOUCH_MIXED_RULE,
    girlsTryDouble: false,
  };
});

// Touch lives under the main Siren brand, as soccer: the main site's
// host (so no host resolves to touch; see getBrandForHost) and the
// "Siren" name on what it sends.
export const touchSport: SportConfig = {
  id: "touch",
  family: "touch",
  name: "Touch football",
  shortName: "Touch",
  brand: {
    ...aflSport.brand,
    name: "Siren",
    tagline: "Junior touch football coaching — fair minutes, lane rotations, the mixed rule kept for you.",
    defaultSport: "touch",
  },
  zones: TOUCH_ZONES,
  allPositions: TOUCH_POSITIONS,
  scoreTypes: TOUCH_SCORE_TYPES,
  ageGroups: TOUCH_AGE_GROUPS,
  substitutionRule: "rolling",
  periodLabel: "half",
  periodLabelPlural: "halves",
  // Minutes per lane.
  fairnessModel: "zone-minutes",
  jerseyNumbers: true,
  teamSong: false,
  periodBreak: touchPeriodBreak,
  validateLineup: validateTouchLineup,
};
