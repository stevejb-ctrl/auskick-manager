// ─── Touch family — How we play ──────────────────────────────
// Touch football and Oztag share How we play's shape, as rugby league
// and union share rugbyPlaybook: one factory, each sport's own laws and
// words (sports are independent, 14 Oct 2026). The strategy is how kids
// rotate (.planning/FOUR-SPORTS-PLAN.md):
//
//   Minutes only      no positions; Siren evens out minutes.
//   Rotate positions  every kid takes turns at middle, link and wing,
//                     evened out over the season (TFA's junior
//                     framework, from age 10).
//   Home position     a kid's lane, with time in the others too.
//
// A kid's role is a lane: a home lane (Home position), the lanes they
// play ("Plays as"), and "Plays every minute". Who counts as a girl or a
// boy is the squad's, not a role: it's asked only on mixed teams.

import type { TouchSport } from "@/lib/sports/registry";
import { touchAgeGroup } from "@/lib/sports/touch/family";
import type { TouchPrefs } from "@/lib/sports/touch/suggest";
import { TOUCH_LANES, TOUCH_STRATEGIES, type TouchLine, type TouchStrategy } from "@/lib/sports/touch/types";
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

/** The lanes, centre out: middles take AFL's centre colour, links its back, wings its forward. */
export const TOUCH_PLAYBOOK_LINES: LineDef[] = [
  { id: "middle", label: "Middles", colorToken: "zone-c" },
  { id: "link", label: "Links", colorToken: "zone-b" },
  { id: "wing", label: "Wings", colorToken: "zone-f" },
];

/** What a sport says about its own rules and ages. */
export interface TouchPlaybookRules {
  /** The body whose rules the laws quote ("TFA 8th Edition rules"). */
  ruleSource: string;
  /** Where the equal-time floor comes from. */
  equalTimeSource: string;
  /** The sport's own laws, shown locked. */
  laws: (ageGroup: string) => LockedRule[];
  /** "Typical fit" lines for each strategy. */
  fit: Record<TouchStrategy, string>;
}

const strategyDefs = (fit: Record<TouchStrategy, string>): Record<TouchStrategy, StrategyDef> => ({
  minutes: {
    id: "minutes",
    label: "Minutes only",
    blurb: "No positions: kids just play, and Siren evens out their minutes.",
    fit: fit.minutes,
    usesPositions: false,
    rolePlaysAs: false,
    balanceUnit: null,
    balanceByDefault: false,
  },
  "rotate-positions": {
    id: "rotate-positions",
    label: "Rotate positions",
    blurb: "Every kid takes turns at middle, link and wing, evened out over the season.",
    fit: fit["rotate-positions"],
    usesPositions: false,
    balanceUnit: "line",
    balanceByDefault: true,
  },
  "home-position": {
    id: "home-position",
    label: "Home position",
    blurb: "Each kid has a home lane, with time in the others too. Subs come on into their home lane when they can.",
    fit: fit["home-position"],
    usesPositions: false,
    roleHome: "line",
    balanceUnit: "line",
    balanceByDefault: true,
  },
});

/** A saved strategy id as the touch family's own; anything else is the age's ★. */
export function touchStrategy(sport: TouchSport, ageGroup: string, strategyId: string | null | undefined): TouchStrategy {
  if (strategyId && (TOUCH_STRATEGIES as readonly string[]).includes(strategyId)) return strategyId as TouchStrategy;
  return touchAgeGroup(sport, ageGroup).suggestedStrategy;
}

type PrefLike = Pick<PlayerPositionPrefRow, "player_id" | "position_key" | "line" | "kind" | "rank">;

const isLane = (v: unknown): v is TouchLine => typeof v === "string" && (TOUCH_LANES as readonly string[]).includes(v);

/**
 * The suggesters' roles from How we play's role sheet: a home lane
 * (Home position), the lanes a kid's "Plays as" leaves out, and who
 * plays every minute.
 */
