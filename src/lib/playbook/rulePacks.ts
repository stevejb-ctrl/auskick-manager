// Local rule packs (UX plan §7.4, chunk 4.6): a few ordinary rules a
// coach adds in one tap, then edits. Labelled "Local rules (added by
// you)" — Siren doesn't present them as any association's official
// rules until someone has checked them against its by-laws.

import { newRule, type RuleInstance, type RuleKind, type RuleParams, type RuleStrength } from "@/lib/playbook/rules";
import type { PolicyOverrides } from "@/lib/playbook/types";
import type { Sport } from "@/lib/types";

export interface RulePack {
  id: string;
  sport: Sport;
  title: string;
  blurb: string;
  /** Ages the pack is offered for; omitted = every age. */
  ages?: string[];
  policy?: PolicyOverrides;
  rules: { kind: RuleKind; params?: RuleParams; strength: RuleStrength }[];
}

export const RULE_PACKS: RulePack[] = [
  {
    id: "afl-club-development",
    sport: "afl",
    title: "Club development (U11–U12)",
    blurb: "Every line each game · at least 60% game time · nobody sits out twice running",
    ages: ["U11", "U12"],
    policy: { minGameTimePct: 60 },
    rules: [
      { kind: "every-line-per-game", strength: "must" },
      { kind: "max-bench-in-row", params: { count: 2 }, strength: "must" },
    ],
  },
  {
    id: "afl-zones-until-u11",
    sport: "afl",
    title: "Zones until U11",
    blurb: "For leagues that zone a year longer: kids keep rotating through zones at U11",
    ages: ["U11"],
    policy: { zonesEnforced: true },
    rules: [],
  },
  {
    id: "netball-association-junior",
    sport: "netball",
    title: "Association junior rules",
    blurb: "At least 2 quarters each · 2 different thirds a game · nobody sits out twice running",
    policy: { minGameTimePct: 50 },
    rules: [
      { kind: "distinct-lines", params: { count: 2 }, strength: "must" },
      { kind: "max-bench-in-row", params: { count: 2 }, strength: "must" },
    ],
  },
  {
    id: "league-mod-club",
    sport: "rugby_league",
    title: "Mod League club rules",
    blurb: "At least half the game · both lines each game · nobody sits out twice running",
    policy: { minGameTimePct: 50 },
    rules: [
      { kind: "every-line-per-game", strength: "must" },
      { kind: "max-bench-in-row", params: { count: 2 }, strength: "must" },
    ],
  },
];

export function rulePacksFor(sport: Sport, ageGroup: string): RulePack[] {
  return RULE_PACKS.filter((p) => p.sport === sport && (!p.ages || p.ages.includes(ageGroup)));
}

/**
 * Add a pack's rules to the team's: a rule of a kind the team already
 * has is replaced by the pack's (repeatable kinds are added alongside).
 */
export function applyPackRules(current: RuleInstance[], pack: RulePack): RuleInstance[] {
  const replacing = new Set(pack.rules.map((r) => r.kind));
  const kept = current.filter((r) => !replacing.has(r.kind) || r.kind === "keep-apart" || r.kind === "keep-together");
  const added = pack.rules.map((r) => {
    const rule = newRule(r.kind, `pack:${pack.id}`);
    return { ...rule, params: { ...rule.params, ...(r.params ?? {}) }, strength: r.strength };
  });
  return [...kept, ...added];
}
