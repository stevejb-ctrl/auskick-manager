// ─── Rugby lines: forwards and backs ─────────────────────────
// How many of a rugby side's players are forwards at an on-field size.
// A sport that states a split per size (union, `forwardsBySize`) gets
// it; otherwise the age group's one `forwardCount` holds at every size
// (league), else half.

import type { AgeGroupConfig, BreakZoneDef, BreakZoneContext } from "@/lib/sports/types";

export function rugbyForwards(ageGroup: AgeGroupConfig, onFieldSize: number): number {
  return ageGroup.forwardsBySize?.[onFieldSize] ?? ageGroup.forwardCount ?? Math.floor(onFieldSize / 2);
}

/**
 * The break screen's zones for a rugby side: forwards over backs.
 * Slots are the staged lineup's lines, else this size's split.
 */
export function rugbyBreakZones({ ageGroup, onFieldSize, shape }: BreakZoneContext): BreakZoneDef[] {
  const forwards = rugbyForwards(ageGroup, onFieldSize);
  return [
    { key: "forwards", label: "FORWARDS", short: "Forwards", color: "zone1" as const, slots: shape?.forwards ?? forwards },
    { key: "backs", label: "BACKS", short: "Backs", color: "zone3" as const, slots: shape?.backs ?? onFieldSize - forwards },
  ].filter((z) => z.slots > 0);
}
