// How we play for a Game plan opened outside a lineup screen (the game
// page), built the way the live page builds it, so the plan follows
// the team's roles, rules and season balance (Stagehand usability run:
// the game page's plan ignored them).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameEvent, Sport } from "@/lib/types";
import { loadTeamPlaybook } from "@/lib/playbook/load";
import { seasonTimeByUnit } from "@/lib/playbook/seasonTime";
import { aflPlaybookInput, withBalanceSeason, type AflPlaybookInput } from "@/lib/sports/afl/engine";
import { netballPlaybookInput, type NetballPlaybookInput } from "@/lib/sports/netball/engine";
import { leaguePlaybookInput, type LeaguePlaybookInput } from "@/lib/sports/rugby_league/engine";

export interface GamePlanPlaybooks {
  aflPlaybook?: AflPlaybookInput;
  netballPlaybook?: NetballPlaybookInput;
  leaguePlaybook?: LeaguePlaybookInput;
}

export async function gamePlanPlaybooks(
  supabase: SupabaseClient<any, any, any>,
  teamId: string,
  sport: Sport,
  ageGroup: string | null,
  seasonEvents: GameEvent[],
  periodSeconds: number,
): Promise<GamePlanPlaybooks> {
  const { resolved, prefs, rules, vestStrategy } = await loadTeamPlaybook(supabase, teamId, sport, ageGroup);
  const since = resolved.seasonBalanceSince;
  if (sport === "afl") {
    return { aflPlaybook: withBalanceSeason(aflPlaybookInput(resolved, prefs, rules), seasonEvents, since) };
  }
  if (sport === "netball") {
    const unit = resolved.strategy.balanceUnit === "third" ? "third" : "bib";
    return {
      netballPlaybook: netballPlaybookInput(
        resolved,
        prefs,
        rules,
        seasonTimeByUnit("netball", seasonEvents, unit, { since, periodSeconds }),
        periodSeconds * 1000,
      ),
    };
  }
  return {
    leaguePlaybook: leaguePlaybookInput(
      resolved,
      prefs,
      rules,
      seasonTimeByUnit("rugby_league", seasonEvents, "line", { since }),
      periodSeconds * 1000,
      vestStrategy,
      seasonTimeByUnit("rugby_league", seasonEvents, "position", { since }),
    ),
  };
}
