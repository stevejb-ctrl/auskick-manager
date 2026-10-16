// Which law columns a rugby team's season stats show. Each follows the
// age group's own rule, so a sport or age without a law shows nothing
// for it: penalty and field goals where they score, a vest's column
// where it's worn (none at league U6–U7, FR only at U8), kickoffs where
// the kickoff rotation applies, unbroken periods where §6 does.

import type { AgeGroupConfig } from "@/lib/sports/types";

export interface LeagueStatsColumns {
  goals: boolean;
  fr: boolean;
  dh: boolean;
  kickoffs: boolean;
  unbroken: boolean;
}

export function leagueStatsColumns(ageGroup: AgeGroupConfig): LeagueStatsColumns {
  return {
    goals: ageGroup.goalsFromPlay === true,
    fr: ageGroup.vestRequirements?.fr === true,
    dh: ageGroup.vestRequirements?.dh === true,
    kickoffs: ageGroup.kickRotations === true,
    unbroken: ageGroup.unbrokenPeriods === true,
  };
}
