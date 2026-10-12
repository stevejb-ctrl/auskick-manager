// AFL engine adapter for How we play (UX plan §7.6, chunk 3.6).
//
// The suggesters stay as they are; this turns a team's resolved
// playbook and player roles into the small input they read, and
// assigns named positions within each line for display. No playbook
// input = today's behaviour exactly.

import type { GameEvent, Lineup, Zone } from "@/lib/types";
import type { PlayerZoneMinutes } from "@/lib/fairness";
import type { ResolvedPlaybook } from "@/lib/playbook/team";
import type { PlaybookSnapshot, PlayerPositionPrefRow } from "@/lib/playbook/types";
import { roleModelFor, rolesFromPrefs } from "@/lib/playbook/roles";
import { periodsOwed, seasonBalanceWeight } from "@/lib/playbook/seasonBalance";
import { seasonTimeByUnit } from "@/lib/playbook/seasonTime";
import type { RuleInstance } from "@/lib/playbook/rules";
import { checkRules, whyMove, type RuleCheckItem } from "@/lib/playbook/ruleCheck";
import type { UnitTime } from "@/lib/playbook/seasonTime";

/** A player's role at line level — what the zone engine can act on. */
export interface AflLineRole {
  home: Zone | null;
  also: Zone[];
  never: Zone[];
  keepOn: boolean;
}

export interface AflPlaybookInput {
  /** suggested · rotate · keep · manual (zoned) or free · preferred-lines · set-positions. */
  strategy: string;
  /** Points per period owed this season; 0 = season balance off. */
  seasonWeight: number;
  roles: Record<string, AflLineRole>;
  /** Set positions: the team's positions and each player's home / also. */
  positions?: { key: string; label: string; line: Zone }[];
  positionRoles?: Record<string, { home: string | null; also: string[]; never: string[] }>;
  /** Season since a balance reset, in minutes; omitted = the full season. */
  balanceSeason?: PlayerZoneMinutes;
  /** The team's rules that are on (How we play › Rules). */
  rules?: RuleInstance[];
  /** The game-time floor, for the rule check. */
  minGameTimePct?: number;
}

/** Must = the engine doesn't break it; Prefer = a weight. */
export const RULE_WEIGHT = { must: 20000, prefer: 3000 } as const;
/** A line a kid hasn't played yet, under an every-line rule. */
export const LINE_RULE_WEIGHT = { must: 20000, prefer: 1500 } as const;

/**
 * Rule terms for placing player `pid` in zone `z` (UX plan 4.2): lines
 * still to play, players kept apart or together, kids who stay home.
 * `placed` is who's already been put in each zone this pass.
 */
export function ruleScore(
  rules: RuleInstance[],
  pid: string,
  line: Zone,
  linesPlayed: Set<Zone>,
  lineCount: number,
  placedInZone: Set<string> | undefined,
  homeLine: Zone | null,
): number {
  let score = 0;
  for (const rule of rules) {
    switch (rule.kind) {
      case "every-line-per-game":
      case "distinct-lines": {
        const need = rule.kind === "every-line-per-game" ? lineCount : (rule.params.count ?? 2);
        if (linesPlayed.size < need && !linesPlayed.has(line)) score += LINE_RULE_WEIGHT[rule.strength];
        break;
      }
      case "keep-apart":
      case "keep-together": {
        const ids = rule.params.playerIds ?? [];
        if (!ids.includes(pid) || !placedInZone) break;
        let mates = 0;
        placedInZone.forEach((other) => {
          if (other !== pid && ids.includes(other)) mates++;
        });
        score += (rule.kind === "keep-apart" ? -1 : 1) * mates * RULE_WEIGHT[rule.strength];
        break;
      }
      case "stays-home":
        if ((rule.params.playerIds ?? []).includes(pid) && homeLine === line) score += RULE_WEIGHT[rule.strength];
        break;
      default:
        break;
    }
  }
  return score;
}

export function hasRule(input: AflPlaybookInput | undefined, kind: RuleInstance["kind"]): RuleInstance | undefined {
  return input?.rules?.find((r) => r.kind === kind);
}

