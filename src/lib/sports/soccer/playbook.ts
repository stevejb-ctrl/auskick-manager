// ─── The soccer family — How we play ─────────────────────────
// How we play for a soccer-family sport (Football (soccer), futsal,
// hockey), as rugbyPlaybook is for league and union: the engine's
// questions are shared, and each sport supplies its own words, laws and
// sources (SoccerFamilyRules), so nothing reads another sport's.
//
//   - Strategies are how the keeper is chosen, the decision a junior
//     coach actually makes. "Everyone has a turn" (soccer's MiniRoos
//     ages, futsal to U11, hockey U9–U12 by default) or "Keepers" (the
//     coach names them). Ages with no keeper and no lines play "Equal
//     minutes". Either way every kid rotates through the lines, evened
//     out over the season (season balance).
//   - A kid's role: goal, and the lines they play. Home "Keeper" marks
//     a keen keeper (or, under "Keepers", one of the named keepers, in
//     rank order); "Takes a turn in goal" switched off (a never row on
//     Keeper) marks a kid who'd rather not go in goal. "Plays as" the
//     lines (Steve 2026-10-22: "you can go forward and backs") keeps a
//     kid to those lines (never rows for the rest). The lines offer no
//     main: a home row is a keen keeper.
//   - The laws shown are the sport's own (rules.ruleSource), at the
//     ages they cover: soccer's MiniRoos (no scores or ladders, rolling
//     subs, no offside), futsal's FIFA laws, hockey's FIH.

