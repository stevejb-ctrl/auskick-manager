// ─── AFL sport registration ──────────────────────────────────
// AFL's zones, score types and age groups. The age groups are the one
// source of AFL age-group config: read them with
// getAgeGroupConfig("afl", team.age_group). Zone labels still live in
// `@/lib/ageGroups` with the live components' zone helpers.

import { ZONE_LABELS, ZONE_SHORT_LABELS } from "@/lib/ageGroups";
import type { SportConfig, ZoneDef, ZoneId, PositionDef, ScoreTypeDef, AgeGroupConfig } from "@/lib/sports/types";
import { deriveSubIntervalSeconds } from "@/lib/sports/subInterval";
import type { AgeGroup, PositionModel } from "@/lib/types";

const AFL_ZONES_FULL: ZoneDef[] = [
  { id: "back", label: ZONE_LABELS.back, shortLabel: ZONE_SHORT_LABELS.back },
  { id: "hback", label: ZONE_LABELS.hback, shortLabel: ZONE_SHORT_LABELS.hback },
  { id: "mid", label: ZONE_LABELS.mid, shortLabel: ZONE_SHORT_LABELS.mid },
  { id: "hfwd", label: ZONE_LABELS.hfwd, shortLabel: ZONE_SHORT_LABELS.hfwd },
  { id: "fwd", label: ZONE_LABELS.fwd, shortLabel: ZONE_SHORT_LABELS.fwd },
];

// AFL positions and zones are the same concept — a player in the mid
// zone IS playing Centre. No allowedZones restriction (unlike netball).
const AFL_POSITIONS: PositionDef[] = AFL_ZONES_FULL.map((z) => ({
  id: z.id,
  label: z.label,
  shortLabel: z.shortLabel,
}));

const AFL_SCORE_TYPES: ScoreTypeDef[] = [
  { id: "goal", label: "Goal", shortLabel: "G", points: 6 },
  { id: "behind", label: "Behind", shortLabel: "B", points: 1 },
  { id: "opponent_goal", label: "Opponent Goal", shortLabel: "+G", points: 6, opponent: true },
  { id: "opponent_behind", label: "Opponent Behind", shortLabel: "+B", points: 1, opponent: true },
];

// ─── Age groups ──────────────────────────────────────────────
// AFL Community Policy ladder: U8 → 6, U9 → 9, U10–U12 → 12,
// U13–U15 → 15, U16–U18 Boys → 18, U16–U18 Girls → 16.
//
// Steve 2026-05-20: every age uses the 3-zone lines (back / mid /
// fwd). The 5-position senior model (back / hback / mid / hfwd / fwd)
// felt like overkill for junior coaches who mostly think in lines.
// `positions5` stays in the PositionModel union because old game
// events (lineup_set, period_break_swap) can carry hback/hfwd stints
// and the replay/stats code still handles them.
const ZONES3: ZoneId[] = ["back", "mid", "fwd"];

interface AflAgeGroupSpec {
  id: AgeGroup;
  label: string;
  defaultOnFieldSize: number;
  minOnFieldSize: number;
  maxOnFieldSize: number;
  /**
   * Soft cap on the active squad. Generous by design — coaches carry a
   * handful of extras for injuries and availability. 20 to U12, 25 after.
   */
  maxSquadSize: number;
  quarterMinutes: number;
  tracksScoreDefault: boolean;
  notes: string;
}

function aflAgeGroup({ quarterMinutes, ...spec }: AflAgeGroupSpec): AgeGroupConfig {
  const periodSeconds = quarterMinutes * 60;
  return {
    ...spec,
    positions: [...ZONES3],
    zones: [...ZONES3],
    periodCount: 4,
    periodSeconds,
    // F4/SUB-02: the sub cadence falls out of the quarter length, the
    // smallest even split of at least 4 min (U10: 12 min → 3 × 4).
    subIntervalSeconds: deriveSubIntervalSeconds(periodSeconds, 240),
    subIntervalFloorSeconds: 240,
  };
}

