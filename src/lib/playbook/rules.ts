// How we play › Rules (UX plan §7.4, chunk 4.1). A rule reads like a
// sentence ("Nobody sits on the bench 2 stints in a row") with a few
// editable values, and a strength: Must (the engine never breaks it)
// or Prefer (a weight). Rules are stored in team_playbooks.rules.
//
// Some rules come from the age policy or other settings and are shown
// locked, with their source, never hidden: the game-time floor, season
// balance, zone rotation at zoned AFL ages, league unbroken periods
// and vests.

import type { ResolvedPlaybook } from "@/lib/playbook/team";
import type { BalanceUnit, LockedRule } from "@/lib/playbook/types";
import { getSportPlaybook } from "@/lib/playbook/index";
import type { Sport } from "@/lib/types";

export type RuleStrength = "must" | "prefer";

export type RuleKind =
  | "every-line-per-game"
  // Carnival days (several games in a day): every line across the day.
  | "every-line-per-day"
  | "distinct-lines"
  | "stays-home"
  | "keep-apart"
  | "keep-together"
  | "max-bench-in-row"
  | "like-for-like"
  | "subs-at-breaks";

export interface RuleInstance {
  id: string;
  kind: RuleKind;
  params: RuleParams;
  strength: RuleStrength;
  enabled: boolean;
  /** "pack:<id>" when a local rule pack added it. */
  source?: string;
}

export interface RuleParams {
  /** distinct-lines: how many; max-bench-in-row: how many in a row. */
  count?: number;
  /** stays-home / keep-apart / keep-together. */
  playerIds?: string[];
}

export interface RuleDef {
  kind: RuleKind;
  /** Short name for the "Add a rule" list. */
  title: string;
  defaultParams: RuleParams;
  defaultStrength: RuleStrength;
  /** Several of this rule can exist (one per group of players). */
  repeatable: boolean;
  /** Players are part of the rule (picked in the editor). */
  needsPlayers: boolean;
  /** count bounds, when the rule has a number. */
  countRange?: [number, number];
}

const DEFS: Record<RuleKind, RuleDef> = {
  "every-line-per-game": {
    kind: "every-line-per-game",
    title: "Everyone plays every line each game",
    defaultParams: {},
    defaultStrength: "prefer",
    repeatable: false,
    needsPlayers: false,
  },
  "every-line-per-day": {
    kind: "every-line-per-day",
    title: "Everyone plays every line across the day",
    defaultParams: {},
    defaultStrength: "prefer",
    repeatable: false,
    needsPlayers: false,
  },
  "distinct-lines": {
    kind: "distinct-lines",
    title: "Everyone plays a few different lines",
    defaultParams: { count: 2 },
    defaultStrength: "prefer",
    repeatable: false,
    needsPlayers: false,
    countRange: [2, 3],
  },
  "stays-home": {
    kind: "stays-home",
    title: "A player stays at home all game",
    defaultParams: { playerIds: [] },
    defaultStrength: "must",
    repeatable: false,
    needsPlayers: true,
  },
  "keep-apart": {
    kind: "keep-apart",
    title: "Keep players apart",
    defaultParams: { playerIds: [] },
    defaultStrength: "prefer",
    repeatable: true,
    needsPlayers: true,
  },
  "keep-together": {
    kind: "keep-together",
    title: "Keep players together",
    defaultParams: { playerIds: [] },
    defaultStrength: "prefer",
    repeatable: true,
    needsPlayers: true,
  },
  "max-bench-in-row": {
    kind: "max-bench-in-row",
    title: "Nobody sits out twice in a row",
    defaultParams: { count: 2 },
    defaultStrength: "must",
    repeatable: false,
    needsPlayers: false,
    countRange: [2, 3],
  },
  "like-for-like": {
    kind: "like-for-like",
    title: "Bench swaps are like-for-like",
    defaultParams: {},
    defaultStrength: "prefer",
    repeatable: false,
    needsPlayers: false,
  },
  "subs-at-breaks": {
    kind: "subs-at-breaks",
    title: "Subs only at the breaks",
    defaultParams: {},
    defaultStrength: "must",
    repeatable: false,
    needsPlayers: false,
  },
};

export function ruleDef(kind: RuleKind): RuleDef {
  return DEFS[kind];
}

/** Words the sentences use for this team's units and periods. */
export interface RuleWords {
  line: string;
  lines: string;
  period: string;
  periods: string;
  home: string;
}

/** The team's own sport's words — never another sport's. */
export function ruleWords(sport: Sport, periodWord: string, usesPositions: boolean): RuleWords {
  const playbook = getSportPlaybook(sport);
  const line = playbook.unitWord;
  const period = playbook.benchPeriodWord(periodWord);
  return {
    line,
    lines: `${line}s`,
    period,
    periods: `${period}s`,
    home: usesPositions ? "home position" : `home ${line}`,
  };
}

/** A catalogue title in this team's words ("every third" for netball). */
export function ruleTitle(def: RuleDef, words: RuleWords): string {
  return def.title.replace(/\blines\b/g, words.lines).replace(/\bline\b/g, words.line);
}

/**
 * Which catalogue rules this team can add: only those its own sport's
 * engine acts on (each sport's playbook lists them), so a coach is never
 * offered a rule that does nothing for their sport.
 */
export function ruleCatalogue(resolved: Pick<ResolvedPlaybook, "sport" | "strategy" | "policy">): RuleDef[] {
  return getSportPlaybook(resolved.sport).ruleKinds(resolved.strategy, resolved.policy).map(ruleDef);
}