/** suggestSwaps also needs the season so rolling subs pay down debt. */
export interface AflSwapPlaybook extends AflPlaybookInput {
  /** Season zone minutes (as the suggesters keep them). */
  season?: PlayerZoneMinutes;
  /** This game's period length, in ms. */
  periodMs?: number;
}

/** Share of a preferred-lines player's time the home line aims for. */
export const PREFERRED_LINE_SHARE = 0.6;

const LINE_OF_ZONE: Record<Zone, Zone> = { back: "back", hback: "back", mid: "mid", hfwd: "fwd", fwd: "fwd" };

/** Strategy weights layered onto the suggester's existing tiers. */
export function strategyWeights(strategy: string | undefined) {
  switch (strategy) {
    case "set-positions":
      // Kids stay home: no pull to fresh zones, no penalty for staying.
      return { inGameDiversity: 0, sameAsLastQ: 0, home: 3000, also: 1500, partnership: 0 };
    case "preferred-lines":
      // Lean to the home line, still a stint elsewhere (≈ half the game home).
      return { inGameDiversity: 500, sameAsLastQ: 800, home: 600, also: 300, partnership: 2000 };
    default:
      return { inGameDiversity: 1000, sameAsLastQ: 800, home: 0, also: 0, partnership: 2000 };
  }
}

/** Zoned "Rotate lines": everyone moves up a line each break. */
export function rotatedZone(prev: Zone, zones: Zone[]): Zone | null {
  const order: Zone[] = ["back", "hback", "mid", "hfwd", "fwd"].filter((z) =>
    zones.includes(z as Zone),
  ) as Zone[];
  const i = order.indexOf(prev);
  if (i < 0) return null;
  return order[(i + 1) % order.length];
}

/** Build the engine input from a team's resolved playbook and prefs. */
export function aflPlaybookInput(
  resolved: ResolvedPlaybook,
  prefs: Pick<PlayerPositionPrefRow, "player_id" | "position_key" | "line" | "kind" | "rank">[],
  rules: RuleInstance[] = [],
): AflPlaybookInput {
  const strategy = resolved.strategy.id;
  const seasonWeight = seasonBalanceWeight(
    "afl",
    resolved.seasonBalance === "off" ? null : resolved.seasonBalance,
  );
  const model = roleModelFor(resolved);
  const roles: Record<string, AflLineRole> = {};
  const common = { rules, minGameTimePct: resolved.policy.minGameTimePct };
  if (!model) return { strategy, seasonWeight, roles, ...common };

  if (model.unit === "line") {
    for (const [pid, r] of Object.entries(rolesFromPrefs(prefs, "line"))) {
      roles[pid] = {
        home: (r.home as Zone | null) ?? null,
        also: r.also as Zone[],
        never: r.never as Zone[],
        keepOn: r.keepOn,
      };
    }
    return { strategy, seasonWeight, roles, ...common };
  }

  // Positions: the zone engine places lines; slots are filled after.
  const lineOf = new Map(resolved.positions.map((p) => [p.key, p.line as Zone]));
  const linePositions = (line: Zone) => resolved.positions.filter((p) => p.line === line).map((p) => p.key);
  const positionRoles: AflPlaybookInput["positionRoles"] = {};
  for (const [pid, r] of Object.entries(rolesFromPrefs(prefs, "position"))) {
    positionRoles[pid] = { home: r.home, also: r.also, never: r.never };
    const home = r.home ? lineOf.get(r.home) ?? null : null;
    const also = Array.from(new Set(r.also.map((k) => lineOf.get(k)).filter((z): z is Zone => !!z && z !== home)));
    // A whole line is off limits only when every position on it is.
    const never = (["back", "mid", "fwd"] as Zone[]).filter((line) => {
      const keys = linePositions(line);
      return keys.length > 0 && keys.every((k) => r.never.includes(k));
    });
    roles[pid] = { home, also, never, keepOn: r.keepOn };
  }
  return {
    strategy,
    seasonWeight,
    roles,
    positions: resolved.positions.map((p) => ({ key: p.key, label: p.label, line: p.line as Zone })),
    positionRoles,
    ...common,
  };
}

