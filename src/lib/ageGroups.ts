// AFL zone helpers for the live components: which zones a position
// model uses, and their labels. AFL age-group config (on-field size,
// quarter length, sub interval) lives in the sport registry —
// getAgeGroupConfig("afl", team.age_group) from @/lib/sports.

import type { PositionModel, Zone } from "@/lib/types";

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
