// Season time service (UX plan §7.5, chunk 3.1b).
//
// One question for every sport: how long has each player spent in each
// unit (zone, line, third, bib, position) this season? Season balance,
// the stats grid and the player view all ask it, and before this each
// sport answered with its own walker in its own unit — AFL in minutes
// per zone, netball in quarters per bib, league in ms per line.
//
// This composes the existing per-game replays (they already handle
// swaps, injuries, loans and mid-quarter subs) and returns
// milliseconds everywhere, so netball moves from quarter counts to
// time — which it needs once mid-quarter subs are on.

import type { GameEvent } from "@/lib/types";
import type { SportId } from "@/lib/sports/types";
import type { BalanceUnit } from "./types";
import { ALL_ZONES, gameZoneMinutes } from "@/lib/fairness";
import { playedZoneMsByPeriod, type ThirdLookup } from "@/lib/sports/netball/fairness";
import { primaryThirdFor } from "@/lib/sports/netball";
import { playerSlotMsOnField, playerZoneMsOnField } from "@/lib/sports/rugby_league/fairness";
import { noSportBranch } from "@/lib/sports/registry";

/** ms per player per unit key. */
export type UnitTime = Record<string, Record<string, number>>;

export interface SeasonTimeOptions {
  /**
   * Only count games whose first event is on or after this date
   * (`season_balance_since`, "Reset season balance"). ISO date or
   * timestamp; omitted = every game in `events`.
   */
  since?: string | null;
  /**
   * Netball quarters are credited by period length, not by clock
   * events. Seconds per period, or a per-game lookup. Defaults to 10
   * minutes, the junior netball quarter.
   */
  periodSeconds?: number | ((gameId: string) => number);
  /** Leave one game out — usually the game being played right now. */
  excludeGameId?: string;
}

const DEFAULT_NETBALL_PERIOD_SECONDS = 600;

/** AFL lines: the half-zones fold into the line they sit in. */
const AFL_LINE_OF: Record<string, string> = {
  back: "back",
  hback: "back",
  mid: "mid",
  hfwd: "fwd",
  fwd: "fwd",
};

function groupByGame(events: GameEvent[]): Map<string, GameEvent[]> {
  const byGame = new Map<string, GameEvent[]>();
  for (const ev of events) {
    const arr = byGame.get(ev.game_id) ?? [];
    arr.push(ev);
    byGame.set(ev.game_id, arr);
  }
  return byGame;
}

function firstEventAt(events: GameEvent[]): string {
  let min = events[0]?.created_at ?? "";
  for (const ev of events) if (ev.created_at < min) min = ev.created_at;
  return min;
}

function add(out: UnitTime, pid: string, key: string, ms: number) {
  if (!(ms > 0)) return;
  out[pid] ??= {};
  out[pid][key] = (out[pid][key] ?? 0) + ms;
}

/** One game's time per player per unit, in ms. */
export function gameTimeByUnit(
  sport: SportId,
  events: GameEvent[],
  unit: BalanceUnit,
  periodSeconds: number = DEFAULT_NETBALL_PERIOD_SECONDS,
): UnitTime {
  const out: UnitTime = {};
  if (events.length === 0) return out;

  if (sport === "afl") {
    if (unit !== "zone" && unit !== "line") return out;
    const minutes = gameZoneMinutes(events);
    for (const [pid, zm] of Object.entries(minutes)) {
      for (const z of ALL_ZONES) {
        const key = unit === "zone" ? z : AFL_LINE_OF[z];
        add(out, pid, key, zm[z] * 60000);
      }
    }
    return out;
  }

  if (sport === "netball") {
    if (unit !== "bib" && unit !== "third") return out;
    // The lookup is typed for thirds, but the walker only uses its
    // result as a bucket key, so a bib id works too.
    const lookup = ((posId: string) =>
      unit === "bib" ? posId : primaryThirdFor(posId)) as ThirdLookup;
    const byPeriod = playedZoneMsByPeriod(events, periodSeconds, lookup);
    for (const [pid, periods] of Object.entries(byPeriod)) {
      for (const keys of Object.values(periods)) {
        for (const [key, ms] of Object.entries(keys)) add(out, pid, key, ms);
      }
    }
    return out;
  }

  if (sport !== "rugby_league") return noSportBranch(sport, "gameTimeByUnit");
  // Rugby league: forwards / backs, with vest wearers' periods in
  // "centre" (the duty, not a line). Named positions come from the
  // slots recorded on each lineup (chunk 5.7).
  if (unit === "position") {
    for (const [pid, byKey] of Object.entries(playerSlotMsOnField(events))) {
      for (const [key, ms] of Object.entries(byKey)) add(out, pid, key, ms);
    }
    return out;
  }
  if (unit !== "line") return out;
  // A quarter number past the last period closes every stint at its
  // quarter_end; nothing is extended to "now".
  const zones = playerZoneMsOnField(events, Number.MAX_SAFE_INTEGER, 0);
  for (const [pid, z] of Object.entries(zones)) {
    add(out, pid, "forwards", z.forwards);
    add(out, pid, "backs", z.backs);
    add(out, pid, "centre", z.centre);
  }
  return out;
}

/** Season time per player per unit, in ms, summed game by game. */
export function seasonTimeByUnit(
  sport: SportId,
  events: GameEvent[],
  unit: BalanceUnit,
  opts: SeasonTimeOptions = {},
): UnitTime {
  const total: UnitTime = {};
  const since = opts.since ?? null;
  groupByGame(events).forEach((gameEvents, gameId) => {
    if (gameId === opts.excludeGameId) return;
    if (since && firstEventAt(gameEvents) < since) return;
    const period =
      typeof opts.periodSeconds === "function"
        ? opts.periodSeconds(gameId)
        : (opts.periodSeconds ?? DEFAULT_NETBALL_PERIOD_SECONDS);
    const game = gameTimeByUnit(sport, gameEvents, unit, period);
    for (const [pid, keys] of Object.entries(game)) {
      for (const [key, ms] of Object.entries(keys)) add(total, pid, key, ms);
    }
  });
  return total;
}

/** Sum of a player's time across the given units (or all units). */
export function totalTime(byUnit: Record<string, number> | undefined, units?: string[]): number {
  if (!byUnit) return 0;
  const keys = units ?? Object.keys(byUnit);
  return keys.reduce((s, k) => s + (byUnit[k] ?? 0), 0);
}
