// How we play — entry points (UX plan §7.6). Sport files supply data;
// the engines and the setup UI read the same config through these.

import { aflPlaybook } from "@/lib/sports/afl/playbook";
import { netballPlaybook } from "@/lib/sports/netball/playbook";
import { leaguePlaybook } from "@/lib/sports/rugby_league/playbook";
import { resolvePolicy } from "@/lib/playbook/resolve";
import type { Sport } from "@/lib/types";
import type {
  EffectivePolicy,
  PolicyOverrides,
  SportPlaybook,
  StrategyDef,
} from "@/lib/playbook/types";

export * from "@/lib/playbook/types";
export { resolvePolicy } from "@/lib/playbook/resolve";

export function getSportPlaybook(sport: Sport): SportPlaybook {
  switch (sport) {
    case "netball":
      return netballPlaybook;
    case "rugby_league":
      return leaguePlaybook;
    default:
      return aflPlaybook;
  }
}

/** The age group's policy with the team's overrides applied. */
export function effectivePolicy(
  sport: Sport,
  ageGroup: string,
  overrides: PolicyOverrides = {},
): EffectivePolicy {
  return resolvePolicy(sport, ageGroup, getSportPlaybook(sport).agePolicy(ageGroup), overrides);
}

/**
 * The strategy a team plays: its saved choice when that's still valid for
 * the policy (e.g. not "set-positions" after zones came back on), else
 * the sport's fallback — today's behaviour, so nothing changes for a
 * team that hasn't chosen.
 */
export function effectiveStrategy(
  sport: Sport,
  policy: EffectivePolicy,
  saved: string | null | undefined,
): StrategyDef {
  const playbook = getSportPlaybook(sport);
  const options = playbook.strategies(policy);
  return (
    options.find((s) => s.id === saved) ??
    options.find((s) => s.id === playbook.fallbackStrategy(policy)) ??
    options[0]
  );
}