export function touchPrefs(prefs: readonly PrefLike[]): TouchPrefs {
  const homeLane: Record<string, TouchLine> = {};
  const neverLane: Record<string, TouchLine[]> = {};
  const keepOn: string[] = [];
  for (const p of [...prefs].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))) {
    if (p.kind === "keep_on") {
      keepOn.push(p.player_id);
      continue;
    }
    if (p.position_key || !isLane(p.line)) continue;
    if (p.kind === "home") homeLane[p.player_id] = p.line;
    else if (p.kind === "never") (neverLane[p.player_id] ??= []).push(p.line);
  }
  return { homeLane, neverLane, keepOn };
}

/** How we play, as the touch suggesters read it. */
export interface TouchHowWePlay {
  strategy: TouchStrategy;
  prefs: TouchPrefs;
  /** Season balance strength ("off" switches it off). */
  balance: SeasonBalanceSetting;
  /** Only games after this count towards season balance. */
  since: string | null;
}

/**
 * A team's How we play for the touch suggesters. A game already under
 * way plays the strategy and season balance it started with (its
 * snapshot), as the other sports' do; roles are read as they are now.
 */
export function touchHowWePlay(
  sport: TouchSport,
  loaded: { resolved: Pick<ResolvedPlaybook, "strategy" | "seasonBalance" | "seasonBalanceSince">; prefs: readonly PrefLike[] },
  ageGroup: string,
  snapshot?: Pick<PlaybookSnapshot, "strategy" | "seasonBalance" | "seasonBalanceSince"> | null,
): TouchHowWePlay {
  return {
    strategy: touchStrategy(sport, ageGroup, snapshot?.strategy ?? loaded.resolved.strategy.id),
    prefs: touchPrefs(loaded.prefs),
    balance: snapshot?.seasonBalance ?? loaded.resolved.seasonBalance,
    since: snapshot ? snapshot.seasonBalanceSince : loaded.resolved.seasonBalanceSince,
  };
}

/** How we play for one touch-family sport. */
export function touchFamilyPlaybook(sport: TouchSport, rules: TouchPlaybookRules): SportPlaybook {
  const defs = strategyDefs(rules.fit);
  const playbook: SportPlaybook = {
    sport,
    unitWord: "lane",
    // Rolling subs: "nobody sits out twice" counts stints.
    benchPeriodWord: () => "stint",

    // The touch engine acts on no catalogue rule yet: its strategies
    // carry the home lane, and the mixed rule is the team's. None is
    // offered until it does (it would do nothing).
    engineRuleKinds: [],
    ruleKinds(): RuleKind[] {
      return [];
    },

    lawRules(policy: EffectivePolicy): LockedRule[] {
      return rules.laws(policy.ageGroup);
    },

    agePolicy(ageGroup: string): AgePolicy {
      const cfg = touchAgeGroup(sport, ageGroup);
      return {
        zonesEnforced: { default: false, overridable: false },
        // Equal time is the target; the floor is a warning the coach can move.
        minGameTimePct: { default: 50, overridable: true, band: [0, 100], locked: false, source: rules.equalTimeSource },
        tracksScoreDefault: cfg.tracksScoreDefault,
      };
    },

    positionModel(): PositionModel {
      return { kind: "none", lines: TOUCH_PLAYBOOK_LINES, defaults: [], canRename: false, canAddRemove: false };
    },

    strategies(): StrategyDef[] {
      return TOUCH_STRATEGIES.map((s) => defs[s]);
    },

    recommendedStrategy(policy: EffectivePolicy): string {
      return touchAgeGroup(sport, policy.ageGroup).suggestedStrategy;
    },

    fallbackStrategy(policy: EffectivePolicy): string {
      // The age's ★: what a team with no saved choice plays.
      return playbook.recommendedStrategy(policy);
    },
  };
  return playbook;
}
