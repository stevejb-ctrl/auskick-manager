// ─── Basketball — How we play ────────────────────────────────
// Basketball's own How we play (sports are independent, 14 Oct 2026).
// Positions are optional, as in netball (.planning/BASKETBALL-PLAN.md,
// "Positions and rotations"). The strategy is how kids rotate:
//
//   Equal minutes        no positions; Siren evens out minutes. A kid
//                        whose home is Guards is a ball handler, and one
//                        stays on court.
//   Guards and forwards  every kid plays both lines, evened out over the
//                        season.
//   Home line            each kid is a guard or a forward, with time on
//                        the other line too; subs go guard for guard.
//   All five positions   1 to 5, the most different positions per kid.
//   Set positions        a home position plus backups; like-for-like.
//
// The five positions keep basketball's standard labels and aren't
// renamed, as netball's bibs aren't. The laws shown are the junior
// modifications most associations play: no zone to U14, no 3-pointers
// at U8–U10, five fouls and out.

import { BASKETBALL_POSITION_DEFS, basketballAgeGroup } from "@/lib/sports/basketball";
import type { BasketballPrefs } from "@/lib/sports/basketball/suggest";
import { BASKETBALL_STRATEGIES, type BasketballPosition, type BasketballStrategy } from "@/lib/sports/basketball/types";
import type {
  AgePolicy,
  EffectivePolicy,
  LineDef,
  LockedRule,
  PlaybookSnapshot,
  PlayerPositionPrefRow,
  PositionDef,
  PositionModel,
  SeasonBalanceSetting,
  SportPlaybook,
  StrategyDef,
} from "@/lib/playbook/types";
import type { RuleKind } from "@/lib/playbook/rules";
import type { ResolvedPlaybook } from "@/lib/playbook/team";

const BA_NO_ZONE = "Basketball Australia: no zone defence for U14 and younger";
const JUNIOR_BYLAWS = "Junior domestic by-laws (e.g. Basketball ACT)";
const FIBA = "FIBA Official Basketball Rules";
const EQUAL_TIME = "Club policy: equal time is the target";

export const BASKETBALL_PLAYBOOK_LINES: LineDef[] = [
  { id: "guard", label: "Guards", colorToken: "zone-c" },
  { id: "forward", label: "Forwards", colorToken: "zone-f" },
];

// Half court, attacking up the page: 1 at the top of the key, 2 and 3 on
// the wings, 4 and 5 on the blocks (the live court draws the same).
const COURT_XY: Record<BasketballPosition, [number, number]> = {
  pg: [0.5, 0.82],
  sg: [0.2, 0.6],
  sf: [0.8, 0.6],
  pf: [0.3, 0.28],
  c: [0.7, 0.28],
};

export function basketballPositionDefs(): PositionDef[] {
  return BASKETBALL_POSITION_DEFS.map((p) => {
    const [x, y] = COURT_XY[p.key];
    return { key: p.key, label: p.label, name: `${p.number} · ${p.name}`, line: p.line, x, y };
  });
}

const MINUTES: StrategyDef = {
  id: "minutes",
  label: "Equal minutes",
  blurb: "Five on court, no positions: kids just play, and Siren evens out their minutes. Mark your ball handlers (home: Guards) and one stays on.",
  fit: "Under 8 and Under 10",
  usesPositions: false,
  roleHome: "line",
  rolePlaysAs: false,
  balanceUnit: null,
  balanceByDefault: false,
};

const BOTH_LINES: StrategyDef = {
  id: "both-lines",
  label: "Guards and forwards",
  blurb: "Every kid plays guard and forward across the game and the season; which spot within a line is up to them.",
  fit: "Under 12 and Under 14",
  usesPositions: false,
  balanceUnit: "line",
  balanceByDefault: true,
};

const HOME_LINE: StrategyDef = {
  id: "preferred-line",
  label: "Home line",
  blurb: "Each kid is a guard or a forward, with time on the other line too. Subs go guard for guard.",
  fit: "Under 16 and up",
  usesPositions: false,
  roleHome: "line",
  balanceUnit: "line",
  balanceByDefault: true,
};

const ALL_FIVE: StrategyDef = {
  id: "position-by-position",
  label: "All five positions",
  blurb: "Every spot, 1 to 5, filled on its own, aiming for the most different positions per kid.",
  fit: "Coaches who want every kid to play 1 to 5",
  usesPositions: false,
  rolePositions: true,
  balanceUnit: "position",
  balanceByDefault: true,
};

const SET_POSITIONS: StrategyDef = {
  id: "set-positions",
  label: "Set positions",
  blurb: "A home position plus backups; the bench rotates like-for-like.",
  fit: "Older teams that specialise",
  usesPositions: true,
  balanceUnit: "position",
  balanceByDefault: false,
};

const STRATEGIES: StrategyDef[] = [MINUTES, BOTH_LINES, HOME_LINE, ALL_FIVE, SET_POSITIONS];

/** A saved strategy id as basketball's own; anything else is the age's ★. */
export function basketballStrategy(ageGroup: string, strategyId: string | null | undefined): BasketballStrategy {
  if (strategyId && (BASKETBALL_STRATEGIES as readonly string[]).includes(strategyId)) return strategyId as BasketballStrategy;
  return basketballAgeGroup(ageGroup).suggestedStrategy;
}

