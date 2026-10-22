// ─── Touch family rule check ─────────────────────────────────
// A touch or Oztag lineup's own rules as rule-check lines (lib/playbook/
// ruleCheck's RuleCheckItem): the lanes and places, then a mixed team's
// rule. The break screen (TouchBreak) adds the shared game-time floor
// and shows them in its issues card.

import type { RuleCheckItem } from "@/lib/playbook/ruleCheck";
import { validateTouchLineup, type TouchLineup } from "@/lib/sports/touch/lineup";
import { mixedRuleSummary } from "@/lib/sports/touch/mixed";
import type { TouchMixed } from "@/lib/sports/touch/suggest";
import type { TouchAgeGroupConfig } from "@/lib/sports/touch/types";

export interface TouchLineupCheckInput {
  lineup: TouchLineup;
  ageGroup: TouchAgeGroupConfig;
  /** The side's size: the game's, or what a mixed team's rule allows. */
  size: number;
  mixed?: TouchMixed | null;
}

/** The lineup's own rules: the lane shape, nobody twice, the mixed rule. */
export function touchLineupRuleItems({ lineup, ageGroup, size, mixed }: TouchLineupCheckInput): RuleCheckItem[] {
  const items: RuleCheckItem[] = [];
  const valid = validateTouchLineup(lineup, ageGroup, size, mixed ?? null);
  valid.issues.forEach((issue, i) => {
    const mixedIssue = /boys|girls|Girl or Boy/.test(issue.message);
    items.push(
      issue.kind === "error"
        ? {
            id: `lineup-${i}`,
            status: "fail",
            text: issue.message,
            rule: mixedIssue && mixed ? mixedRuleSummary(mixed.rule) : "One place each, in the lanes the side plays",
            ...(issue.playerId ? { playerIds: [issue.playerId] } : {}),
          }
        : { id: `lineup-${i}`, status: "warn", text: issue.message },
    );
  });
  return items;
}
