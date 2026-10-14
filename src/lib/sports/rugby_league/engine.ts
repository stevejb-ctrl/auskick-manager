// Rugby league engine adapter for How we play (UX plan 5.6).
//
// Who starts is still the league's own fairness ranking (unbroken-period
// shortfall, playtime ratio). How we play decides the LINE each starter
// plays — from their role and season balance instead of chip a/b — and
// how the FR / DH vests are chosen. No playbook input = today's chips.

import type { ResolvedPlaybook } from "@/lib/playbook/team";
import type { PlayerPositionPrefRow } from "@/lib/playbook/types";
import type { RuleInstance } from "@/lib/playbook/rules";
import { roleModelFor, rolesFromPrefs } from "@/lib/playbook/roles";
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
  /** Named positions (5.7): the catalogue in force and each kid's home / also. */
  positions?: { key: string; label: string; line: LeagueLine }[];
  positionRoles?: Record<string, { home: string | null; also: string[]; never: string[] }>;
  /** ms per player per named position this season (since a reset), from recorded slots. */
  seasonPositions?: UnitTime;
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
  seasonPositions?: UnitTime,
): LeaguePlaybookInput {
  const roles: Record<string, LeagueRole> = {};
  const model = roleModelFor(resolved);
  let positions: LeaguePlaybookInput["positions"];
  let positionRoles: LeaguePlaybookInput["positionRoles"];
  if (model?.unit === "position") {
    // Named positions: a kid's home position decides their line.
    positions = resolved.positions.map((p) => ({ key: p.key, label: p.label, line: p.line as LeagueLine }));
    const lineOf = new Map(positions.map((p) => [p.key, p.line]));
    positionRoles = {};
    for (const [pid, r] of Object.entries(rolesFromPrefs(prefs, "position"))) {
      positionRoles[pid] = { home: r.home, also: r.also, never: r.never };
      const home = r.home ? (lineOf.get(r.home) ?? null) : null;
      const never = (["forwards", "backs"] as LeagueLine[]).filter((line) => {
        const keys = positions!.filter((p) => p.line === line).map((p) => p.key);
        return keys.length > 0 && keys.every((k) => r.never.includes(k));
      });
      roles[pid] = { home, also: [], never, keepOn: r.keepOn };
    }
  } else {
    for (const [pid, r] of Object.entries(rolesFromPrefs(prefs, "line"))) {
      roles[pid] = {
        home: r.home === "forwards" || r.home === "backs" ? r.home : null,
        also: r.also,
        never: r.never,
        keepOn: r.keepOn,
      };
    }
  }
  return {
    positions,
    positionRoles,
    seasonPositions: positions ? seasonPositions : undefined,
    strategy: resolved.strategy.id,
    seasonWeight: seasonBalanceWeight(resolved.sport, resolved.seasonBalance === "off" ? null : resolved.seasonBalance),
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
  // Named positions lean to the home position's line like Preferred line.
  const homeOn =
    (input.strategy === "preferred-line" || input.strategy === "named-positions") &&
    role?.home &&
    allowed.includes(role.home);
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
    const homeWeight = input.strategy === "named-positions" ? 3000 : HOME_WEIGHT;
    return (homeOn && role!.home === l ? homeWeight : 0) + input.seasonWeight * (owed[l] ?? 0);
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

/**
 * Named positions (UX plan 5.7, Mod League): who wears which catalogue
 * position within each line — home first, then also-plays, then the
 * line's positions in formation order. playerId → label for the tiles.
 */
export function assignLeaguePositions(
  lineup: { forwards: string[]; backs: string[] },
  input: LeaguePlaybookInput | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input?.positions || input.positions.length === 0) return out;
  const roles = input.positionRoles ?? {};
  // Season balance (5.7): among the spots a kid can take, the one
  // they've played least this season. Off = catalogue order.
  const season = input.seasonWeight > 0 ? input.seasonPositions : undefined;
  const msAt = (pid: string, key: string) => season?.[pid]?.[key] ?? 0;
  for (const line of ["forwards", "backs"] as const) {
    const players = lineup[line];
    const free = input.positions.filter((p) => p.line === line);
    const taken = new Set<string>();
    const place = (pid: string, key: string) => {
      if (out[pid] || taken.has(key) || !free.some((p) => p.key === key)) return false;
      out[pid] = key;
      taken.add(key);
      return true;
    };
    for (const pid of players) {
      const home = roles[pid]?.home;
      if (home) place(pid, home);
    }
    for (const pid of players) {
      if (out[pid]) continue;
      const also = [...(roles[pid]?.also ?? [])].sort((a, b) => msAt(pid, a) - msAt(pid, b));
      for (const k of also) if (place(pid, k)) break;
    }
    // Everyone else fills the free spots, least-played pairing first.
    const open = players.filter((pid) => !out[pid]);
    const pairs: { pid: string; key: string; ms: number; i: number; j: number }[] = [];
    open.forEach((pid, i) =>
      free.forEach((p, j) => {
        if (!(roles[pid]?.never ?? []).includes(p.key)) pairs.push({ pid, key: p.key, ms: msAt(pid, p.key), i, j });
      }),
    );
    pairs.sort((a, b) => a.ms - b.ms || a.i - b.i || a.j - b.j);
    for (const c of pairs) place(c.pid, c.key);
    for (const pid of open) {
      const pos = free.find((p) => !taken.has(p.key));
      if (!out[pid] && pos) place(pid, pos.key);
    }
  }
  return out;
}

/**
 * Named positions (5.7): each on-field kid's position label, for tiles.
 * Home first, then also-plays, then the free spots; with season
 * balance on, the also and free passes pick the least-played spot.
 */
export function assignLeaguePositionLabels(
  lineup: { forwards: string[]; backs: string[] },
  input: LeaguePlaybookInput | null | undefined,
): Record<string, string> {
  const labelOf = new Map((input?.positions ?? []).map((p) => [p.key, p.label]));
  const out: Record<string, string> = {};
  for (const [pid, key] of Object.entries(assignLeaguePositions(lineup, input))) out[pid] = labelOf.get(key) ?? key;
  return out;
}

/** The lineup to record, with its named-position slots when positions are in force. */
export function withLeagueSlots<T extends { forwards: string[]; backs: string[] }>(
  lineup: T,
  input: LeaguePlaybookInput | null | undefined,
): T & { slots?: Record<string, string> } {
  const slots = assignLeaguePositions(lineup, input);
  return Object.keys(slots).length > 0 ? { ...lineup, slots } : lineup;
}