/**
 * Season balance for one player across the zones they may play, in
 * periods owed (§7.5). Preferred lines aim for 60 % home, the rest
 * shared. `season` is in minutes, as the suggesters keep it.
 */
export function seasonOwedByZone(
  pid: string,
  season: PlayerZoneMinutes,
  zones: Zone[],
  role: AflLineRole | undefined,
  periodMs: number,
): Record<string, number> {
  const allowed = zones.filter((z) => !role?.never.includes(LINE_OF_ZONE[z]) && !role?.never.includes(z));
  const byUnit: Record<string, number> = {};
  for (const z of allowed) byUnit[z] = (season[pid]?.[z] ?? 0) * 60000;
  let target: Record<string, number> | undefined;
  if (role?.home && allowed.length > 1) {
    target = {};
    const rest = (1 - PREFERRED_LINE_SHARE) / (allowed.length - 1);
    for (const z of allowed) target[z] = LINE_OF_ZONE[z] === role.home ? PREFERRED_LINE_SHARE : rest;
  }
  return periodsOwed({ byUnit, units: allowed, periodMs, target });
}

/**
 * Set positions: who wears which position label within each line —
 * home first, then also-plays, then anyone left, in formation order.
 * Returns playerId → position label for the tiles.
 */
export function assignPositionLabels(
  lineup: Lineup,
  input: AflPlaybookInput | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input?.positions || input.positions.length === 0) return out;
  const roles = input.positionRoles ?? {};
  for (const line of ["fwd", "mid", "back"] as Zone[]) {
    const zones = (Object.keys(LINE_OF_ZONE) as Zone[]).filter((z) => LINE_OF_ZONE[z] === line);
    const players = zones.flatMap((z) => lineup[z] ?? []);
    const free = input.positions.filter((p) => p.line === line);
    const taken = new Set<string>();
    const place = (pid: string, key: string) => {
      const pos = free.find((p) => p.key === key && !taken.has(p.key));
      if (!pos || out[pid]) return false;
      out[pid] = pos.label;
      taken.add(pos.key);
      return true;
    };
    for (const pid of players) {
      const home = roles[pid]?.home;
      if (home) place(pid, home);
    }
    for (const pid of players) {
      if (out[pid]) continue;
      for (const k of roles[pid]?.also ?? []) if (place(pid, k)) break;
    }
    for (const pid of players) {
      if (out[pid]) continue;
      const never = roles[pid]?.never ?? [];
      const pos =
        free.find((p) => !taken.has(p.key) && !never.includes(p.key)) ??
        free.find((p) => !taken.has(p.key));
      if (pos) {
        out[pid] = pos.label;
        taken.add(pos.key);
      }
    }
  }
  return out;
}

/**
 * After "Reset season balance", only games since the reset count
 * towards who's owed time where (§7.5). Adds that season (in minutes,
 * as the suggesters keep it) to the input; without a reset the
 * suggesters' own season map is used.
 */
export function withBalanceSeason(
  input: AflPlaybookInput,
  seasonEvents: GameEvent[],
  since: string | null,
): AflPlaybookInput {
  if (!since) return input;
  const ms = seasonTimeByUnit("afl", seasonEvents, "zone", { since });
  const balanceSeason: PlayerZoneMinutes = {};
  for (const [pid, byZone] of Object.entries(ms)) {
    const zm = { back: 0, hback: 0, mid: 0, hfwd: 0, fwd: 0 };
    for (const [z, v] of Object.entries(byZone)) zm[z as Zone] = v / 60000;
    balanceSeason[pid] = zm;
  }
  return { ...input, balanceSeason };
}

/**
 * A game in progress plays the strategy and season balance it kicked
 * off with (games.playbook_snapshot), even if the coach changes How we
 * play mid-game. Roles stay live — they're about the kids.
 */
