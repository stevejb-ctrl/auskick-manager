// ─── Rolling subs ────────────────────────────────────────────
// The shared pick for sports with unlimited rolling subs: who comes on
// for whom, and when the next sub is due. Lines, the bench, this game's
// minutes and the holds go in; ranked swaps come out. Pure: no clock,
// no React, no DB.
//
// Touch and Oztag are its first users (.planning/FOUR-SPORTS-PLAN.md,
// "The shared rolling-sub module"). Soccer's and basketball's suggesters
// pick the same way in their own copies; moving them onto this module
// is a follow-up, not part of the touch build.
//
// The rules it keeps:
//   - Equal time is the target: the kids on the bench longest come on
//     for the kids on the field longest, and only when that evens their
//     time.
//   - Nobody held on (Keep on) comes off; kids who play every minute
//     (How we play's Keep on role) come on first and never come off.
//   - Composition constraints: a count of tagged kids on the field
//     ({ tag, min?, max? }) that no sub breaks. A mixed team's boys' cap
//     is `{ tag: "boy", max: 3 }`: at the cap a boy only comes on for a
//     boy. Basketball's "a ball handler stays on" is `{ tag: "handler",
//     min: 1 }`. A field already outside a constraint (a hand sub put a
//     fourth boy on) is brought back first, before anything evens time
//     (compositionFixes), and never takes a sub further out.
//   - Pools: fair time is evened within each pool, so a kid comes on
//     only for a kid of their own pool (a mixed team's girls and boys).
//   - Lines: a kid can be held to one line (a line hold, like-for-like),
//     prefer one (a home lane), or not play one at all ("Plays as").

/** A count of tagged kids on the field that every sub keeps to. */
export interface CompositionConstraint {
  /** The tag counted ("boy", "girl", "handler"). */
  tag: string;
  min?: number;
  max?: number;
}

export interface RollingSubsInput<L extends string = string> {
  /** Kids on the field and the line each plays, in the order they're drawn. */
  field: readonly { id: string; line: L }[];
  /** Kids on the bench who can come on now (not hurt, lent or out), in squad order. */
  bench: readonly string[];
  /** Each kid's time this game so far, in ms: who plays is this game's minutes. */
  gameMs: (id: string) => number;
  /** Held on the field (a Keep on hold): never subbed off. */
  held?: (id: string) => boolean;
  /** Plays every minute the rules allow (How we play's Keep on): on first, never off. */
  keepOn?: (id: string) => boolean;
  /** The only line a kid comes on into (a line hold, like-for-like), or null for any. */
  onlyLine?: (id: string) => L | null;
  /** The line a kid would rather come on into (a home lane), or null. */
  preferLine?: (id: string) => L | null;
  /** Whether a kid plays a line at all ("Plays as"). Every line when omitted. */
  plays?: (id: string, line: L) => boolean;
  /** The tags each kid carries, for `constraints`. */
  tags?: (id: string) => readonly string[];
  constraints?: readonly CompositionConstraint[];
  /** Fair time is evened within each pool: a kid comes on only for a kid of the same pool. */
  pool?: (id: string) => string;
  /** Came on too recently to come off (a minimum stint): they go off last. */
  justOn?: (id: string) => boolean;
  /** Went off too recently to come back: they wait while anyone else can come on. */
  justOff?: (id: string) => boolean;
  /**
   * Went off within the cool-down: not brought back on at all, even with
   * nobody else to come on (a fix for the rule aside). Round 2 usability,
   * 24 Oct 2026: 6 s after a hand sub took Zara off, the card had her on.
   */
  resting?: (id: string) => boolean;
  /**
   * Empty places on the field, by line (a kid hurt with nobody on for
   * them): filled first, a bench kid on with nobody off.
   */
  open?: readonly L[];
  /** At most this many subs in one batch; omitted = as many as even time. */
  maxSubs?: number;
}

/** A suggested sub: the kid going off (null: into an empty place), the kid coming on, and the line they take. */
export interface RollingSub<L extends string = string> {
  off: string | null;
  on: string;
  line: L;
}

/** Stable sort: a copy, ordered by `key` (compared in turn) ascending, ties in input order. */
export function sortByKeys<T>(items: readonly T[], key: (item: T) => number[]): T[] {
  const cmp = (a: number[], b: number[]) => {
    for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) return a[j] - b[j];
    return 0;
  };
  return items
    .map((item, i) => ({ item, i, k: key(item) }))
    .sort((a, b) => cmp(a.k, b.k) || a.i - b.i)
    .map((x) => x.item);
}

/** How far a count is outside a constraint (0 inside it). */
function distance(c: CompositionConstraint, count: number): number {
  return Math.max(0, (c.min ?? -Infinity) - count) + Math.max(0, count - (c.max ?? Infinity));
}

/** Kids carrying each constrained tag among `ids`. */
export function countTags(
  ids: readonly string[],
  tags: (id: string) => readonly string[],
  constraints: readonly CompositionConstraint[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of constraints) out[c.tag] = 0;
  for (const id of ids) for (const t of tags(id)) if (t in out) out[t]++;
  return out;
}

