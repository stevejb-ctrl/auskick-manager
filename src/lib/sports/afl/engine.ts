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
): AflPlaybookInput {
  const strategy = resolved.strategy.id;
  const seasonWeight = seasonBalanceWeight(
    "afl",
    resolved.seasonBalance === "off" ? null : resolved.seasonBalance,
  );
  const model = roleModelFor(resolved);
  const roles: Record<string, AflLineRole> = {};
  if (!model) return { strategy, seasonWeight, roles };

  if (model.unit === "line") {
    for (const [pid, r] of Object.entries(rolesFromPrefs(prefs, "line"))) {
      roles[pid] = {
        home: (r.home as Zone | null) ?? null,
        also: r.also as Zone[],
        never: r.never as Zone[],
        keepOn: r.keepOn,
      };
    }
    return { strategy, seasonWeight, roles };
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
