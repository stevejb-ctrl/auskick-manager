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
  // The locks, called the 2nd row in junior rugby here (Steve, 17 Oct 2026).
  { no: 4, short: "2R", name: "2nd row", x: 0.4, y: 0.22 },
  { no: 5, short: "2R", name: "2nd row", x: 0.6, y: 0.22 },
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

// Which positions play at each size: Hunter's by-laws (10, 11, 13, 14) and
// the full side (15). At 12 a side (U10–U11) both wings and one centre play
// (Steve, 17 Oct 2026), not Hunter's two centres and a left wing.
const BY_SIZE: Record<number, number[]> = {
  10: [1, 2, 3, 4, 5, 9, 10, 12, 13, 15],
  11: [1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 15],
  12: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 14, 15],
  13: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15],
  14: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15],
  15: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
};

// Where only the 12 plays, there's one centre (12 a side).
const ONE_CENTRE = { short: "C", name: "Centre", x: 0.5 };

// The backs in the order the lineup draws them, row by row, where six
// play (11, 12 and 14 a side): halfback, centre, five-eighth; then the
// fullback between the wings, or between the left wing and the outside
// centre. Other sizes list the backs by number (their rows read that way).
const BACKS_ORDER: Record<number, number[]> = {
  11: [9, 12, 10, 11, 15, 13],
  12: [9, 12, 10, 11, 15, 14],
  14: [9, 12, 10, 11, 15, 13],
};

/**
 * Union's named positions at an on-field size (10 to 15; a size outside
 * that takes the nearest). Keys `ru-<number>`, labels with the number
 * ("2R4", "HB9", "N8"), forwards 1–8 and backs 9–15, each line listed in
 * the order the lineup draws it.
 */
export function unionCatalogue(onFieldSize: number): PositionDef[] {
  const size = Math.min(15, Math.max(10, Math.round(onFieldSize)));
  const playing = new Set(BY_SIZE[size]);
  const oneCentre = playing.has(12) && !playing.has(13);
  const backsOrder = BACKS_ORDER[size] ?? BY_SIZE[size].filter((n) => n >= 9);
  const order = [...BY_SIZE[size].filter((n) => n <= 8), ...backsOrder];
  return order.map((no) => {
    const p = FULL_SIDE.find((q) => q.no === no)!;
    const spot = no === 12 && oneCentre ? { ...p, ...ONE_CENTRE } : p;
    return {
      key: `ru-${no}`,
      label: `${spot.short}${no}`,
      name: spot.name,
      line: no <= 8 ? "forwards" : "backs",
      x: spot.x,
      y: spot.y,
    };
  });
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

/**
 * Union's front row — loosehead, hooker, tighthead — is for kids picked
 * to play it (scrum safety; UX audit, 23 Oct 2026: half time dealt it to
 * a fullback and a lock). The standard spots by key, a coach's own list
 * by its label (LHP1, HK2, THP3) or name (prop, hooker).
 */
export function isUnionFrontRow(p: { key: string; label: string; name: string }): boolean {
  return (
    ["ru-1", "ru-2", "ru-3"].includes(p.key) ||
    /^(LHP|HK|THP)\d*$/i.test(p.label.trim()) ||
    /\b(prop|hooker)\b/i.test(p.name)
  );
}

export const unionPlaybook = rugbyPlaybook("rugby_union", {
  lawSource: RA_PATHWAY,
  namedPositionAges: new Set(["U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18"]),
  catalogue: unionCatalogue,
  namedPositions: NAMED_POSITIONS,
  restricted: isUnionFrontRow,
  // Union labels carry the jersey number ("LK4", "HB9"); the full side
  // knows the standard ones, a coach's own label is its own name.
  positionName: (label) =>
    label === `${ONE_CENTRE.short}12`
      ? ONE_CENTRE.name
      : (FULL_SIDE.find((p) => `${p.short}${p.no}` === label)?.name ?? label),
});
