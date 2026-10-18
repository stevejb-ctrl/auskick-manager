// Barrel re-exports for the sport abstraction.
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { Sport } from "@/lib/types";
import { getSportConfig } from "@/lib/sports/registry";

export * from "@/lib/sports/types";
export {
  ALL_SPORTS,
  ALL_SPORT_IDS,
  getSportConfig,
  getAgeGroupConfig,
  getBrandForHost,
  getSportByBrand,
  isSportId,
  teamSport,
  noSportBranch,
  aflBranch,
  sportNotBuilt,
  isRugby,
  RUGBY_SPORT_IDS,
  isSoccer,
  SOCCER_SPORT_IDS,
  isBasketball,
  BASKETBALL_SPORT_IDS,
} from "@/lib/sports/registry";
export type { RugbySport, SoccerSport, BasketballSport } from "@/lib/sports/registry";
export { aflSport, aflPositionModel } from "@/lib/sports/afl";
export {
  netballSport,
  isPositionAllowedInZone,
  pickNetballPositionsToFill,
  primaryThirdFor,
} from "@/lib/sports/netball";
export { rugbyLeagueSport } from "@/lib/sports/rugby_league";
export { rugbyUnionSport } from "@/lib/sports/rugby_union";
export { soccerSport } from "@/lib/sports/soccer";
export { basketballSport } from "@/lib/sports/basketball";

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

/**
 * The period words for a sport and age group: the age group's own, else
 * the sport's ("quarter" for AFL and netball, "half" where a sport plays
 * halves). Never assume "quarter" for a sport that doesn't say so.
 */
export function periodLabels(
  sport: Sport,
  ageGroup: AgeGroupConfig,
): { label: "quarter" | "half" | "period"; plural: "quarters" | "halves" | "periods" } {
  const cfg = getSportConfig(sport);
  return {
    label: ageGroup.periodLabel ?? cfg.periodLabel,
    plural: ageGroup.periodLabelPlural ?? cfg.periodLabelPlural,
  };
}

/**
 * Whether a brand-new team in this sport + age group starts with the
 * scoreboard on. The setup wizard shows this as "Default for {age}"
 * and createTeam stores it, so the two can never disagree.
 */
export function defaultTrackScoring(sport: Sport, ageGroupId: string): boolean {
  const ageCfg = getSportConfig(sport).ageGroups.find((a) => a.id === ageGroupId);
  return ageCfg?.tracksScoreDefault === true;
}
