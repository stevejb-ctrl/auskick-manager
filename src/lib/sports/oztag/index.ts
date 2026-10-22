// ─── Oztag sport registration ────────────────────────────────
// Junior Oztag runs on the touch family's engine
// (.planning/FOUR-SPORTS-PLAN.md): lanes, no keeper, unlimited rolling
// subs from a sub box, halves, tries. It joins the family as rugby
// union joined league's: shared code, Oztag's own rules, every one
// stated here (sports are independent): nothing is borrowed from touch.
//
// The plan's recommended defaults (taken 22 Oct 2026):
//   - Name "Oztag", code id `oztag`, the main Siren brand.
//   - U6–U8: 6 a side on a modified field (Newcastle). U9–U17: 8 a side
//     (ITF rule 3.1); a side starts with 5 (rule 3.2). 2 × 15 halves
//     (NSW Junior State Championships). Squads up to 14 at U6–U8 and 16
//     from U9 (NSW Junior State Championships).
//   - Positions: Oztag has none officially, so Minutes only ★ at every
//     age; touch's lanes are an option.
//   - Mixed teams: at most 4 boys, at least 1 girl (ITF rule 3.3), and a
//     girl's try counts 2 (rule 4.3), which a team can turn off.
//   - A try is 1 point. Scores off to U9 (Tweed keeps none at U5–U9,
//     Labrador records from U10), on from U10.
//
// Siren's own calls, not in the plan (flagged for Steve):
//   - Lane sizes at 7 and 8 a side (2 middles, links either side, 2
//     wings) need checking with an Oztag coach: Oztag names no lanes.

import type { PositionDef, ScoreTypeDef, SportConfig, ZoneDef } from "@/lib/sports/types";
import { deriveSubIntervalSeconds } from "@/lib/sports/subInterval";
import { aflSport } from "@/lib/sports/afl";
import { validateTouchLineup } from "@/lib/sports/touch/lineup";
import { touchPeriodBreak } from "@/lib/sports/touch/periodBreak";
import type { MixedRule, TouchAgeGroupConfig, TouchShape } from "@/lib/sports/touch/types";

const OZTAG_ZONES: ZoneDef[] = [{ id: "field", label: "Field", shortLabel: "Fld" }];
const OZTAG_POSITIONS: PositionDef[] = [{ id: "player", label: "Player", shortLabel: "P" }];

// A try is a point; in a mixed game a girl's try is two (ITF rule 4.3),
// for both sides. A girl's try is its own event, so replay, results and
// the report never work the points out again.
const OZTAG_SCORE_TYPES: ScoreTypeDef[] = [
  { id: "try", label: "Try", shortLabel: "T", points: 1 },
  { id: "girls_try", label: "Girl's try", shortLabel: "T2", points: 2 },
  { id: "opponent_try", label: "Opponent try", shortLabel: "+T", points: 1, opponent: true },
  { id: "opponent_girls_try", label: "Opponent girl's try", shortLabel: "+T2", points: 2, opponent: true },
];

/** ITF rule 3.3: at most 4 boys, at least 1 girl. */
export const OZTAG_MIXED_RULE: MixedRule = { maxBoys: 4, minGirls: 1, minBoys: 0 };

function lanes(middle: number, link: number, wing: number): TouchShape {
  return { id: `${middle}-${link}-${wing}`, lines: { middle, link, wing, field: 0 } };
}

// Lanes by players on the field, default first.
const OZTAG_SHAPES: Record<number, TouchShape[]> = {
  5: [lanes(1, 2, 2)],
  6: [lanes(2, 2, 2)],
  7: [lanes(2, 3, 2), lanes(3, 2, 2)],
  8: [lanes(2, 4, 2), lanes(4, 2, 2)],
};

interface OztagAge {
  id: string;
  label: string;
  players: number;
  squad: number;
  scores: boolean;
}

const AGES: OztagAge[] = [
  { id: "U6", label: "Under 6", players: 6, squad: 14, scores: false },
  { id: "U7", label: "Under 7", players: 6, squad: 14, scores: false },
  { id: "U8", label: "Under 8", players: 6, squad: 14, scores: false },
  { id: "U9", label: "Under 9", players: 8, squad: 16, scores: false },
  { id: "U10", label: "Under 10", players: 8, squad: 16, scores: true },
  { id: "U11", label: "Under 11", players: 8, squad: 16, scores: true },
  { id: "U12", label: "Under 12", players: 8, squad: 16, scores: true },
  { id: "U13", label: "Under 13", players: 8, squad: 16, scores: true },
  { id: "U14", label: "Under 14", players: 8, squad: 16, scores: true },
  { id: "U15", label: "Under 15", players: 8, squad: 16, scores: true },
  { id: "U16", label: "Under 16", players: 8, squad: 16, scores: true },
  { id: "U17", label: "Under 17", players: 8, squad: 16, scores: true },
];

/** ITF rule 3.2: a side needs 5 to start. */
const MIN_ON_FIELD = 5;
/** 2 × 15-minute halves (NSW Junior State Championships). */
const HALF_MINUTES = 15;

function shapesFor(a: OztagAge): Record<number, TouchShape[]> {
  const out: Record<number, TouchShape[]> = {};
  for (let n = MIN_ON_FIELD; n <= a.players; n++) out[n] = OZTAG_SHAPES[n];
  return out;
}

export const OZTAG_AGE_GROUPS: TouchAgeGroupConfig[] = AGES.map((a) => {
  const periodSeconds = HALF_MINUTES * 60;
  const modified = a.players === 6 ? " on a modified field" : "";
  return {
    id: a.id,
    label: a.label,
    positions: ["player"],
    zones: ["field"],
    defaultOnFieldSize: a.players,
    minOnFieldSize: MIN_ON_FIELD,
    maxOnFieldSize: a.players,
    maxSquadSize: a.squad,
    periodCount: 2,
    periodSeconds,
    subIntervalSeconds: deriveSubIntervalSeconds(periodSeconds, 240),
    subIntervalFloorSeconds: 240,
    tracksScoreDefault: a.scores,
    notes: `${a.players} a side${modified}, 2 × ${HALF_MINUTES}-min halves${a.scores ? "" : ", no score kept"}.`,
    periodLabel: "half",
    periodLabelPlural: "halves",
    shapes: shapesFor(a),
    suggestedStrategy: "minutes",
    mixedPreset: OZTAG_MIXED_RULE,
    girlsTryDouble: true,
  };
});

// Oztag lives under the main Siren brand, as soccer: the main site's
// host (so no host resolves to Oztag; see getBrandForHost) and the
// "Siren" name on what it sends.
export const oztagSport: SportConfig = {
  id: "oztag",
  family: "touch",
  name: "Oztag",
  shortName: "Oztag",
  brand: {
    ...aflSport.brand,
    name: "Siren",
    tagline: "Junior Oztag coaching — fair minutes, rolling subs, the mixed rule kept for you.",
    defaultSport: "oztag",
  },
  zones: OZTAG_ZONES,
  allPositions: OZTAG_POSITIONS,
  scoreTypes: OZTAG_SCORE_TYPES,
  ageGroups: OZTAG_AGE_GROUPS,
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