/** The constraints `ids` break, with the count each one has. */
export function brokenConstraints(
  ids: readonly string[],
  tags: (id: string) => readonly string[],
  constraints: readonly CompositionConstraint[],
): { constraint: CompositionConstraint; count: number }[] {
  const counts = countTags(ids, tags, constraints);
  return constraints
    .filter((c) => distance(c, counts[c.tag]) > 0)
    .map((constraint) => ({ constraint, count: counts[constraint.tag] }));
}

/**
 * Whether taking `off` off the field and putting `on` on keeps to every
 * constraint: each count ends inside it, or no further out than it was.
 * `off` null is a kid filling an empty place; `on` null a kid leaving.
 */
export function keepsComposition(
  counts: Readonly<Record<string, number>>,
  off: string | null,
  on: string | null,
  tags: (id: string) => readonly string[],
  constraints: readonly CompositionConstraint[],
): boolean {
  const offTags = off ? tags(off) : [];
  const onTags = on ? tags(on) : [];
  return constraints.every((c) => {
    const before = counts[c.tag] ?? 0;
    const after = before - (offTags.includes(c.tag) ? 1 : 0) + (onTags.includes(c.tag) ? 1 : 0);
    return distance(c, after) === 0 || distance(c, after) <= distance(c, before);
  });
}

/** How far a field's counts are outside every constraint, summed (0 inside them all). */
function totalDistance(counts: Readonly<Record<string, number>>, constraints: readonly CompositionConstraint[]): number {
  return constraints.reduce((sum, c) => sum + distance(c, counts[c.tag] ?? 0), 0);
}

/** Apply a sub to a field's tag counts, in place. */
function applyTags(counts: Record<string, number>, off: string, on: string, tags: (id: string) => readonly string[]) {
  for (const t of tags(off)) if (t in counts) counts[t]--;
  for (const t of tags(on)) if (t in counts) counts[t]++;
}

/**
 * The subs that bring a field outside a constraint back inside it (a
 * hand sub that put a fourth boy on): each one a bench kid, least time
 * first, on for the kid on the field with the most whose swap takes the
 * field closer to the rule. The rule outweighs everything else here:
 * pools, rest and evening time don't stop a fix, but holds, Keep on and
 * the lines do. Empty when the field keeps every constraint, or nobody
 * on the bench can bring it back.
 */
export function compositionFixes<L extends string>(input: RollingSubsInput<L>): RollingSub<L>[] {
  return fixComposition(input).subs;
}

function fixComposition<L extends string>(
  input: RollingSubsInput<L>,
): { subs: RollingSub<L>[]; counts: Record<string, number>; usedOff: Set<string>; usedOn: Set<string> } {
  const { field, gameMs } = input;
  const tags = input.tags ?? (() => []);
  const constraints = input.constraints ?? [];
  const held = input.held ?? (() => false);
  const keepOn = input.keepOn ?? (() => false);
  const justOff = input.justOff ?? (() => false);
  const plays = input.plays ?? (() => true);
  const lineOf = new Map(field.map((f) => [f.id, f.line]));
  const counts = countTags(
    field.map((f) => f.id),
    tags,
    constraints,
  );
  const usedOff = new Set<string>();
  const usedOn = new Set<string>();
  const subs: RollingSub<L>[] = [];
  if (totalDistance(counts, constraints) === 0) return { subs, counts, usedOff, usedOn };

  // Rested kids first, then least time; the kid on longest goes off.
  const bench = sortByKeys(input.bench, (p) => [justOff(p) ? 1 : 0, gameMs(p)]);
  const court = sortByKeys(
    field.map((f) => f.id).filter((p) => !held(p) && !keepOn(p)),
    (p) => [-gameMs(p)],
  );
  while (totalDistance(counts, constraints) > 0) {
    if (input.maxSubs !== undefined && subs.length >= input.maxSubs) break;
    const before = totalDistance(counts, constraints);
    let fix: { off: string; on: string; line: L } | null = null;
    for (const on of bench) {
      if (usedOn.has(on)) continue;
      const only = input.onlyLine?.(on) ?? null;
      const off = court.find((p) => {
        if (usedOff.has(p)) return false;
        const line = lineOf.get(p) as L;
        if ((only && line !== only) || !plays(on, line)) return false;
        const after = { ...counts };
        applyTags(after, p, on, tags);
        return totalDistance(after, constraints) < before;
      });
      if (off) {
        fix = { off, on, line: lineOf.get(off) as L };
        break;
      }
    }
    if (!fix) break;
    usedOff.add(fix.off);
    usedOn.add(fix.on);
    applyTags(counts, fix.off, fix.on, tags);
    subs.push(fix);
  }
  return { subs, counts, usedOff, usedOn };
}

