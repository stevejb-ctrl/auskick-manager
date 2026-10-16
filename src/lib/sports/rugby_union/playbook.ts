// Rugby union — How we play. The rugby engine's How we play
// (rugby/playbook.ts) with union's own laws and named positions.
//
// Union's catalogue is its own, never league's: the same words mean
// different spots (union's locks are the second row, 4 and 5; league's
// lock is its 13; union's halves wear 9 and 10, league's 7 and 6). So
// labels carry the jersey number and keys are union's (`ru-<number>`).
// Below 10 a side (U6–U9) kids play forwards or backs, as league's do
// below U10.

import type { PositionDef, StrategyDef } from "@/lib/playbook/types";
import { rugbyPlaybook } from "@/lib/sports/rugby/playbook";

const RA_PATHWAY = "Rugby Australia junior pathway";

// The full side, numbered as on the jersey, in Australian terms, with
// where each stands on the drawn field (attacking up the page).
const FULL_SIDE: { no: number; short: string; name: string; x: number; y: number }[] = [
  { no: 1, short: "LHP", name: "Loosehead prop", x: 0.3, y: 0.12 },
  { no: 2, short: "HK", name: "Hooker", x: 0.5, y: 0.12 },
  { no: 3, short: "THP", name: "Tighthead prop", x: 0.7, y: 0.12 },
  { no: 4, short: "LK", name: "Lock", x: 0.4, y: 0.22 },
  { no: 5, short: "LK", name: "Lock", x: 0.6, y: 0.22 },
  { no: 6, short: "BF", name: "Blindside flanker", x: 0.2, y: 0.3 },
  { no: 7, short: "OF", name: "Openside flanker", x: 0.8, y: 0.3 },
  { no: 8, short: "N", name: "Number 8", x: 0.5, y: 0.33 },
  { no: 9, short: "HB", name: "Halfback", x: 0.42, y: 0.46 },
  { no: 10, short: "FE", name: "Five-eighth", x: 0.58, y: 0.54 },
  { no: 11, short: "LW", name: "Left wing", x: 0.1, y: 0.7 },
  { no: 12, short: "IC", name: "Inside centre", x: 0.38, y: 0.64 },
  { no: 13, short: "OC", name: "Outside centre", x: 0.62, y: 0.68 },
  { no: 14, short: "RW", name: "Right wing", x: 0.9, y: 0.7 },
  { no: 15, short: "FB", name: "Fullback", x: 0.5, y: 0.88 },
];

// Which positions play at each size: Hunter's by-laws (10 to 14) and the
// full side (15).
const BY_SIZE: Record<number, number[]> = {
  10: [1, 2, 3, 4, 5, 9, 10, 12, 13, 15],
  11: [1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 15],
  12: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 15],
  13: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15],
  14: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15],
  15: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
};

/**
 * Union's named positions at an on-field size (10 to 15; a size outside
 * that takes the nearest). Keys `ru-<number>`, labels with the number
 * ("LK4", "HB9", "N8"), forwards 1–8 and backs 9–15.
 */
export function unionCatalogue(onFieldSize: number): PositionDef[] {
  const size = Math.min(15, Math.max(10, Math.round(onFieldSize)));
  const playing = new Set(BY_SIZE[size]);
  return FULL_SIDE.filter((p) => playing.has(p.no)).map((p) => ({
    key: `ru-${p.no}`,
    label: `${p.short}${p.no}`,
    name: p.name,
    line: p.no <= 8 ? "forwards" : "backs",
    x: p.x,
    y: p.y,
  }));
}

const NAMED_POSITIONS: StrategyDef = {
  id: "named-positions",
  label: "Named positions",
  blurb: "Kids get home positions from the standard list (prop, lock, halfback…), numbered as on the jersey.",
  fit: "Under 10 (10 a side) and up",
  usesPositions: true,
  balanceUnit: "position",
  balanceByDefault: true,
};

export const unionPlaybook = rugbyPlaybook("rugby_union", {
  lawSource: RA_PATHWAY,
  namedPositionAges: new Set(["U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18"]),
  catalogue: unionCatalogue,
  namedPositions: NAMED_POSITIONS,
  // Union labels carry the jersey number ("LK4", "HB9"); the full side
  // knows the standard ones, a coach's own label is its own name.
  positionName: (label) =>
    FULL_SIDE.find((p) => `${p.short}${p.no}` === label)?.name ?? label,
});
