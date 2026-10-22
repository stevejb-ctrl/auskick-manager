// ─── Touch family: the period break's zones ──────────────────
// Touch's and Oztag's break (quarter-break/PeriodBreak) in the family's
// lanes, centre out as the touch field draws them: Middles, Links,
// Wings, in the lane palette the touch screens use (middles the centre
// colour, links the back, wings the forward). Minutes only has no lanes:
// one Field zone. Slots are the staged lineup's lanes, else the age
// group's suggested strategy at this game's size.

import type { BreakZoneColor, SportBreakSpec } from "@/lib/sports/types";
import type { TouchAgeGroupConfig, TouchLine } from "@/lib/sports/touch/types";

const TOUCH_BREAK_ZONES: { key: TouchLine; label: string; short: string; color: BreakZoneColor }[] = [
  { key: "middle", label: "MIDDLES", short: "Middle", color: "zone2" },
  { key: "link", label: "LINKS", short: "Link", color: "zone3" },
  { key: "wing", label: "WINGS", short: "Wing", color: "zone1" },
  { key: "field", label: "FIELD", short: "Field", color: "zone2" },
];

/** The age group's default lanes at a size (the nearest size it has). */
function defaultLanes(ag: TouchAgeGroupConfig, size: number): Record<TouchLine, number> {
  if (ag.suggestedStrategy === "minutes") return { middle: 0, link: 0, wing: 0, field: size };
  const sizes = Object.keys(ag.shapes).map(Number).sort((a, b) => a - b);
  const n = sizes.reduce((best, s) => (Math.abs(s - size) < Math.abs(best - size) ? s : best), sizes[0]);
  return ag.shapes[n]?.[0]?.lines ?? { middle: 0, link: 0, wing: 0, field: size };
}

export const touchPeriodBreak: SportBreakSpec = {
  zones: ({ ageGroup, onFieldSize, shape }) => {
    const defaults = defaultLanes(ageGroup as TouchAgeGroupConfig, onFieldSize);
    return TOUCH_BREAK_ZONES.map((z) => ({ ...z, slots: shape?.[z.key] ?? defaults[z.key] ?? 0 })).filter((z) => z.slots > 0);
  },
  scoreDetail: "points",
  lowTimeMs: 4 * 60_000,
};