/** Picker order for new and edited teams. */
const AFL_AGE_GROUPS: AgeGroupConfig[] = [
  aflAgeGroup({
    id: "U8", label: "Under 8",
    defaultOnFieldSize: 6, minOnFieldSize: 4, maxOnFieldSize: 9, maxSquadSize: 20,
    quarterMinutes: 10, tracksScoreDefault: false,
    notes: "6-a-side, no scores, hold-release tackling.",
  }),
  aflAgeGroup({
    id: "U9", label: "Under 9",
    defaultOnFieldSize: 9, minOnFieldSize: 6, maxOnFieldSize: 12, maxSquadSize: 20,
    quarterMinutes: 12, tracksScoreDefault: false,
    notes: "9-a-side by default, up to 12-a-side, no scores, zone rotations.",
  }),
  aflAgeGroup({
    id: "U10", label: "Under 10",
    defaultOnFieldSize: 12, minOnFieldSize: 6, maxOnFieldSize: 12, maxSquadSize: 20,
    quarterMinutes: 12, tracksScoreDefault: false,
    notes: "12-a-side, 3 zones, non-graded.",
  }),
  // AFL Community Policy: 12-a-side through U10/U11/U12. The step up to
  // 15-a-side doesn't kick in until U13. Steve 2026-05-20 — U11/U12 were
  // wrongly at 15.
  aflAgeGroup({
    id: "U11", label: "Under 11",
    defaultOnFieldSize: 12, minOnFieldSize: 9, maxOnFieldSize: 12, maxSquadSize: 20,
    quarterMinutes: 15, tracksScoreDefault: true,
    notes: "12-a-side, no zones from U11, scoring introduced.",
  }),
  aflAgeGroup({
    id: "U12", label: "Under 12",
    defaultOnFieldSize: 12, minOnFieldSize: 9, maxOnFieldSize: 12, maxSquadSize: 20,
    quarterMinutes: 15, tracksScoreDefault: true,
    notes: "12-a-side, no zones; lines and positions are up to you.",
  }),
  // Steve 2026-05-20: U13+ all play 20-min quarters under the AFL Junior
  // Match Policy. Previously U13/U14 were at 15 and U15 at 18 — both wrong.
  aflAgeGroup({
    id: "U13", label: "Under 13",
    defaultOnFieldSize: 15, minOnFieldSize: 12, maxOnFieldSize: 15, maxSquadSize: 25,
    quarterMinutes: 20, tracksScoreDefault: true,
    notes: "15-a-side; lines and positions are up to you.",
  }),
  aflAgeGroup({
    id: "U14", label: "Under 14",
    defaultOnFieldSize: 15, minOnFieldSize: 12, maxOnFieldSize: 15, maxSquadSize: 25,
    quarterMinutes: 20, tracksScoreDefault: true,
    notes: "15-a-side; lines and positions are up to you.",
  }),
  aflAgeGroup({
    id: "U15", label: "Under 15",
    defaultOnFieldSize: 15, minOnFieldSize: 12, maxOnFieldSize: 15, maxSquadSize: 25,
    quarterMinutes: 20, tracksScoreDefault: true,
    notes: "15-a-side; lines and positions are up to you.",
  }),
  // AFL Junior Match Policy splits at U16+: Boys play 18-a-side, Girls
  // 16-a-side. U18 is new — it wasn't in the pre-split catalogue.
  aflAgeGroup({
    id: "U16_boys", label: "Under 16 Boys",
    defaultOnFieldSize: 18, minOnFieldSize: 12, maxOnFieldSize: 18, maxSquadSize: 25,
    quarterMinutes: 20, tracksScoreDefault: true,
    notes: "18-a-side; lines and positions are up to you.",
  }),
  aflAgeGroup({
    id: "U16_girls", label: "Under 16 Girls",
    defaultOnFieldSize: 16, minOnFieldSize: 12, maxOnFieldSize: 16, maxSquadSize: 25,
    quarterMinutes: 20, tracksScoreDefault: true,
    notes: "16-a-side; lines and positions are up to you.",
  }),
  aflAgeGroup({
    id: "U17_boys", label: "Under 17 Boys",
    defaultOnFieldSize: 18, minOnFieldSize: 12, maxOnFieldSize: 18, maxSquadSize: 25,
    quarterMinutes: 20, tracksScoreDefault: true,
    notes: "18-a-side; lines and positions are up to you.",
  }),
  aflAgeGroup({
    id: "U17_girls", label: "Under 17 Girls",
    defaultOnFieldSize: 16, minOnFieldSize: 12, maxOnFieldSize: 16, maxSquadSize: 25,
    quarterMinutes: 20, tracksScoreDefault: true,
    notes: "16-a-side; lines and positions are up to you.",
  }),
  aflAgeGroup({
    id: "U18_boys", label: "Under 18 Boys",
    defaultOnFieldSize: 18, minOnFieldSize: 12, maxOnFieldSize: 18, maxSquadSize: 25,
    quarterMinutes: 20, tracksScoreDefault: true,
    notes: "18-a-side; lines and positions are up to you.",
  }),
  aflAgeGroup({
    id: "U18_girls", label: "Under 18 Girls",
    defaultOnFieldSize: 16, minOnFieldSize: 12, maxOnFieldSize: 16, maxSquadSize: 25,
    quarterMinutes: 20, tracksScoreDefault: true,
    notes: "16-a-side; lines and positions are up to you.",
  }),
];

