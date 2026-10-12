// Rugby league engine adapter for How we play (UX plan 5.6).
//
// Who starts is still the league's own fairness ranking (unbroken-period
// shortfall, playtime ratio). How we play decides the LINE each starter
// plays — from their role and season balance instead of chip a/b — and
// how the FR / DH vests are chosen. No playbook input = today's chips.

import type { ResolvedPlaybook } from "@/lib/playbook/team";
import type { PlayerPositionPrefRow } from "@/lib/playbook/types";
import type { RuleInstance } from "@/lib/playbook/rules";
import { rolesFromPrefs } from "@/lib/playbook/roles";
import { periodsOwed, seasonBalanceWeight } from "@/lib/playbook/seasonBalance";
import type { UnitTime } from "@/lib/playbook/seasonTime";
import type { GameEvent } from "@/lib/types";

export type LeagueLine = "forwards" | "backs";
export type VestStrategy = "auto" | "fixed-order" | "coach";

export interface LeagueRole {
  home: LeagueLine | null;
  also: string[];
  never: string[];
  keepOn: boolean;
}

export interface LeaguePlaybookInput {
  /** both-lines · preferred-line · named-positions */
  strategy: string;
  seasonWeight: number;
  /** ms per player per line this season (since a reset). */
  season?: UnitTime;
  periodMs: number;
  roles: Record<string, LeagueRole>;
  rules?: RuleInstance[];
  vestStrategy: VestStrategy;
  minGameTimePct?: number;
}

/** Preferred line aims for this share of a kid's time. */
const PREFERRED_SHARE = 0.6;
/** Home-line pull for Preferred line (same scale as AFL's). */
const HOME_WEIGHT = 600;

export function leaguePlaybookInput(
  resolved: ResolvedPlaybook,
  prefs: Pick<PlayerPositionPrefRow, "player_id" | "position_key" | "line" | "kind" | "rank">[],
  rules: RuleInstance[],
  season: UnitTime | undefined,
  periodMs: number,
  vestStrategy: VestStrategy = "auto",
): LeaguePlaybookInput {
  const roles: Record<string, LeagueRole> = {};
  for (const [pid, r] of Object.entries(rolesFromPrefs(prefs, "line"))) {
    roles[pid] = {
      home: r.home === "forwards" || r.home === "backs" ? r.home : null,
      also: r.also,
      never: r.never,
      keepOn: r.keepOn,
    };
  }
  return {
    strategy: resolved.strategy.id,
    seasonWeight: seasonBalanceWeight("rugby_league", resolved.seasonBalance === "off" ? null : resolved.seasonBalance),
    season,
    periodMs,
    roles,
    rules,
    vestStrategy,
    minGameTimePct: resolved.policy.minGameTimePct,
  };
}

/** How much a player wants each line; never-plays is -Infinity. */
export function leagueLineScores(input: LeaguePlaybookInput, pid: string): Record<LeagueLine, number> {
  const role = input.roles[pid];
  const lines: LeagueLine[] = ["forwards", "backs"];
  const allowed = lines.filter((l) => !role?.never.includes(l));
  const homeOn = input.strategy === "preferred-line" && role?.home && allowed.includes(role.home);
  const owed =
    input.seasonWeight > 0 && input.season && allowed.length > 1
      ? periodsOwed({
          byUnit: input.season[pid],
          units: allowed,
          periodMs: input.periodMs,
          target: homeOn
            ? Object.fromEntries(allowed.map((l) => [l, l === role!.home ? PREFERRED_SHARE : 1 - PREFERRED_SHARE]))
            : undefined,
        })
      : {};
  const score = (l: LeagueLine) => {
    if (!allowed.includes(l)) return -Infinity;
    return (homeOn && role!.home === l ? HOME_WEIGHT : 0) + input.seasonWeight * (owed[l] ?? 0);
  };
  return { forwards: score("forwards"), backs: score("backs") };
}

/**
 * Starters into forwards / backs by how strongly each wants a line:
 * kids who can only play one line first, then the strongest preference,
 * filling to each line's size.
 */
export function assignLeagueLines(
  starters: string[],
  targetForwards: number,
  targetBacks: number,
  input: LeaguePlaybookInput,
): { forwards: string[]; backs: string[] } {
  const scored = starters.map((pid, i) => {
    const s = leagueLineScores(input, pid);
    const onlyOne = !Number.isFinite(s.forwards) || !Number.isFinite(s.backs);
    const pull = Number.isFinite(s.forwards) && Number.isFinite(s.backs) ? Math.abs(s.forwards - s.backs) : Infinity;
    return { pid, s, onlyOne, pull, i };
  });
  scored.sort((a, b) => Number(b.onlyOne) - Number(a.onlyOne) || b.pull - a.pull || a.i - b.i);
  const forwards: string[] = [];
  const backs: string[] = [];
  for (const { pid, s } of scored) {
    const wantsForward = s.forwards >= s.backs;
    if (wantsForward && forwards.length < targetForwards) forwards.push(pid);
    else if (!wantsForward && backs.length < targetBacks) backs.push(pid);
    else if (forwards.length < targetForwards) forwards.push(pid);
    else backs.push(pid);
  }
  return { forwards, backs };
}

/** The latest wearer of a vest across these events (for fixed order). */
export function lastVestWearer(events: GameEvent[], vest: "fr" | "dh"): string | null {
  let latest: GameEvent | null = null;
  for (const e of events) {
    if (e.type !== "vest_assigned" || !e.player_id) continue;
    if ((e.metadata as { vest?: string }).vest !== vest) continue;
    if (!latest || e.created_at > latest.created_at) latest = e;
  }
  return latest?.player_id ?? null;
}

/**
 * Fixed order: the vest goes round the squad in jersey order — the next
 * on-field kid after whoever wore it last.
 */
export function nextInOrder(
  onField: string[],
  squadOrder: string[],
  last: string | null,
  exclude: string | null = null,
): string | null {
  const order = squadOrder.filter((id) => onField.includes(id) && id !== exclude);
  if (order.length === 0) return null;
  if (!last) return order[0];
  const lastIdx = squadOrder.indexOf(last);
  return order.find((id) => squadOrder.indexOf(id) > lastIdx) ?? order[0];
}