export function withSnapshot(
  input: AflPlaybookInput,
  snapshot: PlaybookSnapshot | null | undefined,
): AflPlaybookInput {
  if (!snapshot) return input;
  return {
    ...input,
    strategy: snapshot.strategy,
    seasonWeight: seasonBalanceWeight(
      "afl",
      snapshot.seasonBalance === "off" ? null : snapshot.seasonBalance,
    ),
  };
}

/**
 * Must rules the greedy placement can miss — the zone a kid needs filled
 * up before their turn — are repaired by swapping zones with a teammate
 * the rules don't name (UX plan 4.2). Keep together, then apart, then
 * stays home. Pinned players never move; nobody is sent to a line they
 * never play. Mutates and returns the lineup.
 */
export function repairLineupForRules(
  lineup: Lineup,
  input: AflPlaybookInput,
  zones: Zone[],
  pinned: Set<string>,
): Lineup {
  const musts = (input.rules ?? []).filter((r) => r.strength === "must");
  if (musts.length === 0) return lineup;
  const zoneOf = (pid: string) => zones.find((z) => lineup[z].includes(pid)) ?? null;
  const never = (pid: string, z: Zone) => {
    const n = input.roles[pid]?.never ?? [];
    return n.includes(z) || n.includes(LINE_OF_ZONE[z]);
  };
  const named = new Set(musts.flatMap((r) => r.params.playerIds ?? []));
  const swap = (a: string, za: Zone, b: string, zb: Zone) => {
    lineup[za] = lineup[za].map((p) => (p === a ? b : p));
    lineup[zb] = lineup[zb].map((p) => (p === b ? a : p));
  };
  /** Move \`pid\` (in \`from\`) into \`to\` by swapping with someone free there. */
  const moveInto = (pid: string, from: Zone, to: Zone, avoid: Set<string>) => {
    if (never(pid, to)) return false;
    const other = lineup[to].find((c) => !pinned.has(c) && !avoid.has(c) && !named.has(c) && !never(c, from));
    if (!other) return false;
    swap(pid, from, other, to);
    return true;
  };

  for (const r of musts.filter((x) => x.kind === "keep-together")) {
    const ids = (r.params.playerIds ?? []).filter((p) => zoneOf(p));
    if (ids.length < 2) continue;
    const count = (z: Zone) => ids.filter((p) => lineup[z].includes(p)).length;
    const target = [...zones].sort((a, b) => count(b) - count(a))[0];
    for (const pid of ids) {
      const from = zoneOf(pid);
      if (from && from !== target && !pinned.has(pid)) moveInto(pid, from, target, new Set(ids));
    }
  }
  for (const r of musts.filter((x) => x.kind === "keep-apart")) {
    const ids = r.params.playerIds ?? [];
    for (const z of zones) {
      const here = ids.filter((p) => lineup[z].includes(p));
      for (const pid of here.slice(1)) {
        if (pinned.has(pid)) continue;
        const free = zones.find((z2) => z2 !== z && !ids.some((p) => lineup[z2].includes(p)) && !never(pid, z2));
        if (free) moveInto(pid, z, free, new Set(ids));
      }
    }
  }
  for (const r of musts.filter((x) => x.kind === "stays-home")) {
    for (const pid of r.params.playerIds ?? []) {
      const home = input.roles[pid]?.home;
      const from = zoneOf(pid);
      if (!home || !from || LINE_OF_ZONE[from] === home || pinned.has(pid)) continue;
      const to = zones.find((z) => LINE_OF_ZONE[z] === home);
      if (to) moveInto(pid, from, to, new Set());
    }
  }
  return lineup;
}

const AFL_LINE_LABEL: Record<string, string> = { back: "Back", mid: "Centre", fwd: "Forward" };

export interface AflRuleCheckInput {
  lineup: Lineup;
  names: Record<string, string>;
  /** This game's minutes per zone so far (empty before Q1). */
  gameMinutes: PlayerZoneMinutes;
  /** Where each player finished last quarter; absent = sat it out. */
  previousZones: Record<string, Zone>;
  /** The period about to start (1-based). */
  period: number;
  periodCount: number;
  periodMs: number;
  /** Season minutes per zone (balanceSeason when the coach reset it). */
  season: PlayerZoneMinutes;
  input: AflPlaybookInput | undefined;
}

