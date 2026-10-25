// The age group a team plays, in the team's own halves, quarters or one
// period (teams.period_count) where its sport lets a team choose:
// basketball and hockey (halves or quarters), touch and Oztag (halves or
// one period). Every other sport plays its age group as it is.

import type { AgeGroupConfig, SportId } from "@/lib/sports/types";
import { getAgeGroupConfig, isBasketball, isSoccer, isTouch } from "@/lib/sports/registry";
import { basketballAgeGroupForTeam } from "@/lib/sports/basketball";
import { soccerFamilyAgeGroupForTeam } from "@/lib/sports/soccer/family";
import { touchAgeGroupForTeam } from "@/lib/sports/touch/family";

export function teamAgeGroup(
  sport: SportId,
  ageGroupId: string | null | undefined,
  periodCount: number | null | undefined,
): AgeGroupConfig {
  if (isBasketball(sport)) return basketballAgeGroupForTeam(ageGroupId, periodCount);
  if (isSoccer(sport)) return soccerFamilyAgeGroupForTeam(sport, ageGroupId, periodCount);
  if (isTouch(sport)) return touchAgeGroupForTeam(sport, ageGroupId, periodCount);
  return getAgeGroupConfig(sport, ageGroupId);
}
