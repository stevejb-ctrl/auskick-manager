// ─── Rugby lines: forwards and backs ─────────────────────────
// How many of a rugby side's players are forwards at an on-field size.
// A sport that states a split per size (union, `forwardsBySize`) gets
// it; otherwise the age group's one `forwardCount` holds at every size
// (league), else half.

import type { AgeGroupConfig } from "@/lib/sports/types";

export function rugbyForwards(ageGroup: AgeGroupConfig, onFieldSize: number): number {
  return ageGroup.forwardsBySize?.[onFieldSize] ?? ageGroup.forwardCount ?? Math.floor(onFieldSize / 2);
}
