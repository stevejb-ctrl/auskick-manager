// ─── AFL sport registration ──────────────────────────────────
// Adapts the existing AGE_GROUPS / zone data into the new SportConfig
// shape. Non-breaking: the underlying data in `@/lib/ageGroups` is
// still the source of truth during the transition. Once the Lineup
// refactor (Phase 1) lands, ageGroups.ts can move under here.

import { AGE_GROUPS, AGE_GROUP_ORDER, ZONE_LABELS, ZONE_SHORT_LABELS } from "@/lib/ageGroups";
import type { SportConfig, ZoneDef, PositionDef, ScoreTypeDef, AgeGroupConfig } from "@/lib/sports/types";

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

function aflAgeGroups(): AgeGroupConfig[] {
  return AGE_GROUP_ORDER.map((id) => {
    const cfg = AGE_GROUPS[id];
    const zones =
      cfg.positionModel === "positions5"
        ? ["back", "hback", "mid", "hfwd", "fwd"]
        : ["back", "mid", "fwd"];
    return {
      id: cfg.id,
      label: cfg.label,
      positions: zones,
      zones,
      defaultOnFieldSize: cfg.defaultOnFieldSize,
      minOnFieldSize: cfg.minOnFieldSize,
      maxOnFieldSize: cfg.maxOnFieldSize,
      maxSquadSize: cfg.maxSquadSize,
      periodCount: 4,
      periodSeconds: cfg.quarterSeconds,
      subIntervalSeconds: cfg.subIntervalSeconds,
      tracksScoreDefault: cfg.tracksScoreDefault,
      notes: cfg.notes,
    };
  });
}

export const aflSport: SportConfig = {
  id: "afl",
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
  ageGroups: aflAgeGroups(),
  substitutionRule: "rolling",
  periodLabel: "quarter",
  periodLabelPlural: "quarters",
  fairnessModel: "zone-minutes",
};
