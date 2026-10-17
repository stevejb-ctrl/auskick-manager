// ─── Football (soccer) — How we play ─────────────────────────
// Soccer's own How we play (sports are independent, 14 Oct 2026):
//
//   - Strategies are how the keeper is chosen, the decision a junior
//     soccer coach actually makes. "Everyone has a turn" (MiniRoos'
//     ethos, U8–U11 by default) or "Keepers" (the coach names them,
//     U12 up). 4 a side has no keeper and no lines: "Equal minutes".
//     Either way every kid rotates through the lines, evened out over
//     the season (season balance).
//   - A kid's role is about goal: home "Keeper" marks a keen keeper
//     (or, under "Keepers", one of the named keepers, in rank order);
//     "Not here: Keeper" marks a kid who'd rather not go in goal.
//     Soccer's lines offer no home: the engine rotates every kid
//     through them, so a home line would do nothing.
//   - The laws shown are MiniRoos' (Football Australia): no scores or
//     ladders, rolling subs, no offside, at the ages that play them.

import { soccerAgeGroup } from "@/lib/sports/soccer";
import type { SoccerKeeperPrefs } from "@/lib/sports/soccer/keeper";
import type { SoccerKeeperStrategy } from "@/lib/sports/soccer/types";
import type {
  AgePolicy,
  EffectivePolicy,
  LineDef,
  LockedRule,
  PlaybookSnapshot,
  PlayerPositionPrefRow,
  PositionModel,
  SeasonBalanceSetting,
  SportPlaybook,
  StrategyDef,
} from "@/lib/playbook/types";
import type { RuleKind } from "@/lib/playbook/rules";
import type { ResolvedPlaybook } from "@/lib/playbook/team";

const MINIROOS = "Football Australia MiniRoos";
const FA_EQUAL_TIME = "Football Australia: equal playing time is a priority";

/** The role sheet's one line: goal (keen keeper / named keeper / not in goal). */
const KEEPER_LINE: LineDef = { id: "gk", label: "Keeper", colorToken: "zone-c" };

const TURNS: StrategyDef = {
  id: "turns",
  label: "Everyone has a turn in goal",
  blurb: "One keeper a half, the fewest keeper minutes first. Mark keen keepers, and kids who'd rather not.",
  fit: "MiniRoos (Under 8 to Under 11)",
  usesPositions: false,
  roleHome: "line",
  balanceUnit: "line",
  balanceByDefault: true,
};

const KEEPERS: StrategyDef = {
  id: "keepers",
  label: "Keepers",
  blurb: "You name your keepers (home: Keeper) and they share goal. Everyone else rotates through the lines.",
  fit: "Under 12 and up",
  usesPositions: false,
  roleHome: "line",
  balanceUnit: "line",
  balanceByDefault: true,
};

const MINUTES: StrategyDef = {
  id: "minutes",
  label: "Equal minutes",
  blurb: "4 a side, no keeper and no lines: kids just play, and Siren evens out their minutes.",
  fit: "Under 6 and Under 7",
  usesPositions: false,
  balanceUnit: null,
  balanceByDefault: false,
};

/** The MiniRoos ages (U6–U11), whose laws come from Football Australia. */
function isMiniRoos(ageGroup: string): boolean {
  return ["U6", "U7", "U8", "U9", "U10", "U11"].includes(ageGroup);
}

/**
 * The keeper strategy a team plays: none where the age has no keeper,
 * else the team's How we play strategy ("keepers" or "turns").
 */
export function soccerKeeperStrategy(ageGroup: string, strategyId: string | null | undefined): SoccerKeeperStrategy {
  if (soccerAgeGroup(ageGroup).keeper === "none") return "none";
  return strategyId === "keepers" ? "keepers" : "turns";
}

type PrefLike = Pick<PlayerPositionPrefRow, "player_id" | "position_key" | "line" | "kind" | "rank">;

/**
 * The keeper prefs from How we play's roles: home "Keeper" is a keen
 * keeper and, under "Keepers", a named keeper (in rank order); "Not
 * here: Keeper" is a kid who'd rather not go in goal.
 */
