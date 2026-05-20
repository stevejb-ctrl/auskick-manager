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
  /**
   * Soft cap on the total active squad. Generous by design — coaches
   * often carry a handful of extras to cover injuries and availability.
   * Younger age groups (zones3) cap at 20; older (positions5) at 25.
   */
  maxSquadSize: number;
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
    defaultOnFieldSize: 6,
    minOnFieldSize: 4,
    maxOnFieldSize: 9,
    maxSquadSize: 20,
    quarterSeconds: 10 * 60,
    subIntervalSeconds: 3 * 60,
    tracksScoreDefault: true,
    notes: "6-a-side, no scores, hold-release tackling.",
  },
  U9: {
    id: "U9",
    label: "Under 9",
    positionModel: "zones3",
    defaultOnFieldSize: 9,
    minOnFieldSize: 6,
    maxOnFieldSize: 12,
    maxSquadSize: 20,
    quarterSeconds: 12 * 60,
    subIntervalSeconds: 3 * 60,
    tracksScoreDefault: true,
    notes: "9-a-side by default, up to 12-a-side, no scores, zone rotations.",
  },
  U10: {
    id: "U10",
    label: "Under 10",
    positionModel: "zones3",
    defaultOnFieldSize: 12,
    minOnFieldSize: 6,
    maxOnFieldSize: 12,
    maxSquadSize: 20,
    quarterSeconds: 12 * 60,
    subIntervalSeconds: 3 * 60,
    tracksScoreDefault: true,
    notes: "12-a-side, 3 zones, non-graded.",
  },
  U11: {
    id: "U11",
    label: "Under 11",
    positionModel: "zones3",
    // AFL Community Policy: 12-a-side through U10/U11/U12. The
    // step up to 15-a-side doesn't kick in until U13. Steve
    // 2026-05-20 (follow-up to the U13-U15 correction earlier
    // today) — U11/U12 were also wrongly at 15.
    defaultOnFieldSize: 12,
    minOnFieldSize: 9,
    maxOnFieldSize: 12,
    maxSquadSize: 20,
    quarterSeconds: 15 * 60,
    subIntervalSeconds: 3 * 60,
    tracksScoreDefault: true,
    notes: "12-a-side, 3 zones, mandatory rotations, scoring introduced.",
  },
  U12: {
    id: "U12",
    label: "Under 12",
    positionModel: "zones3",
    defaultOnFieldSize: 12,
    minOnFieldSize: 9,
    maxOnFieldSize: 12,
    maxSquadSize: 20,
    quarterSeconds: 15 * 60,
    subIntervalSeconds: 3 * 60,
    tracksScoreDefault: true,
    notes: "12-a-side, 3 zones, mandatory zone rotations.",
  },
  U13: {
    id: "U13",
    label: "Under 13",
    // Steve 2026-05-20: all AFL age groups now use the 3-zone model
    // (back / mid / fwd). The 5-position senior-style model
    // (back / hback / mid / hfwd / fwd) felt like overkill for
    // junior coaches who mostly think in lines; coaches asked to
    // simplify. The `positions5` value still lives in the
    // PositionModel union — old game events (lineup_set,
    // period_break_swap) can include hback/hfwd stints and the
    // replay/stats code keeps handling them — but no AGE_GROUPS
    // entry uses it any more.
    positionModel: "zones3",
    defaultOnFieldSize: 15,
    minOnFieldSize: 12,
    maxOnFieldSize: 15,
    maxSquadSize: 25,
    // Steve 2026-05-20: U13+ all play 20-min quarters under the
    // AFL Junior Match Policy. Previously U13/U14 were configured
    // at 15 and U15 at 18 — both wrong.
    quarterSeconds: 20 * 60,
    subIntervalSeconds: 4 * 60,
    tracksScoreDefault: true,
    notes: "15-a-side, 3 zones (5-5-5 split by default).",
  },
  U14: {
    id: "U14",
    label: "Under 14",
    positionModel: "zones3",
    defaultOnFieldSize: 15,
    minOnFieldSize: 12,
    maxOnFieldSize: 15,
    maxSquadSize: 25,
    quarterSeconds: 20 * 60,
    subIntervalSeconds: 4 * 60,
    tracksScoreDefault: true,
    notes: "15-a-side, 3 zones (5-5-5 split by default).",
  },
  U15: {
    id: "U15",
    label: "Under 15",
    positionModel: "zones3",
    defaultOnFieldSize: 15,
    minOnFieldSize: 12,
    maxOnFieldSize: 15,
    maxSquadSize: 25,
    quarterSeconds: 20 * 60,
    subIntervalSeconds: 4 * 60,
    tracksScoreDefault: true,
    notes: "15-a-side, 3 zones (5-5-5 split by default).",
  },
  // ─── Legacy unsplit U16 / U17 ────────────────────────────
  // Steve 2026-05-20: kept in AGE_GROUPS so existing teams whose
  // age_group column still reads "U16" / "U17" continue to
  // resolve via `ageGroupOf()` without falling through to U10.
  // DROPPED from AGE_GROUP_ORDER below so the new-team picker
  // doesn't surface them — new teams pick gender-explicit IDs
  // (U16_boys / U16_girls / etc.). Both legacy entries match
  // the boys config (18-a-side), which is what the picker was
  // implicitly producing before the split.
  U16: {
    id: "U16",
    label: "Under 16",
    positionModel: "zones3",
    defaultOnFieldSize: 18,
    minOnFieldSize: 12,
    maxOnFieldSize: 18,
    maxSquadSize: 25,
    quarterSeconds: 20 * 60,
    subIntervalSeconds: 4 * 60,
    tracksScoreDefault: true,
    notes: "18-a-side, 3 zones (6-6-6 split by default). Legacy — created before the U16 Boys / U16 Girls split.",
  },
  U17: {
    id: "U17",
    label: "Under 17",
    positionModel: "zones3",
    defaultOnFieldSize: 18,
    minOnFieldSize: 12,
    maxOnFieldSize: 18,
    maxSquadSize: 25,
    quarterSeconds: 20 * 60,
    subIntervalSeconds: 4 * 60,
    tracksScoreDefault: true,
    notes: "18-a-side, 3 zones (6-6-6 split by default). Legacy — created before the U17 Boys / U17 Girls split.",
  },
  // ─── Gender-split U16 / U17 / U18 ────────────────────────
  // AFL Junior Match Policy splits at U16+: Boys play 18-a-side,
  // Girls play 16-a-side. U18 is new — wasn't in the pre-split
  // catalogue at all.
  U16_boys: {
    id: "U16_boys",
    label: "Under 16 Boys",
    positionModel: "zones3",
    defaultOnFieldSize: 18,
    minOnFieldSize: 12,
    maxOnFieldSize: 18,
    maxSquadSize: 25,
    quarterSeconds: 20 * 60,
    subIntervalSeconds: 4 * 60,
    tracksScoreDefault: true,
    notes: "18-a-side, 3 zones (6-6-6 split by default).",
  },
  U16_girls: {
    id: "U16_girls",
    label: "Under 16 Girls",
    positionModel: "zones3",
    defaultOnFieldSize: 16,
    minOnFieldSize: 12,
    maxOnFieldSize: 16,
    maxSquadSize: 25,
    quarterSeconds: 20 * 60,
    subIntervalSeconds: 4 * 60,
    tracksScoreDefault: true,
    notes: "16-a-side, 3 zones (5-6-5 split by default).",
  },
  U17_boys: {
    id: "U17_boys",
    label: "Under 17 Boys",
    positionModel: "zones3",
    defaultOnFieldSize: 18,
    minOnFieldSize: 12,
    maxOnFieldSize: 18,
    maxSquadSize: 25,
    quarterSeconds: 20 * 60,
    subIntervalSeconds: 4 * 60,
    tracksScoreDefault: true,
    notes: "18-a-side, 3 zones (6-6-6 split by default).",
  },
  U17_girls: {
    id: "U17_girls",
    label: "Under 17 Girls",
    positionModel: "zones3",
    defaultOnFieldSize: 16,
    minOnFieldSize: 12,
    maxOnFieldSize: 16,
    maxSquadSize: 25,
    quarterSeconds: 20 * 60,
    subIntervalSeconds: 4 * 60,
    tracksScoreDefault: true,
    notes: "16-a-side, 3 zones (5-6-5 split by default).",
  },
  U18_boys: {
    id: "U18_boys",
    label: "Under 18 Boys",
    positionModel: "zones3",
    defaultOnFieldSize: 18,
    minOnFieldSize: 12,
    maxOnFieldSize: 18,
    maxSquadSize: 25,
    quarterSeconds: 20 * 60,
    subIntervalSeconds: 4 * 60,
    tracksScoreDefault: true,
    notes: "18-a-side, 3 zones (6-6-6 split by default).",
  },
  U18_girls: {
    id: "U18_girls",
    label: "Under 18 Girls",
    positionModel: "zones3",
    defaultOnFieldSize: 16,
    minOnFieldSize: 12,
    maxOnFieldSize: 16,
    maxSquadSize: 25,
    quarterSeconds: 20 * 60,
    subIntervalSeconds: 4 * 60,
    tracksScoreDefault: true,
    notes: "16-a-side, 3 zones (5-6-5 split by default).",
  },
};

// Ordered list surfaced by the new-team picker + age-group flow
// tests. Excludes the legacy unsplit "U16" / "U17" — those stay
// in AGE_GROUPS for backwards compatibility with existing teams
// but don't appear as picker options for new teams. New teams
// pick the gender-explicit IDs (U16_boys / U16_girls / etc.).
// Steve 2026-05-20.
export const AGE_GROUP_ORDER: AgeGroup[] = [
  "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15",
  "U16_boys", "U16_girls",
  "U17_boys", "U17_girls",
  "U18_boys", "U18_girls",
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
