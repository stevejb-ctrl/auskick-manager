// ─── Touch family live helpers ───────────────────────────────
// Pure pieces of the live screens: the lineup edits a planning screen
// makes (the pre-game picker and the half-time plan), where a tap-tap
// swap changes a draft rather than writing an event. Modelled on
// basketball's live.ts, without positions. When a sub falls due is the
// shared lib/live/rollingSubs.ts `rollingSubDue`.

import { cloneTouchLineup, touchLineOf, touchOnField, type TouchLineup } from "@/lib/sports/touch/lineup";
import { TOUCH_LANES, TOUCH_LINES, type TouchLine } from "@/lib/sports/touch/types";

/** Put `to` where `from` is (on the field or the bench), in the same place. */
function putInPlace(lu: TouchLineup, from: string, to: string) {
  for (const line of TOUCH_LINES) {
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
 * are (two on the field swap lanes; one on the bench subs on for the
 * other). Two bench kids, or the same kid twice: unchanged.
 */
export function swapInTouchLineup(lineup: TouchLineup, a: string, b: string): TouchLineup {
  if (a === b) return lineup;
  const aOn = touchLineOf(lineup, a) !== null;
  const bOn = touchLineOf(lineup, b) !== null;
  if (!aOn && !bOn) return lineup;
  const lu = cloneTouchLineup(lineup);
  putInPlace(lu, a, "\u0000");
  putInPlace(lu, b, a);
  putInPlace(lu, "\u0000", b);
  return lu;
}

/** Take a kid off the field (or out of the bench order) without placing them. */
function lift(lu: TouchLineup, pid: string) {
  for (const line of TOUCH_LINES) lu.lines[line] = lu.lines[line].filter((p) => p !== pid);
  lu.bench = lu.bench.filter((p) => p !== pid);
}

/** A kid into an empty spot at the end of a lane, from the bench or elsewhere on the field. */
export function placeInTouchLineup(lineup: TouchLineup, pid: string, line: TouchLine): TouchLineup {
  if (touchLineOf(lineup, pid) === line) return lineup;
  const lu = cloneTouchLineup(lineup);
  lift(lu, pid);
  lu.lines[line].push(pid);
  return lu;
}

/** A kid on the field to the bench (the end of it). */
export function benchInTouchLineup(lineup: TouchLineup, pid: string): TouchLineup {
  if (touchLineOf(lineup, pid) === null) return lineup;
  const lu = cloneTouchLineup(lineup);
  lift(lu, pid);
  lu.bench.push(pid);
  return lu;
}

/**
 * A draft made earlier (say, the half-time plan before a late arrival)
 * with every kid in the game now: anyone in `current` the draft doesn't
 * place goes to the end of its bench.
 */
export function withEveryoneInTouchLineup(draft: TouchLineup, current: TouchLineup): TouchLineup {
  const placed = new Set([...touchOnField(draft), ...draft.bench]);
  const missing = [...touchOnField(current), ...current.bench].filter((id) => !placed.has(id));
  return missing.length === 0 ? draft : { ...draft, bench: [...draft.bench, ...missing] };
}

/** The draft with every kid who can't play (`out`: hurt, lent) moved to the end of the bench. */
export function benchOutInTouchLineup(lineup: TouchLineup, out: ReadonlySet<string>): TouchLineup {
  let lu = lineup;
  out.forEach((pid) => {
    lu = benchInTouchLineup(lu, pid);
  });
  return lu;
}

/**
 * A lineup laid out for a shape: everyone on the field moved into
 * `field` (Minutes only) or out of it into the shape's lanes, each kid
 * keeping their lane where it fits. The picker uses it when the coach
 * switches between Minutes only and lanes.
 */
export function reshapeTouchLineup(lineup: TouchLineup, shape: Record<TouchLine, number>): TouchLineup {
  const on = touchOnField(lineup);
  const lines: Record<TouchLine, string[]> = { middle: [], link: [], wing: [], field: [] };
  if (shape.field > 0) {
    lines.field = on;
  } else {
    const rest: string[] = [];
    for (const pid of on) {
      const line = touchLineOf(lineup, pid);
      if (line && line !== "field" && lines[line].length < shape[line]) lines[line].push(pid);
      else rest.push(pid);
    }
    for (const pid of rest) {
      const open = TOUCH_LANES.find((l) => lines[l].length < shape[l]) ?? "link";
      lines[open].push(pid);
    }
  }
  return { lines, bench: [...lineup.bench] };
}
