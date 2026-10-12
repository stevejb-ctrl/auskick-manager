// Rule terms shared by the suggesters (UX plan 4.2): lines (thirds) a
// kid still has to play, players kept apart or together, kids who stay
// home. Sport-agnostic — AFL passes lines, netball thirds.

import type { RuleInstance } from "@/lib/playbook/rules";

/** Must = the engine doesn't break it; Prefer = a weight. */
export const RULE_WEIGHT = { must: 20000, prefer: 3000 } as const;
/** A line a kid hasn't played yet, under an every-line rule. */
export const LINE_RULE_WEIGHT = { must: 20000, prefer: 1500 } as const;

/**
 * Rule terms for placing player `pid` in zone `z` (UX plan 4.2): lines
 * still to play, players kept apart or together, kids who stay home.
 * `placed` is who's already been put in each zone this pass.
 */
export function ruleScore(
  rules: RuleInstance[],
  pid: string,
  line: string,
  linesPlayed: Set<string>,
  lineCount: number,
  placedInZone: Set<string> | undefined,
  homeLine: string | null,
): number {
  let score = 0;
  for (const rule of rules) {
    switch (rule.kind) {
      case "every-line-per-game":
      case "distinct-lines": {
        const need = rule.kind === "every-line-per-game" ? lineCount : (rule.params.count ?? 2);
        if (linesPlayed.size < need && !linesPlayed.has(line)) score += LINE_RULE_WEIGHT[rule.strength];
        break;
      }
      case "keep-apart":
      case "keep-together": {
        const ids = rule.params.playerIds ?? [];
        if (!ids.includes(pid) || !placedInZone) break;
        let mates = 0;
        placedInZone.forEach((other) => {
          if (other !== pid && ids.includes(other)) mates++;
        });
        score += (rule.kind === "keep-apart" ? -1 : 1) * mates * RULE_WEIGHT[rule.strength];
        break;
      }
      case "stays-home":
        if ((rule.params.playerIds ?? []).includes(pid) && homeLine === line) score += RULE_WEIGHT[rule.strength];
        break;
      default:
        break;
    }
  }
  return score;
}

