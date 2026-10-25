// ─── Touch family — the mixed rule ───────────────────────────
// A mixed team caps the boys on the field (.planning/FOUR-SPORTS-PLAN.md,
// "Mixed teams: the boys' cap"): touch at most 3 boys and at least 1 boy
// and 1 girl (TFA rule 5.4), Oztag at most 4 boys and at least 1 girl
// (ITF rule 3.3), or a local rule the coach sets. Who a kid counts as
// is players.mixed_group, asked only on mixed teams and shown nowhere
// else.
//
// Fair time is per group: with 6 on, at most 3 boys, and a squad of 8
// boys and 4 girls, the boys share 3 places (about 37 % each) and the
// girls 3 (75 % each). Short of girls, the field shrinks to what the
// rule allows ("You can field 4: 3 boys and 1 girl").

import type { MixedGroup } from "@/lib/types";
import type { CompositionConstraint } from "@/lib/live/rollingSubs";
import type { MixedRule, TouchAgeGroupConfig } from "@/lib/sports/touch/types";

/** The team columns that hold a mixed rule (migration 0071). */
export interface MixedRuleColumns {
  mixed_max_boys?: number | null;
  mixed_min_girls?: number | null;
  mixed_min_boys?: number | null;
}

/** A team's mixed rule, or null when it isn't a mixed team. */
export function teamMixedRule(team: MixedRuleColumns | null | undefined): MixedRule | null {
  const maxBoys = team?.mixed_max_boys;
  const minGirls = team?.mixed_min_girls;
  const minBoys = team?.mixed_min_boys;
  if (typeof maxBoys !== "number" || typeof minGirls !== "number" || typeof minBoys !== "number") return null;
  return { maxBoys, minGirls, minBoys };
}

/** A mixed rule as the team columns store it (null: not a mixed team). */
export function mixedRuleColumns(rule: MixedRule | null): Required<MixedRuleColumns> {
  return {
    mixed_max_boys: rule?.maxBoys ?? null,
    mixed_min_girls: rule?.minGirls ?? null,
    mixed_min_boys: rule?.minBoys ?? null,
  };
}

/**
 * Whether a girl's try counts 2 for this team: the sport has one
 * (Oztag), the team is mixed, and the team hasn't turned it off
 * (teams.girls_try_double null = on).
 */
export function girlsTryCountsDouble(
  ageGroup: Pick<TouchAgeGroupConfig, "girlsTryDouble">,
  rule: MixedRule | null,
  teamToggle: boolean | null | undefined,
): boolean {
  return ageGroup.girlsTryDouble && rule !== null && teamToggle !== false;
}

/** The rule as rolling-sub constraints on the tags "boy" and "girl". */
export function mixedConstraints(rule: MixedRule): CompositionConstraint[] {
  return [
    { tag: "boy", min: rule.minBoys, max: rule.maxBoys },
    { tag: "girl", min: rule.minGirls },
  ];
}

/** A kid's tags under the rule: their group, or none. */
export function mixedTags(groupOf: (id: string) => MixedGroup | null | undefined) {
  return (id: string): readonly string[] => {
    const g = groupOf(id);
    return g ? [g] : [];
  };
}

/** Kids of each group among `ids` (`unknown`: no group set). */
export interface MixedCount {
  girls: number;
  boys: number;
  unknown: number;
}

export function countMixedGroups(
  ids: readonly string[],
  groupOf: (id: string) => MixedGroup | null | undefined,
): MixedCount {
  const out: MixedCount = { girls: 0, boys: 0, unknown: 0 };
  for (const id of ids) {
    const g = groupOf(id);
    if (g === "girl") out.girls++;
    else if (g === "boy") out.boys++;
    else out.unknown++;
  }
  return out;
}

/** How a mixed team fields its side from the kids who can play. */
export interface MixedFieldPlan {
  /** Kids on the field: the game's size, or fewer when the rule can't fill it. */
  size: number;
  /** Places for boys and for girls. */
  boys: number;
  girls: number;
  /** Places for kids with no group (they count towards neither). */
  unknown: number;
  /** The rule can't fill the game's size: the field shrinks. */
  short: boolean;
  /** Too few girls (or boys) to meet the rule's minimum at all. */
  belowMinimum: boolean;
}

/**
 * The most kids the rule lets the team field (up to the game's size),
 * and how many boys and girls, split so each group's share of the
 * field is as even as the rule allows. Kids with no group fill places
 * left over.
 */