/** The team's rules, keeping only kinds its sport offers (saved data from before, or another sport, is dropped). */
export function rulesForSport(
  rules: RuleInstance[],
  resolved: Pick<ResolvedPlaybook, "sport" | "strategy" | "policy">,
): RuleInstance[] {
  const allowed = new Set(getSportPlaybook(resolved.sport).ruleKinds(resolved.strategy, resolved.policy));
  return rules.filter((r) => allowed.has(r.kind));
}

/** The rule as the coach reads it. Player names are filled in by the caller. */
export function ruleSentence(rule: RuleInstance, words: RuleWords, names: (ids: string[]) => string): string {
  const p = rule.params;
  switch (rule.kind) {
    case "every-line-per-game":
      return `Every player plays each ${words.line} at least once per game`;
    case "every-line-per-day":
      return `Every player plays each ${words.line} across the day's games`;
    case "distinct-lines":
      return `Every player plays at least ${p.count ?? 2} different ${words.lines} per game`;
    case "stays-home":
      return `${names(p.playerIds ?? []) || "Pick players who"} stay${(p.playerIds?.length ?? 0) === 1 ? "s" : ""} at their ${words.home} all game`;
    case "keep-apart":
      return `Keep ${names(p.playerIds ?? []) || "these players"} apart`;
    case "keep-together":
      return `Keep ${names(p.playerIds ?? []) || "these players"} together`;
    case "max-bench-in-row":
      return `Nobody sits on the bench ${p.count ?? 2} ${words.periods} in a row`;
    case "like-for-like":
      return `Bench swaps are like-for-like`;
    case "subs-at-breaks":
      return `Subs happen at the breaks only`;
  }
}

const UNIT_WORD: Record<BalanceUnit, string> = {
  zone: "zone",
  line: "line",
  third: "third",
  bib: "position",
  position: "position",
};

export type { LockedRule } from "@/lib/playbook/types";

/**
 * The rules a coach sees locked: the game-time floor, season balance,
 * and the team's own sport's laws, each with its own source.
 */
export function lockedRules(resolved: ResolvedPlaybook): LockedRule[] {
  const out: LockedRule[] = [];
  const { policy } = resolved;
  const playbook = getSportPlaybook(resolved.sport);
  const agePolicy = playbook.agePolicy(policy.ageGroup);
  out.push({
    id: "min-game-time",
    text: `Everyone plays at least ${policy.minGameTimePct}% of the game`,
    source: policy.overridden.includes("minGameTimePct")
      ? "Your league"
      : agePolicy.minGameTimePct.source ?? "Siren default",
  });
  // The sport's own laws (AFL zones; league unbroken periods and vests).
  out.push(...playbook.lawRules(policy, agePolicy));
  if (resolved.seasonBalance !== "off" && resolved.strategy.balanceUnit) {
    const label = resolved.seasonBalance.charAt(0).toUpperCase() + resolved.seasonBalance.slice(1);
    out.push({
      id: "season-balance",
      text: `Even out each player's time in each ${UNIT_WORD[resolved.strategy.balanceUnit]} across the season (${label})`,
      source: "Season balance",
    });
  }
  return out;
}

let counter = 0;
/** A fresh rule from the catalogue. */
export function newRule(kind: RuleKind, source?: string): RuleInstance {
  const def = ruleDef(kind);
  counter += 1;
  return {
    id: `${kind}-${Date.now().toString(36)}-${counter}`,
    kind,
    params: JSON.parse(JSON.stringify(def.defaultParams)),
    strength: def.defaultStrength,
    enabled: true,
    ...(source ? { source } : {}),
  };
}

/**
 * Stored rules, cleaned: unknown kinds dropped, counts clamped, player
 * lists limited to the squad, one of each non-repeatable kind.
 */
export function sanitizeRules(raw: unknown, squadIds: string[] | null): RuleInstance[] {
  if (!Array.isArray(raw)) return [];
  const squad = squadIds ? new Set(squadIds) : null;
  const seen = new Set<RuleKind>();
  const out: RuleInstance[] = [];
  for (const r of raw as Partial<RuleInstance>[]) {
    if (!r || typeof r !== "object" || !r.kind || !(r.kind in DEFS)) continue;
    const def = DEFS[r.kind];
    if (!def.repeatable && seen.has(r.kind)) continue;
    seen.add(r.kind);
    const params: RuleParams = {};
    if (def.countRange) {
      const [lo, hi] = def.countRange;
      const n = Number(r.params?.count ?? def.defaultParams.count);
      params.count = Math.min(hi, Math.max(lo, Number.isFinite(n) ? Math.round(n) : lo));
    }
    if (def.needsPlayers) {
      const ids = Array.isArray(r.params?.playerIds) ? r.params!.playerIds!.filter((x) => typeof x === "string") : [];
      params.playerIds = Array.from(new Set(squad ? ids.filter((id) => squad.has(id)) : ids));
    }
    out.push({
      id: typeof r.id === "string" && r.id ? r.id : newRule(r.kind).id,
      kind: r.kind,
      params,
      strength: r.strength === "must" ? "must" : "prefer",
      enabled: r.enabled !== false,
      ...(typeof r.source === "string" ? { source: r.source } : {}),
    });
  }
  return out;
}

/** Rules that are on and complete enough to act on. */
export function activeRules(rules: RuleInstance[]): RuleInstance[] {
  return rules.filter((r) => {
    if (!r.enabled) return false;
    const def = DEFS[r.kind];
    if (!def.needsPlayers) return true;
    const n = r.params.playerIds?.length ?? 0;
    return r.kind === "stays-home" ? n >= 1 : n >= 2;
  });
}
