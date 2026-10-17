// ─── Football (soccer) live helpers ──────────────────────────
// Pure pieces of the live screens: when the next sub is due, and the
// lineup edits a planning screen makes (the pre-game picker and the
// half-time plan), where a tap-tap swap changes a draft rather than
// writing an event.

import { soccerUnitOf, type SoccerLineup } from "@/lib/sports/soccer/lineup";
import { soccerSubWindowsMs } from "@/lib/sports/soccer/suggest";
import type { SoccerSubMode, SoccerUnit } from "@/lib/sports/soccer/types";

// ─── When the next sub is due ────────────────────────────────

export interface SoccerSubDueInput {
  mode: SoccerSubMode;
  /** Rolling subs: the interval between subs, in game ms. Null = no timer. */
  subIntervalMs: number | null;
  /** The half's length in game ms. */
  periodMs: number;
  clockMultiplier?: number;
  /** Game ms into the half of the last planned sub (lib/live/subAnchor), or null. */
  anchorMs: number | null;
  /** Game ms into the half now. */
  elapsedMs: number;
}

export interface SoccerSubDue {
  due: boolean;
  /** ms until the next sub falls due; null when there's no timer. */
  msUntilDue: number | null;
  /** The span the card's ring counts down. */
  spanMs: number | null;
  /**
   * What a "seen it" tap acknowledges, so the banner stays down until
   * the next sub falls due: the anchor (rolling) or the window (windows).
   */
  key: number | null;
}

/**
 * Rolling: due once a sub interval has passed since the last planned
 * sub (or the half's start). Windows: due once a window has passed and
 * no planned sub has been made since it opened; the ring counts to the
 * next window. No timer before the half starts.
 */
export function soccerSubDue(input: SoccerSubDueInput): SoccerSubDue {
  const { mode, subIntervalMs, periodMs, anchorMs, elapsedMs } = input;
  const none: SoccerSubDue = { due: false, msUntilDue: null, spanMs: null, key: null };
  if (anchorMs === null) return none;

  if (mode.kind === "windows") {
    const windows = soccerSubWindowsMs(mode, periodMs, input.clockMultiplier ?? 1);
    if (windows.length === 0) return none;
    const passed = windows.filter((w) => w <= elapsedMs);
    const open = passed.length > 0 ? passed[passed.length - 1] : null;
    const next = windows.find((w) => w > elapsedMs) ?? null;
    const due = open !== null && anchorMs < open;
    const prev = open ?? 0;
    return {
      due,
      msUntilDue: due ? 0 : next !== null ? next - elapsedMs : null,
      spanMs: next !== null ? next - prev : null,
      key: open,
    };
  }

  if (subIntervalMs === null || !(subIntervalMs > 0)) return none;
  const msUntilDue = anchorMs + subIntervalMs - elapsedMs;
  return { due: msUntilDue <= 0, msUntilDue, spanMs: subIntervalMs, key: anchorMs };
}

// ─── Planning-screen edits ───────────────────────────────────

function clone(lu: SoccerLineup): SoccerLineup {
  return {
    keeper: lu.keeper,
    lines: { def: [...lu.lines.def], mid: [...lu.lines.mid], att: [...lu.lines.att], field: [...lu.lines.field] },
    bench: [...lu.bench],
    ...(lu.slots ? { slots: { ...lu.slots } } : {}),
  };
}

/** Put `to` where `from` is (in goal, a line, or the bench), in the same place. */
function putInPlace(lu: SoccerLineup, from: string, to: string) {
  if (lu.keeper === from) {
    lu.keeper = to;
    return;
  }
  for (const line of Object.keys(lu.lines) as (keyof SoccerLineup["lines"])[]) {
    const i = lu.lines[line].indexOf(from);
    if (i >= 0) {
      lu.lines[line][i] = to;
      return;
    }
  }
  const b = lu.bench.indexOf(from);
  if (b >= 0) lu.bench[b] = to;
}

/**
 * A tap-tap swap on a draft: the two kids trade places, wherever they
 * are (two on the field swap spots; one on the bench subs on for the
 * other). Two bench kids, or the same kid twice: unchanged.
 */
export function swapInSoccerLineup(lineup: SoccerLineup, a: string, b: string): SoccerLineup {
  if (a === b) return lineup;
  const aOn = soccerUnitOf(lineup, a) !== null;
  const bOn = soccerUnitOf(lineup, b) !== null;
  if (!aOn && !bOn) return lineup;
  const lu = clone(lineup);
  putInPlace(lu, a, "\u0000");
  putInPlace(lu, b, a);
  putInPlace(lu, "\u0000", b);
  return lu;
}

/** Take a kid off the field (or out of the bench order) without placing them. */
function lift(lu: SoccerLineup, pid: string) {
  if (lu.keeper === pid) lu.keeper = null;
  for (const line of Object.keys(lu.lines) as (keyof SoccerLineup["lines"])[]) {
    lu.lines[line] = lu.lines[line].filter((p) => p !== pid);
  }
  lu.bench = lu.bench.filter((p) => p !== pid);
}

/**
 * A kid into an empty spot (an empty goal, or the end of a line), from
 * the bench or from elsewhere on the field. Into a goal that's taken:
 * unchanged (swap with the keeper instead).
 */
export function placeInSoccerLineup(lineup: SoccerLineup, pid: string, unit: SoccerUnit): SoccerLineup {
  if (unit === "gk" && lineup.keeper && lineup.keeper !== pid) return lineup;
  if (soccerUnitOf(lineup, pid) === unit) return lineup;
  const lu = clone(lineup);
  lift(lu, pid);
  if (unit === "gk") lu.keeper = pid;
  else lu.lines[unit].push(pid);
  return lu;
}

/** A kid on the field to the bench (the end of it). */
export function benchInSoccerLineup(lineup: SoccerLineup, pid: string): SoccerLineup {
  if (soccerUnitOf(lineup, pid) === null) return lineup;
  const lu = clone(lineup);
  lift(lu, pid);
  lu.bench.push(pid);
  return lu;
}

/**
 * The draft with every kid who can't play (`out`: hurt, lent, gone)
 * moved off the field to the end of the bench, places left empty.
 */
export function benchOutInSoccerLineup(lineup: SoccerLineup, out: ReadonlySet<string>): SoccerLineup {
  let lu = lineup;
  out.forEach((pid) => {
    lu = benchInSoccerLineup(lu, pid);
  });
  return lu;
}
