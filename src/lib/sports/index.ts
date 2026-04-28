// Barrel re-exports for the sport abstraction.
import type { AgeGroupConfig } from "@/lib/sports/types";

export * from "@/lib/sports/types";
export {
  ALL_SPORTS,
  ALL_SPORT_IDS,
  getSportConfig,
  getAgeGroupConfig,
  getBrandForHost,
  getSportByBrand,
  isSportId,
} from "@/lib/sports/registry";
export { aflSport } from "@/lib/sports/afl";
export { netballSport, isPositionAllowedInZone, primaryThirdFor } from "@/lib/sports/netball";

/**
 * Resolve the effective quarter duration (in seconds) for a team.
 * The team's per-row `quarter_length_seconds` override wins when
 * set; otherwise we fall back to the age group's default. Used by
 * the live-game clock and time-credit accounting so a coach can
 * tune their team's quarters without forking the sport config.
 */
export function getEffectiveQuarterSeconds(
  team: { quarter_length_seconds: number | null },
  ageGroup: AgeGroupConfig,
): number {
  return team.quarter_length_seconds ?? ageGroup.periodSeconds;
}
