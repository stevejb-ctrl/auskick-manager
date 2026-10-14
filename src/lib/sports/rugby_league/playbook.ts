// Rugby league — How we play (UX plan §7.3).
//
// NRL Modified Games: Mini Footy (U6–U9) is forwards and backs only;
// Mod League (U10–U12) can add standard named positions from a fixed
// catalogue (no renaming). The policy pieces that matter are the First
// Receiver / Dummy Half vests and §6 unbroken periods, both from the
// age config. Vests are duties, not positions.

import { getAgeGroupConfig, periodLabels } from "@/lib/sports";
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
import { sidedPositions } from "@/lib/playbook/sides";
import type { RuleKind } from "@/lib/playbook/rules";

const NRL_LAWS = "NRL Junior League Laws";
const MOD_LEAGUE = new Set(["U10", "U11", "U12"]);
// Named positions: Mod League and the international-laws grades.
const NAMED_POSITION_AGES = new Set(["U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17"]);

export const LEAGUE_LINES: LineDef[] = [
  { id: "forwards", label: "Forwards", colorToken: "zone-f" },
  { id: "backs", label: "Backs", colorToken: "zone-b" },
];

const NAMES: Record<string, string> = {
  PR: "Prop",
  HK: "Hooker",
  "2R": "Second row",
  LK: "Lock",
  FB: "Fullback",
  WG: "Wing",
  CE: "Centre",
  "5/8": "Five-eighth",
  HB: "Halfback",
};
// Filled in this order as the on-field size grows (13 = a full side).
const FORWARD_ORDER = ["PR", "HK", "PR", "2R", "2R", "LK"];
const BACK_ORDER = ["FB", "HB", "5/8", "CE", "CE", "WG", "WG"];

/** Catalogue positions for an on-field size and forward count. */
export function leagueCatalogue(onFieldSize: number, forwardCount: number): PositionDef[] {
  const forwards = FORWARD_ORDER.slice(0, Math.min(forwardCount, FORWARD_ORDER.length));
  const backs = BACK_ORDER.slice(0, Math.max(0, onFieldSize - forwards.length));
  const seen: Record<string, number> = {};
  const keyOf = (label: string, list: string[]) => {
    seen[label] = (seen[label] ?? 0) + 1;
    const base = label === "5/8" ? "fe" : label.toLowerCase();
    return list.filter((l) => l === label).length > 1 ? `${base}${seen[label]}` : base;
  };
  const place = (labels: string[], line: string, top: number, bottom: number): PositionDef[] => {
    const rows: string[][] = [];
    for (let i = 0; i < labels.length; i += 3) rows.push(labels.slice(i, i + 3));
    return rows.flatMap((row, r) =>
      row.map((label, c) => ({
        key: keyOf(label, labels),
        label,
        name: NAMES[label] ?? label,
        line,
        x: (c + 0.5) / row.length,
        y: rows.length === 1 ? (top + bottom) / 2 : top + ((bottom - top) * r) / (rows.length - 1),
      })),
    );
  };
  // Every position its own name: PR → LPR / RPR, as AFL's pockets.
  return sidedPositions([...place(forwards, "forwards", 0.12, 0.38), ...place(backs, "backs", 0.58, 0.9)]);
}

const BASE_STRATEGIES: StrategyDef[] = [
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
    balanceUnit: "line",
    balanceByDefault: true,
  },
];
const NAMED_POSITIONS: StrategyDef = {
  id: "named-positions",
  label: "Named positions",
  blurb: "Kids get home positions from the standard list (prop, hooker, halfback…).",
  fit: "Mod League (U10–U12) and up",
  usesPositions: true,
  balanceUnit: "position",
  balanceByDefault: true,
};

export const leaguePlaybook: SportPlaybook = {
  sport: "rugby_league",
  unitWord: "line",
  // Rolling subs: "nobody sits out twice" would count stints.
  benchPeriodWord: () => "stint",

  // The league engine acts on no catalogue rule except subs at the
  // breaks (suggestLeagueSubs). Every-line, apart/together, stays-home
  // and bench rules aren't offered until it does: they'd do nothing.
  ruleKinds(): RuleKind[] {
    return ["subs-at-breaks"];
  },

  lawRules(policy, agePolicy): LockedRule[] {
    const out: LockedRule[] = [];
    // The age group's own period: U6–U9 play quarters, U10+ halves.
    const periods = periodLabels("rugby_league", getAgeGroupConfig("rugby_league", policy.ageGroup));
    if (policy.minUnbrokenPeriods > 0) {
      out.push({
        id: "unbroken",
        text: `At least ${policy.minUnbrokenPeriods} unbroken ${policy.minUnbrokenPeriods === 1 ? periods.label : periods.plural} each`,
        source: agePolicy.minUnbrokenPeriods?.source ?? NRL_LAWS,
      });
    }
    if (policy.vests.fr || policy.vests.dh) {
      out.push({ id: "vests", text: `Each vest is worn by a different player each ${periods.label}`, source: NRL_LAWS });
    }
    return out;
  },

  agePolicy(ageGroup: string): AgePolicy {
    const cfg = getAgeGroupConfig("rugby_league", ageGroup);
    return {
      zonesEnforced: { default: false, overridable: false },
      minGameTimePct: { default: 50, overridable: true, band: [0, 100], locked: false },
      // The laws' count. The team's on/off switch (enforce_unbroken_periods)
      // is the control: the planner and live screen read the age group's
      // count, so an override here would show a rule nothing enforces.
      minUnbrokenPeriods: {
        default: cfg.minUnbrokenPeriods ?? 0,
        overridable: false,
        source: `${NRL_LAWS} §6`,
      },
      vests: { fr: cfg.vestRequirements?.fr ?? false, dh: cfg.vestRequirements?.dh ?? false },
      tracksScoreDefault: cfg.tracksScoreDefault,
    };
  },

  positionModel(policy: EffectivePolicy, onFieldSize: number): PositionModel {
    if (!NAMED_POSITION_AGES.has(policy.ageGroup)) {
      return { kind: "none", lines: LEAGUE_LINES, defaults: [], canRename: false, canAddRemove: false };
    }
    const cfg = getAgeGroupConfig("rugby_league", policy.ageGroup);
    return {
      kind: "catalogue",
      lines: LEAGUE_LINES,
      defaults: leagueCatalogue(onFieldSize, cfg.forwardCount ?? Math.floor(onFieldSize / 2)),
      canRename: false,
      canAddRemove: false,
    };
  },

  strategies(policy: EffectivePolicy): StrategyDef[] {
    return NAMED_POSITION_AGES.has(policy.ageGroup) ? [...BASE_STRATEGIES, NAMED_POSITIONS] : BASE_STRATEGIES;
  },

  recommendedStrategy(policy: EffectivePolicy): string {
    // Past Mod League kids play set positions (international laws).
    if (getAgeGroupConfig("rugby_league", policy.ageGroup).internationalLaws) return "named-positions";
    return MOD_LEAGUE.has(policy.ageGroup) ? "preferred-line" : "both-lines";
  },

  fallbackStrategy(): string {
    // Today's engine: forwards/backs from the player's F/B chip when set.
    return "preferred-line";
  },
};
