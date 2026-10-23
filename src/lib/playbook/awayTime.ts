// The time each kid couldn't play, per period, for How we played: before
// a late arrival got here, while injured (a foul-out is an injury with
// reason "fouled_out") and while lent to the other team. Every sport
// writes these events with the same { quarter, elapsed_ms } stamp, so
// this reads any sport's log. Pure.

import type { GameEvent } from "@/lib/types";

/** ms per player → period (1-based) → time away. Kids never away are absent. */
export type AwayByPeriod = Record<string, Record<number, number>>;

/**
 * @param periodLen how long period `p` ran (its quarter_end, else its
 *   nominal length); an elapsed past it is the period's end.
 * @param periodCount the periods there are; an absence open at full time
 *   runs to the end of the last.
 */
export function awayMsByPeriod(
  events: readonly GameEvent[],
  periodLen: (period: number) => number,
  periodCount: number,
): AwayByPeriod {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  // A point in the game: the period and the ms into it.
  type At = { period: number; ms: number };
  const atOf = (e: GameEvent): At | null => {
    const m = e.metadata as { quarter?: unknown; elapsed_ms?: unknown } | null;
    if (typeof m?.quarter !== "number") return null;
    // Before kickoff (period 0) is the start of the first.
    if (m.quarter < 1) return { period: 1, ms: 0 };
    const ms = typeof m.elapsed_ms === "number" ? m.elapsed_ms : 0;
    return { period: m.quarter, ms: Math.max(0, Math.min(ms, periodLen(m.quarter))) };
  };
  const away: AwayByPeriod = {};
  const add = (pid: string, from: At, to: At) => {
    for (let p = from.period; p <= Math.min(to.period, periodCount); p++) {
      const start = p === from.period ? from.ms : 0;
      const end = p === to.period ? to.ms : periodLen(p);
      if (end > start) {
        away[pid] ??= {};
        away[pid][p] = (away[pid][p] ?? 0) + (end - start);
      }
    }
  };

  // Kids in the lineup before the first period started were here from the start.
  const atKickoff = new Set<string>();
  const collect = (v: unknown, inArray: boolean) => {
    if (typeof v === "string") {
      if (inArray) atKickoff.add(v);
    } else if (Array.isArray(v)) v.forEach((x) => collect(x, true));
    else if (v && typeof v === "object") Object.values(v).forEach((x) => collect(x, false));
  };
  let started = false;
  const arrived = new Set<string>();
  // Open absences: since when, per kind, per kid.
  const injured: Record<string, At> = {};
  const lent: Record<string, At> = {};

  for (const e of sorted) {
    if (e.type === "quarter_start") started = true;
    if (!started && (e.type === "lineup_set" || e.type === "period_break_swap")) {
      collect((e.metadata as { lineup?: unknown } | null)?.lineup, false);
    }
    const pid = e.player_id;
    if (!pid) continue;
    const at = atOf(e);
    if (!at) continue;
    if (e.type === "player_arrived") {
      if (!atKickoff.has(pid) && !arrived.has(pid)) add(pid, { period: 1, ms: 0 }, at);
      arrived.add(pid);
    } else if (e.type === "injury" || e.type === "player_loan") {
      const open = e.type === "injury" ? injured : lent;
      const m = e.metadata as { injured?: boolean; loaned?: boolean };
      const on = (e.type === "injury" ? m.injured : m.loaned) ?? true;
      if (on) open[pid] ??= at;
      else if (open[pid]) {
        add(pid, open[pid], at);
        delete open[pid];
      }
    }
  }
  const end: At = { period: periodCount, ms: periodLen(periodCount) };
  for (const open of [injured, lent]) for (const [pid, from] of Object.entries(open)) add(pid, from, end);
  // Hurt while lent is still one absence: never more than the period.
  for (const periods of Object.values(away)) {
    for (const p of Object.keys(periods)) periods[Number(p)] = Math.min(periods[Number(p)], periodLen(Number(p)));
  }
  return away;
}