type PrefLike = Pick<PlayerPositionPrefRow, "player_id" | "position_key" | "line" | "kind" | "rank">;

const POSITION_KEYS = new Set<string>(BASKETBALL_POSITION_DEFS.map((p) => p.key));

/**
 * The suggesters' roles from How we play's role sheet: a home line
 * (Home line; under Equal minutes, home Guards marks a ball handler), a
 * home position and backups (Set positions).
 */
export function basketballPrefs(prefs: readonly PrefLike[]): BasketballPrefs {
  const homeLine: Record<string, "guard" | "forward"> = {};
  const homePosition: Record<string, BasketballPosition> = {};
  const alsoPositions: Record<string, BasketballPosition[]> = {};
  for (const p of [...prefs].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))) {
    if (p.position_key && POSITION_KEYS.has(p.position_key)) {
      const pos = p.position_key as BasketballPosition;
      if (p.kind === "home") homePosition[p.player_id] = pos;
      else if (p.kind === "also") (alsoPositions[p.player_id] ??= []).push(pos);
      continue;
    }
    if (p.kind === "home" && (p.line === "guard" || p.line === "forward")) homeLine[p.player_id] = p.line;
  }
  const ballHandlers = Object.entries(homeLine)
    .filter(([, line]) => line === "guard")
    .map(([pid]) => pid);
  return { homeLine, homePosition, alsoPositions, ballHandlers };
}

/** How we play, as the basketball suggesters read it. */
export interface BasketballHowWePlay {
  strategy: BasketballStrategy;
  prefs: BasketballPrefs;
  /** Season balance strength ("off" switches it off). */
  balance: SeasonBalanceSetting;
  /** Only games after this count towards season balance. */
  since: string | null;
}

/**
 * A team's How we play for the basketball suggesters. A game already
 * tipped off plays the strategy and season balance it tipped off with
 * (its snapshot), as the other sports' do; roles are read as they are
 * now.
 */
export function basketballHowWePlay(
  loaded: { resolved: Pick<ResolvedPlaybook, "strategy" | "seasonBalance" | "seasonBalanceSince">; prefs: readonly PrefLike[] },
  ageGroup: string,
  snapshot?: Pick<PlaybookSnapshot, "strategy" | "seasonBalance" | "seasonBalanceSince"> | null,
): BasketballHowWePlay {
  return {
    strategy: basketballStrategy(ageGroup, snapshot?.strategy ?? loaded.resolved.strategy.id),
    prefs: basketballPrefs(loaded.prefs),
    balance: snapshot?.seasonBalance ?? loaded.resolved.seasonBalance,
    since: snapshot ? snapshot.seasonBalanceSince : loaded.resolved.seasonBalanceSince,
  };
}

const NO_ZONE_AGES = new Set(["U8", "U10", "U12", "U14"]);
const NO_THREES_AGES = new Set(["U8", "U10"]);

export const basketballPlaybook: SportPlaybook = {
  sport: "basketball",
  unitWord: "line",
  // Rolling subs: "nobody sits out twice" counts stints.
  benchPeriodWord: () => "stint",

  // The basketball engine acts on no catalogue rule yet: its strategies
  // carry like-for-like and the home line. None is offered until it
  // does (it would do nothing).
  engineRuleKinds: [],
  ruleKinds(): RuleKind[] {
    return [];
  },

  lawRules(policy: EffectivePolicy): LockedRule[] {
    const out: LockedRule[] = [];
    if (NO_ZONE_AGES.has(policy.ageGroup)) {
      out.push({ id: "basketball-no-zone", text: "No zone defence: man-to-man only", source: BA_NO_ZONE });
    }
    if (NO_THREES_AGES.has(policy.ageGroup)) {
      out.push({ id: "basketball-no-threes", text: "No 3-pointers: every basket from play is 2", source: JUNIOR_BYLAWS });
    }
    out.push({ id: "basketball-five-fouls", text: "Five fouls and a player is out for the game", source: FIBA });
    return out;
  },

  agePolicy(ageGroup: string): AgePolicy {
    const cfg = basketballAgeGroup(ageGroup);
    return {
      zonesEnforced: { default: false, overridable: false },
      // Equal time is the target; the floor is a warning the coach can move.
      minGameTimePct: { default: 50, overridable: true, band: [0, 100], locked: false, source: EQUAL_TIME },
      tracksScoreDefault: cfg.tracksScoreDefault,
    };
  },

  positionModel(): PositionModel {
    return {
      kind: "fixed",
      lines: BASKETBALL_PLAYBOOK_LINES,
      defaults: basketballPositionDefs(),
      canRename: false,
      canAddRemove: false,
    };
  },

  strategies(): StrategyDef[] {
    return STRATEGIES;
  },

  recommendedStrategy(policy: EffectivePolicy): string {
    return basketballAgeGroup(policy.ageGroup).suggestedStrategy;
  },

  fallbackStrategy(policy: EffectivePolicy): string {
    // The age's ★: what a team with no saved choice plays.
    return basketballPlaybook.recommendedStrategy(policy);
  },
};