// Pre-split "U16" / "U17" (Steve 2026-05-20): existing teams may still
// store them, so they resolve, but new teams pick the gender-explicit
// ids. Both match the boys config (18-a-side), which is what the picker
// was implicitly producing before the split.
const AFL_LEGACY_AGE_GROUPS: AgeGroupConfig[] = [
  aflAgeGroup({
    id: "U16", label: "Under 16",
    defaultOnFieldSize: 18, minOnFieldSize: 12, maxOnFieldSize: 18, maxSquadSize: 25,
    quarterMinutes: 20, tracksScoreDefault: true,
    notes: "18-a-side; lines and positions are up to you. Legacy — created before the U16 Boys / U16 Girls split.",
  }),
  aflAgeGroup({
    id: "U17", label: "Under 17",
    defaultOnFieldSize: 18, minOnFieldSize: 12, maxOnFieldSize: 18, maxSquadSize: 25,
    quarterMinutes: 20, tracksScoreDefault: true,
    notes: "18-a-side; lines and positions are up to you. Legacy — created before the U17 Boys / U17 Girls split.",
  }),
];

/**
 * The live components' position model for an AFL age group: 5 zones is
 * the retired senior layout, anything else the 3-zone lines.
 */
export function aflPositionModel(ageGroup: AgeGroupConfig): PositionModel {
  return ageGroup.zones.length === 5 ? "positions5" : "zones3";
}

export const aflSport: SportConfig = {
  id: "afl",
  family: "afl",
  name: "Australian Rules Football",
  shortName: "AFL",
  brand: {
    id: "afl",
    host: "sirenfooty.com.au",
    name: "Siren Footy",
    tagline: "Junior AFL team management — fair rotations, live game control, no spreadsheets.",
    defaultSport: "afl",
    palette: "brand",
  },
  zones: AFL_ZONES_FULL,
  allPositions: AFL_POSITIONS,
  scoreTypes: AFL_SCORE_TYPES,
  ageGroups: AFL_AGE_GROUPS,
  legacyAgeGroups: AFL_LEGACY_AGE_GROUPS,
  substitutionRule: "rolling",
  periodLabel: "quarter",
  periodLabelPlural: "quarters",
  fairnessModel: "zone-minutes",
  jerseyNumbers: true,
  teamSong: true,
};
