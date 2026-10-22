// ─── Touch family rule check ─────────────────────────────────
// A touch or Oztag lineup's own rules as rule-check lines (lib/playbook/
// ruleCheck's RuleCheckItem): the lanes and places, then a mixed team's
// rule. Each line names the rule it breaks from the issue's tag (never
// from its words), and keeps its id as the lineup changes, so the break's
// Fix finds it again. A lineup that keeps them says so, for the pre-game
// RuleCheckBar ("All rules kept"). The break screen (TouchBreak) adds the
// shared game-time floor and shows the broken ones in its issues card.

import type { RuleCheckItem } from "@/lib/playbook/ruleCheck";
import { touchLineupIssues, touchOnField, type TouchLineup } from "@/lib/sports/touch/lineup";
import { countMixedGroups, mixedRuleSummary } from "@/lib/sports/touch/mixed";
import type { TouchMixed } from "@/lib/sports/touch/suggest";
import type { TouchAgeGroupConfig } from "@/lib/sports/touch/types";

/** The lanes rule, as the break screen prints it under a broken line. */
export const TOUCH_LANES_RULE = "One place each, in the lanes the side plays";

export interface TouchLineupCheckInput {
  lineup: TouchLineup;
  ageGroup: TouchAgeGroupConfig;
  /** The side's size: the game's, or what a mixed team's rule allows. */
  size: number;
  mixed?: TouchMixed | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The lineup's own rules: the lane shape, nobody twice, the mixed rule. */
export function touchLineupRuleItems({ lineup, ageGroup, size, mixed }: TouchLineupCheckInput): RuleCheckItem[] {
  const issues = touchLineupIssues(lineup, ageGroup, size, mixed ?? null);
  const items: RuleCheckItem[] = issues.map((issue) =>
    issue.kind === "error"
      ? {
          id: issue.code,
          status: "fail",
          text: issue.message,
          rule: issue.rule === "mixed" && mixed ? mixedRuleSummary(mixed.rule) : TOUCH_LANES_RULE,
          ...(issue.playerId ? { playerIds: [issue.playerId] } : {}),
        }
      : { id: issue.code, status: "warn", text: issue.message },
  );
  const on = touchOnField(lineup);
  if (!issues.some((i) => i.rule === "lanes")) {
    items.push({ id: "lineup-places", status: "ok", text: `${on.length} on the field, one place each` });
  }
  if (mixed && !issues.some((i) => i.rule === "mixed")) {
    const { boys, girls } = countMixedGroups(on, mixed.groupOf);
    items.push({
      id: "mixed-rule",
      status: "ok",
      text: `Mixed rule kept: ${boys} of ${plural(mixed.rule.maxBoys, "boy", "boys")}, ${plural(girls, "girl", "girls")}`,
    });
  }
  return items;
}