export function mixedFieldPlan(rule: MixedRule, size: number, available: MixedCount): MixedFieldPlan {
  const B = available.boys;
  const G = available.girls;
  const boysCap = Math.min(rule.maxBoys, B);
  const known = Math.max(0, Math.min(size, boysCap + G));
  const unknown = Math.min(available.unknown, Math.max(0, size - known));
  const minBoys = Math.min(rule.minBoys, B);
  const minGirls = Math.min(rule.minGirls, G);
  const lo = Math.max(0, minBoys, known - G);
  const hi = Math.max(lo, Math.min(boysCap, known - minGirls));
  // Even shares: a boy's share of the field (b / B) as close to a
  // girl's ((known − b) / G) as the rule allows; ties to the split
  // nearest proportional.
  const share = (b: number) => {
    const boyShare = B > 0 ? b / B : 0;
    const girlShare = G > 0 ? (known - b) / G : 0;
    if (B === 0 || G === 0) return 0;
    return Math.abs(boyShare - girlShare);
  };
  const proportional = B + G > 0 ? (known * B) / (B + G) : 0;
  let boys = lo;
  for (let b = lo; b <= hi; b++) {
    const better = share(b) < share(boys) - 1e-9;
    const tie = Math.abs(share(b) - share(boys)) <= 1e-9 && Math.abs(b - proportional) < Math.abs(boys - proportional);
    if (better || tie) boys = b;
  }
  boys = Math.min(boys, boysCap);
  const girls = Math.min(G, known - boys);
  const total = boys + girls + unknown;
  return {
    size: total,
    boys,
    girls,
    unknown,
    short: total < size,
    belowMinimum: G < rule.minGirls || B < rule.minBoys,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "You can field 4: 3 boys and 1 girl" — the banner when the field shrinks. */
export function mixedFieldMessage(plan: MixedFieldPlan): string {
  const parts = [plural(plan.boys, "boy", "boys"), plural(plan.girls, "girl", "girls")];
  if (plan.unknown > 0) parts.push(plural(plan.unknown, "kid with no group", "kids with no group"));
  const last = parts.pop()!;
  return `You can field ${plan.size}: ${parts.length > 0 ? `${parts.join(", ")} and ${last}` : last}`;
}

/** How a field breaks the mixed rule: a sentence, and the pinned chip's short form. */
export interface MixedFieldBreach {
  /** "4 boys on: the mixed rule allows 3" */
  text: string;
  /** "4 boys on · rule 3" */
  short: string;
}

/**
 * How the kids on the field break the rule (the boys' cap first, then
 * the girls and boys it needs), or null when they keep it. Kids with no
 * group count towards neither.
 */
export function mixedFieldBreach(
  onField: readonly string[],
  rule: MixedRule,
  groupOf: (id: string) => MixedGroup | null | undefined,
): MixedFieldBreach | null {
  const { boys, girls } = countMixedGroups(onField, groupOf);
  const on = (n: number, one: string, many: string) => (n === 0 ? `No ${one} on` : `${plural(n, one, many)} on`);
  if (boys > rule.maxBoys) {
    const lead = on(boys, "boy", "boys");
    return { text: `${lead}: the mixed rule allows ${rule.maxBoys}`, short: `${lead} · rule ${rule.maxBoys}` };
  }
  if (girls < rule.minGirls) {
    const lead = on(girls, "girl", "girls");
    return { text: `${lead}: the mixed rule needs ${rule.minGirls}`, short: `${lead} · rule ${rule.minGirls}` };
  }
  if (boys < rule.minBoys) {
    const lead = on(boys, "boy", "boys");
    return { text: `${lead}: the mixed rule needs ${rule.minBoys}`, short: `${lead} · rule ${rule.minBoys}` };
  }
  return null;
}

/** The rule in words: "At most 3 boys on the field, at least 1 girl and 1 boy." */
export function mixedRuleSummary(rule: MixedRule): string {
  const mins = [
    rule.minGirls > 0 ? plural(rule.minGirls, "girl", "girls") : null,
    rule.minBoys > 0 ? plural(rule.minBoys, "boy", "boys") : null,
  ].filter(Boolean);
  const at = `At most ${plural(rule.maxBoys, "boy", "boys")} on the field`;
  return mins.length > 0 ? `${at}, at least ${mins.join(" and ")}.` : `${at}.`;
}

/** The plan and stats line on per-group fair time. */
export const MIXED_FAIRNESS_NOTE = "Boys and girls are evened separately under the mixed rule.";
