// Catalogue of AFL junior age-group configs. Drives default on-field
// size, position model (3-zone vs 5-position), quarter length, and
// scoring defaults when creating a team or game.

import type { AgeGroup, PositionModel, Zone } from "@/lib/types";

export interface AgeGroupConfig {
  id: AgeGroup;
  label: string;
  positionModel: PositionModel;
  defaultOnFieldSize: number;
  minOnFieldSize: number;
  maxOnFieldSize: number;
  quarterSeconds: number;
  subIntervalSeconds: number;
  tracksScoreDefault: boolean;
  notes: string;
}

export const AGE_GROUPS: Record<AgeGroup, AgeGroupConfig> = {
  U8: {
    id: "U8",
    label: "Under 8",
    positionModel: "zones3",
    defaultOnFieldSize: 9,
    minOnFieldSize: 5,
    maxOnFieldSize: 20,
    quarterSeconds: 10 * 60,
    subIntervalSeconds: 3 * 60,
    tracksScoreDefault: false,
    notes: "9-a-side recommended, no scores, hold-release tackling.",
  },
  U9: {
    id: "U9",
    label: "Under 9",
    positionModel: "zones3",
    defaultOnFieldSize: 12,
    minOnFieldSize: 5,
    maxOnFieldSize: 20,
    quarterSeconds: 12 * 60,
    subIntervalSeconds: 3 * 60,
    tracksScoreDefault: false,
    notes: "12-a-side recommended, no scores, zone rotations.",
  },
  U10: {
    id: "U10",
    label: "Under 10",
    positionModel: "zones3",
    defaultOnFieldSize: 12,
    minOnFieldSize: 5,
    maxOnFieldSize: 20,
    quarterSeconds: 12 * 60,
    subIntervalSeconds: 3 * 60,
    tracksScoreDefault: false,
    notes: "12-a-side recommended, 3 zones, non-graded.",
  },
  U11: {
    id: "U11",
    label: "Under 11",
    positionModel: "zones3",
    defaultOnFieldSize: 15,
    minOnFieldSize: 5,
    maxOnFieldSize: 20,
    quarterSeconds: 15 * 60,
    subIntervalSeconds: 3 * 60,
    tracksScoreDefault: true,
    notes: "15-a-side recommended, 3 zones, mandatory rotations, scoring introduced.",
  },
  U12: {
    id: "U12",
    label: "Under 12",
    positionModel: "zones3",
    defaultOnFieldSize: 15,
    minOnFieldSize: 5,
    maxOnFieldSize: 20,
    quarterSeconds: 15 * 60,
    subIntervalSeconds: 3 * 60,
    tracksScoreDefault: true,
    notes: "15-a-side recommended, 3 zones, mandatory zone rotations.",
  },
  U13: {
    id: "U13",
    label: "Under 13",
    positionModel: "positions5",
    defaultOnFieldSize: 18,
    minOnFieldSize: 5,
    maxOnFieldSize: 20,
    quarterSeconds: 15 * 60,
    subIntervalSeconds: 4 * 60,
    tracksScoreDefault: true,
    notes: "18-a-side recommended, 5 position groups.",
  },
  U14: {
    id: "U14",
    label: "Under 14",
    positionModel: "positions5",
    defaultOnFieldSize: 18,
    minOnFieldSize: 5,
    maxOnFieldSize: 20,
    quarterSeconds: 15 * 60,
    subIntervalSeconds: 4 * 60,
    tracksScoreDefault: true,
    notes: "18-a-side recommended, 5 position groups.",
  },
  U15: {
    id: "U15",
    label: "Under 15",
    positionModel: "positions5",
    defaultOnFieldSize: 18,
    minOnFieldSize: 5,
    maxOnFieldSize: 20,
    quarterSeconds: 18 * 60,
    subIntervalSeconds: 4 * 60,
    tracksScoreDefault: true,
    notes: "18-a-side recommended, senior-style structure.",
  },
  U16: {
    id: "U16",
    label: "Under 16",
    positionModel: "positions5",
    defaultOnFieldSize: 18,
    minOnFieldSize: 5,
    maxOnFieldSize: 20,
    quarterSeconds: 20 * 60,
    subIntervalSeconds: 4 * 60,
    tracksScoreDefault: true,
    notes: "18-a-side recommended, senior-style structure.",
  },
  U17: {
    id: "U17",
    label: "Under 17",
    positionModel: "positions5",
    defaultOnFieldSize: 18,
    minOnFieldSize: 5,
    maxOnFieldSize: 20,
    quarterSeconds: 20 * 60,
    subIntervalSeconds: 4 * 60,
    tracksScoreDefault: true,
    notes: "18-a-side recommended, senior-style structure.",
  },
};

export const AGE_GROUP_ORDER: AgeGroup[] = [
  "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17",
];

const ZONES3: Zone[] = ["back", "mid", "fwd"];
const POSITIONS5: Zone[] = ["back", "hback", "mid", "hfwd", "fwd"];

export function positionsFor(model: PositionModel): Zone[] {
  return model === "positions5" ? [...POSITIONS5] : [...ZONES3];
}

export const ZONE_LABELS: Record<Zone, string> = {
  back: "Back",
  hback: "Half-back",
  mid: "Centre",
  hfwd: "Half-forward",
  fwd: "Forward",
};

// Short labels for narrow UI (pills, rotation arrows, tabs).
export const ZONE_SHORT_LABELS: Record<Zone, string> = {
  back: "Back",
  hback: "HBack",
  mid: "Centre",
  hfwd: "HFwd",
  fwd: "Fwd",
};

export function ageGroupOf(input: string | null | undefined): AgeGroup {
  if (input && input in AGE_GROUPS) return input as AgeGroup;
  return "U10";
}