import type { SoccerSport } from "@/lib/sports/registry";
import { SOCCER_RULES, soccerFormations } from "@/lib/sports/soccer";
import { soccerFamilyAgeGroup } from "@/lib/sports/soccer/family";
import type { SoccerKeeperPrefs } from "@/lib/sports/soccer/keeper";
import { SOCCER_OUTFIELD_LINES, type SoccerFamilyRules, type SoccerKeeperStrategy, type SoccerLine } from "@/lib/sports/soccer/types";
import type {
  AgePolicy,
  EffectivePolicy,
  LawRulesTeam,
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

/** The role sheet's one line: goal (keen keeper / named keeper / not in goal). */
function keeperLine(rules: SoccerFamilyRules): LineDef {
  return { id: "gk", label: rules.lineLabels.gk.label, colorToken: "zone-c" };
}

const LINE_TOKEN: Record<SoccerLine, LineDef["colorToken"]> = { def: "zone-b", mid: "zone-c", att: "zone-f", field: "zone-c" };

/** The outfield lines an age plays in any of its shapes (none at 4 a side). */
function outfieldLines(rules: SoccerFamilyRules, ag: ReturnType<typeof soccerFamilyAgeGroup>): LineDef[] {
  const shapes = soccerFormations(ag, ag.defaultOnFieldSize);
  return SOCCER_OUTFIELD_LINES.filter((l) => shapes.some((f) => f.lines[l] > 0)).map((l) => ({
    id: l,
    label: rules.lineLabels[l].label,
    colorToken: LINE_TOKEN[l],
  }));
}

/** The three keeper strategies, in the sport's own words. */
function strategyDefs(rules: SoccerFamilyRules): Record<"turns" | "keepers" | "minutes", StrategyDef> {
  const copy = rules.strategyCopy;
  return {
    turns: {
      id: "turns",
      label: "Everyone has a turn in goal",
      ...copy.turns,
      usesPositions: false,
      roleHome: "line",
      balanceUnit: "line",
      balanceByDefault: true,
    },
    keepers: {
      id: "keepers",
      label: "Keepers",
      ...copy.keepers,
      usesPositions: false,
      roleHome: "line",
      balanceUnit: "line",
      balanceByDefault: true,
    },
    minutes: {
      id: "minutes",
      label: "Equal minutes",
      ...copy.minutes,
      usesPositions: false,
      balanceUnit: null,
      balanceByDefault: false,
    },
  };
}

/**
 * The keeper strategy a team plays: none where the sport's age has no
 * keeper, else the team's How we play strategy ("keepers" or "turns").
 */
export function soccerKeeperStrategy(
  sport: SoccerSport,
  ageGroup: string,
  strategyId: string | null | undefined,
): SoccerKeeperStrategy {
  if (soccerFamilyAgeGroup(sport, ageGroup).keeper === "none") return "none";
  return strategyId === "keepers" ? "keepers" : "turns";
}

type PrefLike = Pick<PlayerPositionPrefRow, "player_id" | "position_key" | "line" | "kind" | "rank">;

/**
 * The keeper prefs from How we play's roles: home "Keeper" is a keen
 * keeper and, under "Keepers", a named keeper (in rank order); a never
 * row on Keeper ("Takes a turn in goal" off) is a kid who'd rather not
 * go in goal.
 */
export function soccerKeeperPrefs(prefs: readonly PrefLike[]): SoccerKeeperPrefs {
  const goal = [...prefs]
    .filter((p) => p.line === "gk" && !p.position_key)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const home = goal.filter((p) => p.kind === "home").map((p) => p.player_id);
  const notInLine: Record<string, SoccerLine[]> = {};
  for (const p of prefs) {
    if (p.kind !== "never" || p.position_key || !p.line) continue;
    if (!(SOCCER_OUTFIELD_LINES as readonly string[]).includes(p.line)) continue;
    (notInLine[p.player_id] ??= []).push(p.line as SoccerLine);
  }
  return {
    keenKeepers: home,
    namedKeepers: home,
    notInGoal: goal.filter((p) => p.kind === "never").map((p) => p.player_id),
    notInLine,
  };
}

/** How we play, as the soccer-family suggesters read it. */
export interface SoccerHowWePlay {
  keeperStrategy: SoccerKeeperStrategy;
  prefs: SoccerKeeperPrefs;
  /** Season balance strength ("off" switches it off). */
  balance: SeasonBalanceSetting;
  /** Only games after this count towards season balance. */
  since: string | null;
}

/**
 * A team's How we play for the soccer-family suggesters. A game already
 * kicked off plays the strategy and season balance it kicked off with
 * (its snapshot), as AFL's and netball's do; roles are read as they are
 * now.
 */
export function soccerHowWePlay(
  loaded: { resolved: Pick<ResolvedPlaybook, "strategy" | "seasonBalance" | "seasonBalanceSince">; prefs: readonly PrefLike[] },
  sport: SoccerSport,
  ageGroup: string,
  snapshot?: Pick<PlaybookSnapshot, "strategy" | "seasonBalance" | "seasonBalanceSince"> | null,
): SoccerHowWePlay {
  return {
    keeperStrategy: soccerKeeperStrategy(sport, ageGroup, snapshot?.strategy ?? loaded.resolved.strategy.id),
    prefs: soccerKeeperPrefs(loaded.prefs),
    balance: snapshot?.seasonBalance ?? loaded.resolved.seasonBalance,
    since: snapshot ? snapshot.seasonBalanceSince : loaded.resolved.seasonBalanceSince,
  };
}

/** How we play for a soccer-family sport, from its own rules. */
export function soccerFamilyPlaybook(sport: SoccerSport, rules: SoccerFamilyRules): SportPlaybook {
  const strategy = strategyDefs(rules);
  const age = (ageGroup: string) => soccerFamilyAgeGroup(sport, ageGroup);
  const recommended = (policy: EffectivePolicy): string => {
    const keeper = age(policy.ageGroup).keeper;
    return keeper === "none" ? strategy.minutes.id : keeper === "keepers" ? strategy.keepers.id : strategy.turns.id;
  };
  return {
    sport,
    unitWord: "line",
    // Rolling subs: "nobody sits out twice" counts stints.
    benchPeriodWord: () => "stint",

    // The engine acts on no catalogue rule yet; none is offered until it
    // does (it would do nothing).
    engineRuleKinds: [],
    ruleKinds(): RuleKind[] {
      return [];
    },

    lawRules(policy: EffectivePolicy, _agePolicy: AgePolicy, team?: LawRulesTeam): LockedRule[] {
      return rules.ruleSource.laws
        .filter((law) => !law.ages || law.ages.includes(policy.ageGroup))
        // "No scores are kept" isn't this team's rule once it keeps score.
        .filter((law) => !(law.noScoreboard && team?.trackScoring))
        .map(({ id, text, source }) => ({ id, text, source }));
    },

    agePolicy(ageGroup: string): AgePolicy {
      const cfg = age(ageGroup);
      return {
        zonesEnforced: { default: false, overridable: false },
        // Equal time is the target; the floor is a warning the coach can move.
        minGameTimePct: {
          default: 50,
          overridable: true,
          band: [0, 100],
          locked: false,
          source: rules.ruleSource.equalTime,
        },
        tracksScoreDefault: cfg.tracksScoreDefault,
      };
    },

    positionModel(policy: EffectivePolicy): PositionModel {
      const ag = age(policy.ageGroup);
      const withKeeper = ag.keeper !== "none";
      return {
        kind: "none",
        lines: [...(withKeeper ? [keeperLine(rules)] : []), ...outfieldLines(rules, ag)],
        defaults: [],
        canRename: false,
        canAddRemove: false,
      };
    },

    strategies(policy: EffectivePolicy): StrategyDef[] {
      return age(policy.ageGroup).keeper === "none" ? [strategy.minutes] : [strategy.turns, strategy.keepers];
    },

    recommendedStrategy: recommended,

    // The engine's own default for the age: what a team with no saved
    // choice already plays.
    fallbackStrategy: recommended,
  };
}

export const soccerPlaybook = soccerFamilyPlaybook("soccer", SOCCER_RULES);
