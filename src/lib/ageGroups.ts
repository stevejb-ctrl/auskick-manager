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

/** Players per zone (AFL zone caps). */
export type ZoneCaps = Record<Zone, number>;

export function emptyZoneCaps(): ZoneCaps {
  return { back: 0, hback: 0, mid: 0, hfwd: 0, fwd: 0 };
}

// Distribute an on-field size across the model's zones.
// 3-zone: remainder fills mid first, then back. 12 → 4-4-4, 15 → 5-5-5,
// 18 → 6-6-6, 11 → 4-4-3, 10 → 3-4-3.
// 5-position: remainder fills mid first, then the half-lines, then back/fwd.
// Steve 2026-05-20: hardMax used to clamp zones3 to 15, which silently
// dropped 3 players off the field when U16/U17 (now zones3, was
// positions5) ran their default 18-a-side lineup. Both models now
// share the 18-player ceiling.
// Lives here (not in fairness.ts, which re-exports it) so the AFL sport
// config can size its break zones without importing the fairness engine.
export function zoneCapsFor(
  onFieldSize: number,
  model: PositionModel = "zones3"
): ZoneCaps {
  const zones = positionsFor(model);
  const hardMax = 18;
  const size = Math.max(0, Math.min(hardMax, Math.floor(onFieldSize)));
  const base = Math.floor(size / zones.length);
  const rem = size % zones.length;
  const caps = emptyZoneCaps();
  for (const z of zones) caps[z] = base;
  // Fill remainder in this priority order. For 3-zone this collapses to
  // [mid, back]; for 5-position [mid, hback, hfwd, back, fwd].
  const priority: Zone[] =
    model === "positions5"
      ? ["mid", "hback", "hfwd", "back", "fwd"]
      : ["mid", "back", "fwd"];
  for (let i = 0; i < rem; i++) caps[priority[i]]++;
  return caps;
}
