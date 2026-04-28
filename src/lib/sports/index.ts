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
 * Resolve the effective quarter duration (in seconds) for a game.
 * Three-level resolution, most specific wins:
 *   1. game.quarter_length_seconds — set when this individual match
 *      runs to a non-standard length (finals, weather, double-
 *      header). Optional; pass `null`/`undefined` for the game arg
 *      when the caller doesn't have a game in hand (e.g. team
 *      settings preview).
 *   2. team.quarter_length_seconds — set when the league this team
 *      plays in has a different quarter length than the age-group
 *      default.
 *   3. ageGroup.periodSeconds — sport-config default.
 */
export function getEffectiveQuarterSeconds(
  team: { quarter_length_seconds: number | null },
  ageGroup: AgeGroupConfig,
  game?: { quarter_length_seconds: number | null } | null,
): number {
  if (game?.quarter_length_seconds != null) {
    return game.quarter_length_seconds;
  }
  return team.quarter_length_seconds ?? ageGroup.periodSeconds;
}
