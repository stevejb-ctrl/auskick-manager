// How we play for a rugby sport (league, union). The engine is shared —
// two lines, rolling subs, FR / DH vests where an age wears them — and
// each sport supplies its own laws and its own named-position catalogue
// (RugbyPlaybookRules), so nothing reads another sport's.

import { getAgeGroupConfig, periodLabels, type RugbySport } from "@/lib/sports";
import type {
  AgePolicy,
  EffectivePolicy,
  LineDef,
  LockedRule,
  PositionDef,
  PositionModel,
  SportPlaybook,
  StrategyDef,
} from "@/lib/playbook/types";
import type { RuleKind } from "@/lib/playbook/rules";
import { rugbyForwards } from "@/lib/sports/rugby/lines";

export const RUGBY_LINES: LineDef[] = [
  { id: "forwards", label: "Forwards", colorToken: "zone-f" },
  { id: "backs", label: "Backs", colorToken: "zone-b" },
];

export const RUGBY_BASE_STRATEGIES: StrategyDef[] = [
  {
    id: "both-lines",
    label: "Both lines",
    blurb: "Every kid plays forwards and backs across the season.",
    usesPositions: false,
    balanceUnit: "line",
    balanceByDefault: true,
  },
  {
    id: "preferred-line",
    label: "Preferred line",
    blurb: "Kids lean to forwards or backs, with time on the other line too.",
    usesPositions: false,
    roleHome: "line",
    balanceUnit: "line",
    balanceByDefault: true,
  },
];

/** What a rugby sport's How we play states for itself. */
export interface RugbyPlaybookRules {
  /** The laws its locked rules cite ("NRL Junior League Laws"). */
  lawSource: string;
  /** Where its unbroken-period rule is written, if it has one (league's §6). */
  unbrokenLawSource?: string;
  /** The ages that may play named positions. */
  namedPositionAges: ReadonlySet<string>;
  /** Its named positions at an on-field size: the sport's own catalogue. */
  catalogue(onFieldSize: number, forwardCount: number): PositionDef[];
  /** Its "Named positions" strategy (blurb and fit in its own words). */
  namedPositions: StrategyDef;
}

export function rugbyPlaybook(sport: RugbySport, rules: RugbyPlaybookRules): SportPlaybook {
  return {
    sport,
    unitWord: "line",
    // Rolling subs: "nobody sits out twice" would count stints.
    benchPeriodWord: () => "stint",

    // The rugby engine acts on no catalogue rule except subs at the
    // breaks (suggestLeagueSubs). Every-line, apart/together, stays-home
    // and bench rules aren't offered until it does: they'd do nothing.
    engineRuleKinds: ["subs-at-breaks"],

    ruleKinds(): RuleKind[] {
      return ["subs-at-breaks"];
    },

    lawRules(policy, agePolicy): LockedRule[] {
      const out: LockedRule[] = [];
      // The age group's own period: league's U6–U9 play quarters.
      const periods = periodLabels(sport, getAgeGroupConfig(sport, policy.ageGroup));
      if (policy.minUnbrokenPeriods > 0) {
        out.push({
          id: "unbroken",
          text: `At least ${policy.minUnbrokenPeriods} unbroken ${policy.minUnbrokenPeriods === 1 ? periods.label : periods.plural} each`,
          source: agePolicy.minUnbrokenPeriods?.source ?? rules.lawSource,
        });
      }
      if (policy.vests.fr || policy.vests.dh) {
        out.push({ id: "vests", text: `Each vest is worn by a different player each ${periods.label}`, source: rules.lawSource });
      }
      return out;
    },

    agePolicy(ageGroup: string): AgePolicy {
      const cfg = getAgeGroupConfig(sport, ageGroup);
      return {
        zonesEnforced: { default: false, overridable: false },
        minGameTimePct: { default: 50, overridable: true, band: [0, 100], locked: false },
        // The laws' count. The team's on/off switch (enforce_unbroken_periods)
        // is the control: the planner and live screen read the age group's
        // count, so an override here would show a rule nothing enforces.
        minUnbrokenPeriods: {
          default: cfg.minUnbrokenPeriods ?? 0,
          overridable: false,
          source: rules.unbrokenLawSource ?? rules.lawSource,
        },
        vests: { fr: cfg.vestRequirements?.fr ?? false, dh: cfg.vestRequirements?.dh ?? false },
        tracksScoreDefault: cfg.tracksScoreDefault,
      };
    },

    positionModel(policy: EffectivePolicy, onFieldSize: number): PositionModel {
      if (!rules.namedPositionAges.has(policy.ageGroup)) {
        return { kind: "none", lines: RUGBY_LINES, defaults: [], canRename: false, canAddRemove: false };
      }
      const cfg = getAgeGroupConfig(sport, policy.ageGroup);
      return {
        kind: "catalogue",
        lines: RUGBY_LINES,
        defaults: rules.catalogue(onFieldSize, rugbyForwards(cfg, onFieldSize)),
        canRename: false,
        canAddRemove: false,
      };
    },

    strategies(policy: EffectivePolicy): StrategyDef[] {
      return rules.namedPositionAges.has(policy.ageGroup)
        ? [...RUGBY_BASE_STRATEGIES, rules.namedPositions]
        : RUGBY_BASE_STRATEGIES;
    },

    recommendedStrategy(policy: EffectivePolicy): string {
      // The age group's own (league: both lines in Mini Footy, preferred
      // line in Mod League and named positions past it).
      const id = getAgeGroupConfig(sport, policy.ageGroup).recommendedStrategy;
      if (!id) throw new Error(`${sport} ${policy.ageGroup} has no recommended strategy`);
      return id;
    },

    fallbackStrategy(): string {
      // Today's engine: forwards/backs from the player's F/B chip when set.
      return "preferred-line";
    },
  };
}