/**
 * The rule check and Why lines for an AFL lineup about to start a
 * period (UX plan 4.3), on the shared checkRules / whyMove.
 */
export function aflRuleCheck(c: AflRuleCheckInput): { items: RuleCheckItem[]; why: { playerName: string; to: string; reason: string }[] } {
  const lines = ["back", "mid", "fwd"];
  const onField: Record<string, string> = {};
  for (const z of ["back", "hback", "mid", "hfwd", "fwd"] as Zone[]) {
    for (const pid of c.lineup[z] ?? []) onField[pid] = LINE_OF_ZONE[z];
  }
  const byLineMs = (zm: Record<string, number> | undefined) => {
    const out: Record<string, number> = {};
    for (const [z, mins] of Object.entries(zm ?? {})) {
      const line = LINE_OF_ZONE[z as Zone];
      if (line) out[line] = (out[line] ?? 0) + mins * 60000;
    }
    return out;
  };
  const playedThisGame: Record<string, Record<string, number>> = {};
  for (const pid of [...Object.keys(onField), ...c.lineup.bench]) playedThisGame[pid] = byLineMs(c.gameMinutes[pid]);
  const hadQuarter = Object.keys(c.previousZones).length > 0;
  const benchedLastPeriod = hadQuarter ? c.lineup.bench.concat(Object.keys(onField)).filter((pid) => !c.previousZones[pid]) : [];
  const seasonSource = c.input?.balanceSeason ?? c.season;
  const seasonOn = (c.input?.seasonWeight ?? 0) > 0;
  const seasonMs: UnitTime = {};
  if (seasonOn) for (const [pid, zm] of Object.entries(seasonSource)) seasonMs[pid] = byLineMs(zm);
  const name = (pid: string) => c.names[pid] ?? "A player";

  const items = checkRules({
    onField,
    bench: c.lineup.bench,
    lines,
    lineLabel: (k) => AFL_LINE_LABEL[k] ?? k,
    name,
    playedThisGame,
    benchedLastPeriod,
    period: c.period,
    periodCount: c.periodCount,
    periodMs: c.periodMs,
    periodWord: "quarter",
    lineWord: "line",
    minGameTimePct: c.input?.minGameTimePct ?? 50,
    rules: c.input?.rules ?? [],
    homeLine: Object.fromEntries(Object.entries(c.input?.roles ?? {}).map(([pid, r]) => [pid, r.home])),
    season: seasonOn
      ? { time: seasonMs, units: lines, unitLabel: (k) => (AFL_LINE_LABEL[k] ?? k).toLowerCase() }
      : undefined,
  });

  const why: { playerName: string; to: string; reason: string }[] = [];
  if (hadQuarter) {
    for (const pid of [...Object.keys(onField), ...c.lineup.bench]) {
      const to = onField[pid] ?? null;
      const from = c.previousZones[pid] ? LINE_OF_ZONE[c.previousZones[pid]] : null;
      if (to === from) continue;
      const owed = seasonOn
        ? seasonOwedByZone(pid, seasonSource, ["back", "mid", "fwd"], c.input?.roles[pid], c.periodMs)
        : undefined;
      why.push({
        playerName: name(pid),
        to: to ? AFL_LINE_LABEL[to] : "Bench",
        reason: whyMove({
          playerId: pid,
          to,
          from,
          lineLabel: (k) => AFL_LINE_LABEL[k] ?? k,
          periodWord: "quarter",
          playedThisGame: playedThisGame[pid] ?? {},
          benchedLastPeriod: benchedLastPeriod.includes(pid),
          homeLine: c.input?.roles[pid]?.home ?? null,
          strategy: c.input?.strategy ?? "suggested",
          seasonOwed: owed,
        }),
      });
    }
  }
  return { items, why };
}