/**
 * A sub-due batch: first any subs that bring a field outside a
 * constraint back inside it (compositionFixes), then the empty places
 * (open), filled with nobody off, then the bench, least
 * time this game first, on for the kids on the field with the most,
 * while each sub evens their time and keeps to the lines, pools and
 * constraints. Ranked in the order they should be made. Empty when the
 * field keeps the rules and no sub evens time.
 */
export function suggestRollingSubs<L extends string>(input: RollingSubsInput<L>): RollingSub<L>[] {
  const { field, gameMs } = input;
  const held = input.held ?? (() => false);
  const keepOn = input.keepOn ?? (() => false);
  const justOn = input.justOn ?? (() => false);
  const justOff = input.justOff ?? (() => false);
  const plays = input.plays ?? (() => true);
  const tags = input.tags ?? (() => []);
  const constraints = input.constraints ?? [];
  const pool = input.pool;
  const lineOf = new Map(field.map((f) => [f.id, f.line]));

  // The rule first: a field outside a constraint is brought back.
  const fixed = fixComposition(input);
  const counts = fixed.counts;
  const used = fixed.usedOff;
  const subs: RollingSub<L>[] = [...fixed.subs];

  const resting = input.resting ?? (() => false);
  const free = input.bench.filter((p) => !fixed.usedOn.has(p) && !resting(p));
  const rested = free.filter((p) => !justOff(p));
  // Bench kids who haven't rested wait while anyone else can come on.
  const bench = sortByKeys(rested.length > 0 ? rested : free, (p) => [keepOn(p) ? 0 : 1, gameMs(p)]);
  // Kids who just came on go off last; kids who play every minute stay on.
  const court = sortByKeys(
    field.map((f) => f.id).filter((p) => !held(p) && !keepOn(p)),
    (p) => [justOn(p) ? 1 : 0, -gameMs(p)],
  );

  // Empty places first, nobody off, keeping the constraints (round 3
  // edge cases, 24 Oct 2026: a short side was only ever offered swaps,
  // and following one benched a kid off a side already short).
  const filled = new Set<string>();
  for (const line of input.open ?? []) {
    if (input.maxSubs !== undefined && subs.length >= input.maxSubs) break;
    const on = bench.find((p) => {
      if (filled.has(p)) return false;
      const only = input.onlyLine?.(p) ?? null;
      return (!only || only === line) && plays(p, line) && keepsComposition(counts, null, p, tags, constraints);
    });
    if (!on) continue;
    filled.add(on);
    for (const t of tags(on)) if (t in counts) counts[t]++;
    subs.push({ off: null, on, line });
  }

  for (const on of bench) {
    if (input.maxSubs !== undefined && subs.length >= input.maxSubs) break;
    if (filled.has(on)) continue;
    const only = input.onlyLine?.(on) ?? null;
    const candidates = court.filter((off) => {
      if (used.has(off)) return false;
      const line = lineOf.get(off) as L;
      if (only && line !== only) return false;
      if (!plays(on, line)) return false;
      if (pool && pool(off) !== pool(on)) return false;
      return keepsComposition(counts, off, on, tags, constraints);
    });
    // The kid on longest, or the one in the line this kid would rather
    // play when coming on there evens time too.
    const prefer = input.preferLine?.(on) ?? null;
    const evens = (off: string) => gameMs(on) < gameMs(off);
    const off = (prefer ? candidates.find((p) => lineOf.get(p) === prefer && evens(p)) : undefined) ?? candidates[0];
    if (!off || !evens(off)) continue;
    used.add(off);
    applyTags(counts, off, on, tags);
    subs.push({ off, on, line: lineOf.get(off) as L });
  }
  return subs;
}

// ─── When the next sub is due ────────────────────────────────

export interface RollingSubDueInput {
  /** The interval between subs, in game ms. Null = no timer. */
  subIntervalMs: number | null;
  /** The period's length in game ms. */
  periodMs: number;
  /** No sub prompt in the last this-many game ms of the period (0 = none). */
  cutoffMs?: number;
  /** Game ms into the period of the last planned sub (lib/live/subAnchor), or null. */
  anchorMs: number | null;
  /** Game ms into the period now. */
  elapsedMs: number;
}

export interface RollingSubDue {
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
 * period's start), except in the period's last `cutoffMs`. No timer
 * before the period starts.
 */
export function rollingSubDue(input: RollingSubDueInput): RollingSubDue {
  const { subIntervalMs, periodMs, anchorMs, elapsedMs } = input;
  const cutoffMs = input.cutoffMs ?? 0;
  const none: RollingSubDue = { due: false, msUntilDue: null, spanMs: null, key: null };
  if (anchorMs === null || subIntervalMs === null || !(subIntervalMs > 0)) return none;
  const msUntilDue = anchorMs + subIntervalMs - elapsedMs;
  const inCutoff = cutoffMs > 0 && elapsedMs >= periodMs - cutoffMs;
  return { due: msUntilDue <= 0 && !inCutoff, msUntilDue, spanMs: subIntervalMs, key: anchorMs };
}