export function soccerKeeperPrefs(prefs: readonly PrefLike[]): SoccerKeeperPrefs {
  const goal = [...prefs]
    .filter((p) => p.line === "gk" && !p.position_key)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const home = goal.filter((p) => p.kind === "home").map((p) => p.player_id);
  return {
    keenKeepers: home,
    namedKeepers: home,
    notInGoal: goal.filter((p) => p.kind === "never").map((p) => p.player_id),
  };
}

/** How we play, as the soccer suggesters read it. */
export interface SoccerHowWePlay {
  keeperStrategy: SoccerKeeperStrategy;
  prefs: SoccerKeeperPrefs;
  /** Season balance strength ("off" switches it off). */
  balance: SeasonBalanceSetting;
  /** Only games after this count towards season balance. */
  since: string | null;
}

/**
 * A team's How we play for the soccer suggesters. A game already kicked
 * off plays the strategy and season balance it kicked off with (its
 * snapshot), as AFL's and netball's do; roles are read as they are now.
 */
export function soccerHowWePlay(
  loaded: { resolved: Pick<ResolvedPlaybook, "strategy" | "seasonBalance" | "seasonBalanceSince">; prefs: readonly PrefLike[] },
  ageGroup: string,
  snapshot?: Pick<PlaybookSnapshot, "strategy" | "seasonBalance" | "seasonBalanceSince"> | null,
): SoccerHowWePlay {
  return {
    keeperStrategy: soccerKeeperStrategy(ageGroup, snapshot?.strategy ?? loaded.resolved.strategy.id),
    prefs: soccerKeeperPrefs(loaded.prefs),
    balance: snapshot?.seasonBalance ?? loaded.resolved.seasonBalance,
    since: snapshot ? snapshot.seasonBalanceSince : loaded.resolved.seasonBalanceSince,
  };
}

export const soccerPlaybook: SportPlaybook = {
  sport: "soccer",
  unitWord: "line",
  // Rolling subs: "nobody sits out twice" counts stints.
  benchPeriodWord: () => "stint",

  // The soccer engine acts on no catalogue rule yet; none is offered
  // until it does (it would do nothing).
  engineRuleKinds: [],
  ruleKinds(): RuleKind[] {
    return [];
  },

  lawRules(policy: EffectivePolicy): LockedRule[] {
    if (!isMiniRoos(policy.ageGroup)) return [];
    return [
      { id: "miniroos-scores", text: "No scores or ladders are kept", source: MINIROOS },
      { id: "miniroos-subs", text: "Subs roll on and off at any time, as often as you like", source: MINIROOS },
      { id: "miniroos-offside", text: "No offside", source: MINIROOS },
    ];
  },

  agePolicy(ageGroup: string): AgePolicy {
    const cfg = soccerAgeGroup(ageGroup);
    return {
      zonesEnforced: { default: false, overridable: false },
      // Equal time is the target; the floor is a warning the coach can move.
      minGameTimePct: { default: 50, overridable: true, band: [0, 100], locked: false, source: FA_EQUAL_TIME },
      tracksScoreDefault: cfg.tracksScoreDefault,
    };
  },

  positionModel(policy: EffectivePolicy): PositionModel {
    const withKeeper = soccerAgeGroup(policy.ageGroup).keeper !== "none";
    return {
      kind: "none",
      lines: withKeeper ? [KEEPER_LINE] : [],
      defaults: [],
      canRename: false,
      canAddRemove: false,
    };
  },

  strategies(policy: EffectivePolicy): StrategyDef[] {
    return soccerAgeGroup(policy.ageGroup).keeper === "none" ? [MINUTES] : [TURNS, KEEPERS];
  },

  recommendedStrategy(policy: EffectivePolicy): string {
    const keeper = soccerAgeGroup(policy.ageGroup).keeper;
    return keeper === "none" ? MINUTES.id : keeper === "keepers" ? KEEPERS.id : TURNS.id;
  },

  fallbackStrategy(policy: EffectivePolicy): string {
    // The engine's own default for the age: what a team with no saved
    // choice already plays.
    return soccerPlaybook.recommendedStrategy(policy);
  },
};
