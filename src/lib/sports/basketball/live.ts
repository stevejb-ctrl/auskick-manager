// ─── Basketball live helpers ─────────────────────────────────
// Pure pieces of the live screens: when the next sub is due, and the
// lineup edits a planning screen makes (the pre-game picker and the
// break plan), where a tap-tap swap changes a draft rather than writing
// an event. Modelled on soccer's live.ts, without the keeper and with
// positions travelling with their spot.

import {
  basketballLineOf,
  basketballOnCourt,
  cloneBasketballLineup,
  type BasketballLineup,
} from "@/lib/sports/basketball/lineup";
import { BASKETBALL_LINES, type BasketballLine } from "@/lib/sports/basketball/types";

// ─── When the next sub is due ────────────────────────────────

export interface BasketballSubDueInput {
  /** The interval between subs, in game ms. Null = no timer. */
  subIntervalMs: number | null;
  /** The period's length in game ms. */
  periodMs: number;
  /** No sub prompt in the last this-many game ms of the period. */
  cutoffMs: number;
  /** Game ms into the period of the last planned sub (lib/live/subAnchor), or null. */
  anchorMs: number | null;
  /** Game ms into the period now. */
  elapsedMs: number;
}

export interface BasketballSubDue {
  due: boolean;
  /** ms until the next sub falls due; null when there's no timer. */
  msUntilDue: number | null;
  /** The span the card's ring counts down. */
  spanMs: number | null;
  /** What a "seen it" tap acknowledges: the anchor. */
  key: number | null;
}

/**
 * Due once a sub interval has passed since the last planned sub (or the
 * period's start), except in the period's last `cutoffMs`: a sub there
 * lands after the hooter (and some by-laws allow none in the last
 * minute). No timer before the period starts.
 */
export function basketballSubDue(input: BasketballSubDueInput): BasketballSubDue {
  const { subIntervalMs, periodMs, cutoffMs, anchorMs, elapsedMs } = input;
  const none: BasketballSubDue = { due: false, msUntilDue: null, spanMs: null, key: null };
  if (anchorMs === null || subIntervalMs === null || !(subIntervalMs > 0)) return none;
  const msUntilDue = anchorMs + subIntervalMs - elapsedMs;
  const inCutoff = cutoffMs > 0 && elapsedMs >= periodMs - cutoffMs;
  return { due: msUntilDue <= 0 && !inCutoff, msUntilDue, spanMs: subIntervalMs, key: anchorMs };
}

// ─── Planning-screen edits ───────────────────────────────────

/** Put `to` where `from` is (on court or the bench), in the same place, with its position. */
function putInPlace(lu: BasketballLineup, from: string, to: string) {
  for (const line of BASKETBALL_LINES) {
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
 * are (two on court swap spots and positions; one on the bench subs on
 * for the other and takes their position). Two bench kids, or the same
 * kid twice: unchanged.
 */
export function swapInBasketballLineup(lineup: BasketballLineup, a: string, b: string): BasketballLineup {
  if (a === b) return lineup;
  const aOn = basketballLineOf(lineup, a) !== null;
  const bOn = basketballLineOf(lineup, b) !== null;
  if (!aOn && !bOn) return lineup;
  const lu = cloneBasketballLineup(lineup);
  putInPlace(lu, a, "\u0000");
  putInPlace(lu, b, a);
  putInPlace(lu, "\u0000", b);
  if (lu.slots) {
    const sa = lu.slots[a];
    const sb = lu.slots[b];
    delete lu.slots[a];
    delete lu.slots[b];
    if (sb) lu.slots[a] = sb;
    if (sa) lu.slots[b] = sa;
  }
  return lu;
}

/** Take a kid off court (or out of the bench order) without placing them. */
function lift(lu: BasketballLineup, pid: string) {
  for (const line of BASKETBALL_LINES) lu.lines[line] = lu.lines[line].filter((p) => p !== pid);
  lu.bench = lu.bench.filter((p) => p !== pid);
  if (lu.slots) delete lu.slots[pid];
}

/** A kid into an empty spot at the end of a line, from the bench or elsewhere on court. */
export function placeInBasketballLineup(lineup: BasketballLineup, pid: string, line: BasketballLine): BasketballLineup {
  if (basketballLineOf(lineup, pid) === line) return lineup;
  const lu = cloneBasketballLineup(lineup);
  lift(lu, pid);
  lu.lines[line].push(pid);
  return lu;
}

/** A kid on court to the bench (the end of it). */
export function benchInBasketballLineup(lineup: BasketballLineup, pid: string): BasketballLineup {
  if (basketballLineOf(lineup, pid) === null) return lineup;
  const lu = cloneBasketballLineup(lineup);
  lift(lu, pid);
  lu.bench.push(pid);
  return lu;
}

/**
 * A draft made earlier (say, the break plan before a late arrival) with
 * every kid in the game now: anyone in `current` the draft doesn't place
 * goes to the end of its bench.
 */
export function withEveryoneInBasketballLineup(draft: BasketballLineup, current: BasketballLineup): BasketballLineup {
  const placed = new Set([...basketballOnCourt(draft), ...draft.bench]);
  const missing = [...basketballOnCourt(current), ...current.bench].filter((id) => !placed.has(id));
  return missing.length === 0 ? draft : { ...draft, bench: [...draft.bench, ...missing] };
}

/**
 * The draft with every kid who can't play (`out`: hurt, lent, fouled
 * out, sitting out) moved off court to the end of the bench, places
 * left empty.
 */
export function benchOutInBasketballLineup(lineup: BasketballLineup, out: ReadonlySet<string>): BasketballLineup {
  let lu = lineup;
  out.forEach((pid) => {
    lu = benchInBasketballLineup(lu, pid);
  });
  return lu;
}

/**
 * A lineup laid out for another strategy: everyone on court moved into
 * `court` (Equal minutes) or out of it into the shape's lines, positions
 * dropped or kept as asked. The picker uses it when the coach switches
 * between the strategy's ways of playing.
 */
export function reshapeBasketballLineup(
  lineup: BasketballLineup,
  shape: Record<BasketballLine, number>,
  keepSlots: boolean,
): BasketballLineup {
  const on = basketballOnCourt(lineup);
  const lines: Record<BasketballLine, string[]> = { guard: [], forward: [], court: [] };
  if (shape.court > 0) {
    lines.court = on;
  } else {
    // Keep each kid's line where it fits the shape, then fill the rest.
    const rest: string[] = [];
    for (const pid of on) {
      const line = basketballLineOf(lineup, pid);
      if ((line === "guard" || line === "forward") && lines[line].length < shape[line]) lines[line].push(pid);
      else rest.push(pid);
    }
    for (const pid of rest) {
      if (lines.guard.length < shape.guard) lines.guard.push(pid);
      else lines.forward.push(pid);
    }
  }
  const out: BasketballLineup = { lines, bench: [...lineup.bench] };
  if (keepSlots && lineup.slots) out.slots = { ...lineup.slots };
  return out;
}
