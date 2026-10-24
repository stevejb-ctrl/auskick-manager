// ─── Basketball suggesters ───────────────────────────────────
// The starting five, each sub-due batch, and the plan for the next
// period (.planning/BASKETBALL-PLAN.md). Pure: the caller hands in the
// replayed game and the season.
//
// Forked from soccer's suggest.ts rather than lifted into lib/live (the
// plan's "The lift" allows it when the lift is bigger than a fork): the
// pick is a short loop over each sport's own replay state, and
// basketball's rules (foul trouble, like-for-like, a ball handler on
// court, five named positions) change it more than they share it.
//
// The rules they keep, under every strategy:
//   - Equal time is the target: who plays is this game's minutes. The
//     kids on the bench longest come on for the kids on court longest,
//     and only when that evens their time. Total minutes always win: no
//     kid is kept off to even out a line or a position.
//   - A kid with fouls one short of fouling out comes off first (foul
//     trouble), and goes back on last.
//   - Nobody fouled out, hurt, lent or still sitting out comes on; no
//     sub takes off a kid held on (Keep on).
//   - Where kids play follows the strategy: anywhere (Equal minutes), the
//     line they're short of (Guards and forwards), their home line (Home
//     line), the position they're short of (All five positions), their
//     home position (Set positions). Season balance decides where, never
//     how much.
//   - Under Equal minutes, a kid tagged "ball handler" stays on court
//     while there is one to play.

import type { UnitTime } from "@/lib/playbook/seasonTime";
import { periodsOwed } from "@/lib/playbook/seasonBalance";
import {
  BASKETBALL_POSITION_DEFS,
  basketballCourtShape,
  basketballShapes,
} from "@/lib/sports/basketball";
import { basketballLineOf, basketballOnCourt, type BasketballLineup } from "@/lib/sports/basketball/lineup";
import { basketballCanPlay, basketballGameMs, type BasketballGameState } from "@/lib/sports/basketball/replay";
import {
  BASKETBALL_LINES,
  BASKETBALL_TWO_LINES,
  basketballLikeForLike,
  usesBasketballLines,
  usesBasketballPositions,
  type BasketballLine,
  type BasketballPosition,
  type BasketballShape,
  type BasketballStrategy,
} from "@/lib/sports/basketball/types";

/** Season balance, as How we play sets it. */
export interface BasketballSeasonBalance {
  /**
   * Season time per kid per unit: lines ("guard" / "forward") for the
   * line strategies, positions ("pg" … "c") for the position ones.
   */
  time: UnitTime;
  /** seasonBalanceWeight("basketball", strength); 0 = off. */
  weight: number;
  /** A period's length in ms (season debt is counted in periods). */
  periodMs: number;
}

/** How we play's roles, as the suggesters read them. */
export interface BasketballPrefs {
  /** Home line (Home line). */
  homeLine?: Record<string, "guard" | "forward">;
  /** Home position (Set positions). */
  homePosition?: Record<string, BasketballPosition>;
  /** Backup positions (Set positions). */
  alsoPositions?: Record<string, BasketballPosition[]>;
  /** Kids tagged "ball handler" (Equal minutes). */
  ballHandlers?: readonly string[];
  /** Lines a kid doesn't play (their "Plays as" leaves them out). */
  neverLine?: Record<string, readonly BasketballLine[]>;
  /** Positions a kid doesn't play. */
  neverPosition?: Record<string, readonly BasketballPosition[]>;
  /** Kids who play every minute the rules allow. */
  keepOn?: readonly string[];
}

/** A spot a kid doesn't play: outweighs every other term, so it's used only when nobody else can fill it. */
const NOT_PLAYED = -1000;

function playsSpot(prefs: BasketballPrefs | undefined, pid: string, line: BasketballLine, pos: BasketballPosition | null): boolean {
  if (line === "court") return true;
  if (prefs?.neverLine?.[pid]?.includes(line)) return false;
  return !(pos && prefs?.neverPosition?.[pid]?.includes(pos));
}

const keptOn = (prefs: BasketballPrefs | undefined, pid: string) => (prefs?.keepOn?.includes(pid) ? 0 : 1);

/** A suggested sub: the shape of the `swap` event it becomes. */
export interface BasketballSub {
  /** Null: into an empty spot, nobody off. */
  off_player_id: string | null;
  on_player_id: string;
  line: BasketballLine;
}

/** One place on court a kid can be seated in. */
interface Spot {
  line: BasketballLine;
  pos: BasketballPosition | null;
}

const POSITION_LINE: Record<BasketballPosition, "guard" | "forward"> = Object.fromEntries(
  BASKETBALL_POSITION_DEFS.map((p) => [p.key, p.line]),
) as Record<BasketballPosition, "guard" | "forward">;

/** Stable sort: a copy, ordered by `key` (compared in turn) ascending, ties in input order. */
function sortBy<T>(items: readonly T[], key: (item: T) => number | number[]): T[] {
  const cmp = (a: number[], b: number[]) => {
    for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) return a[j] - b[j];
    return 0;
  };
  return items
    .map((item, i) => {
      const k = key(item);
      return { item, i, k: Array.isArray(k) ? k : [k] };
    })
    .sort((a, b) => cmp(a.k, b.k) || a.i - b.i)
    .map((x) => x.item);
}

const seasonTotal = (season: BasketballSeasonBalance | undefined, pid: string) =>
  Object.values(season?.time[pid] ?? {}).reduce((s, ms) => s + ms, 0);

/** The shape a strategy plays at a size: court, the team's line shape, or 2–3 for positions. */
export function basketballShapeFor(
  strategy: BasketballStrategy,
  size: number,
  shapeId?: string | null,
): BasketballShape {
  if (!usesBasketballLines(strategy)) return basketballCourtShape(size);
  const shapes = basketballShapes(size);
  // Positions play 2 guards (1–2) and 3 forwards (3–5).
  if (usesBasketballPositions(strategy)) return shapes[0];
  return shapes.find((s) => s.id === shapeId) ?? shapes[0];
}

/** The spots a shape seats: lines with room, or the five positions. */
function spotsFor(strategy: BasketballStrategy, shape: BasketballShape): Spot[] {
  if (usesBasketballPositions(strategy) && shape.lines.guard + shape.lines.forward === 5) {
    return BASKETBALL_POSITION_DEFS.map((p) => ({ line: p.line, pos: p.key }));
  }
  const out: Spot[] = [];
  for (const line of ["guard", "forward", "court"] as const) {
    for (let i = 0; i < shape.lines[line]; i++) out.push({ line, pos: null });
  }
  return out;
}

/** Season debt per unit (line or position) for a kid, weighted (0 when off). */
function seasonTerm(season: BasketballSeasonBalance | undefined, units: readonly string[]) {
  const cache = new Map<string, Record<string, number>>();
  return (pid: string, unit: string): number => {
    if (!season || !(season.weight > 0)) return 0;
    let owed = cache.get(pid);
    if (!owed) {
      owed = periodsOwed({ byUnit: season.time[pid], units: [...units], periodMs: season.periodMs });
      cache.set(pid, owed);
    }
    return season.weight * (owed[unit] ?? 0);
  };
}

const POSITION_KEYS = BASKETBALL_POSITION_DEFS.map((p) => p.key);

/**
 * How much a kid suits a spot under the strategy: home line and home
 * position count most; then this game's time there (lines and positions
 * not yet played first); then season debt.
 */
function spotScore(
  strategy: BasketballStrategy,
  prefs: BasketballPrefs | undefined,
  season: BasketballSeasonBalance | undefined,
  gameLineMs: (pid: string, line: BasketballLine) => number,
  gamePosMs: (pid: string, pos: BasketballPosition) => number,
  periodMs: number,
) {
  const lineDebt = seasonTerm(season, BASKETBALL_TWO_LINES);
  const posDebt = seasonTerm(season, POSITION_KEYS);
  return (pid: string, spot: Spot): number => {
    if (spot.line === "court") return 0;
    let s = playsSpot(prefs, pid, spot.line, spot.pos) ? 0 : NOT_PLAYED;
    if (strategy === "preferred-line") {
      const home = prefs?.homeLine?.[pid];
      if (home) s += home === spot.line ? 4 : 0;
    }
    if (strategy === "set-positions" && spot.pos) {
      if (prefs?.homePosition?.[pid] === spot.pos) s += 6;
      else if (prefs?.alsoPositions?.[pid]?.includes(spot.pos)) s += 3;
      else if (prefs?.homePosition?.[pid] && POSITION_LINE[prefs.homePosition[pid]] === spot.line) s += 1;
    }
    if (spot.pos) {
      s += -gamePosMs(pid, spot.pos) / periodMs + posDebt(pid, spot.pos);
    } else {
      s += -gameLineMs(pid, spot.line) / periodMs + lineDebt(pid, spot.line);
    }
    return s;
  };
}

/**
 * The best way to give each kid a spot: the assignment with the highest
 * total score. Five on court is at most 120 ways, so every one is tried
 * (a greedy pick strands the last kid in the spot they just played);
 * ties go to the first found, kids and spots in order. Returns the spot
 * index for each kid, or -1 for kids beyond the spots.
 */
export function bestAssignment(
  kids: readonly string[],
  spots: readonly Spot[],
  score: (pid: string, spot: Spot) => number,
): number[] {
  const n = Math.min(kids.length, spots.length);
  const table = kids.slice(0, n).map((pid) => spots.map((spot) => score(pid, spot)));
  let best: number[] = [];
  let bestSum = -Infinity;
  const pick: number[] = [];
  const used = new Array<boolean>(spots.length).fill(false);
  const walk = (i: number, sum: number) => {
    if (i === n) {
      if (sum > bestSum + 1e-9) {
        bestSum = sum;
        best = [...pick];
      }
      return;
    }
    // Identical spots (two guards with no position) are one choice.
    const tried = new Set<string>();
    for (let j = 0; j < spots.length; j++) {
      if (used[j]) continue;
      const key = `${spots[j].line}:${spots[j].pos ?? ""}`;
      if (tried.has(key)) continue;
      tried.add(key);
      used[j] = true;
      pick.push(j);
      walk(i + 1, sum + table[i][j]);
      pick.pop();
      used[j] = false;
    }
  };
  walk(0, 0);
  return kids.map((_, i) => (i < n ? best[i] : -1));
}

/** Seat kids in spots by the best assignment; guards first, 1 to 5. */
function seat(
  kids: readonly string[],
  spots: readonly Spot[],
  score: (pid: string, spot: Spot) => number,
): { lines: Record<BasketballLine, string[]>; slots?: Record<string, BasketballPosition> } {
  const lines: Record<BasketballLine, string[]> = { guard: [], forward: [], court: [] };
  const withPositions = spots.some((s) => s.pos);
  const slots: Record<string, BasketballPosition> = {};
  const assigned = bestAssignment(kids, spots, score);
  const pool: string[] = [];
  kids.forEach((pid, i) => {
    const j = assigned[i];
    if (j < 0) {
      pool.push(pid);
      return;
    }
    lines[spots[j].line].push(pid);
    if (spots[j].pos) slots[pid] = spots[j].pos!;
  });
  // More kids than spots (it shouldn't happen): the forwards take them.
  lines[withPositions || spots.every((s) => s.line !== "court") ? "forward" : "court"].push(...pool);
  if (withPositions) {
    // Guards 1–2 and forwards 3–5 in number order on the court.
    const order = (pid: string) => POSITION_KEYS.indexOf(slots[pid]);
    lines.guard = sortBy(lines.guard, order);
    lines.forward = sortBy(lines.forward, order);
    return { lines, slots };
  }
  return { lines };
}

/** Keep a ball handler among `starters` (Equal minutes) when one is here to play. */
function withBallHandler(starters: string[], pool: readonly string[], prefs: BasketballPrefs | undefined): string[] {
  const handlers = prefs?.ballHandlers ?? [];
  if (handlers.length === 0 || starters.length === 0 || starters.some((p) => handlers.includes(p))) return starters;
  const handler = pool.find((p) => handlers.includes(p) && !starters.includes(p));
  if (!handler) return starters;
  return [...starters.slice(0, -1), handler];
}

// ─── The starting five ───────────────────────────────────────

export interface SuggestBasketballLineupInput {
  /** The game's players on court. */
  onCourtSize: number;
  strategy: BasketballStrategy;
  /** The team's line shape ("2-3" / "3-2"); the default otherwise. */
  shapeId?: string | null;
  /** Kids here today, in squad order. */
  players: readonly string[];
  prefs?: BasketballPrefs;
  season?: BasketballSeasonBalance;
}

export interface BasketballLineupSuggestion {
  lineup: BasketballLineup;
  shape: BasketballShape;
}

/**
 * The tip-off lineup. The kids with the most season minutes start on the
 * bench (everyone gets the same this game either way); spots by the
 * strategy and season debt. Fewer kids than the size: everyone plays.
 */
export function suggestBasketballLineup(input: SuggestBasketballLineupInput): BasketballLineupSuggestion {
  const { players, prefs, season, strategy } = input;
  const onCount = Math.min(input.onCourtSize, players.length);
  const shape = basketballShapeFor(strategy, onCount, input.shapeId);
  let starters = sortBy(players, (p) => [keptOn(prefs, p), seasonTotal(season, p)]).slice(0, onCount);
  if (strategy === "minutes") starters = withBallHandler(starters, players, prefs);
  const playing = new Set(starters);
  const ordered = players.filter((p) => playing.has(p));
  const periodMs = season?.periodMs ?? 600_000;
  const seated = seat(ordered, spotsFor(strategy, shape), spotScore(strategy, prefs, season, () => 0, () => 0, periodMs));
  return {
    shape,
    lineup: { lines: seated.lines, bench: players.filter((p) => !playing.has(p)), ...(seated.slots ? { slots: seated.slots } : {}) },
  };
}

// ─── Subs during a period ────────────────────────────────────

export interface SuggestBasketballSubsInput {
  /** The game so far: replayBasketballGame(events, { nowMs }) for the period in play. */
  state: BasketballGameState;
  /** Absolute game ms now (state.completedPeriodMs + the period's elapsed). */
  nowMs: number;
  strategy: BasketballStrategy;
  prefs?: BasketballPrefs;
  season?: BasketballSeasonBalance;
  /** Fouls that foul a kid out (the age group's foulOutAt). */
  foulOutAt: number;
  /**
   * A kid's minimum time on after coming on, and rest after going off,
   * before a sub moves them again. 0 or omitted = no guard.
   */
  minStintMs?: number;
  /**
   * Spots in each line on court (the live screen's shape): any left
   * empty (a kid hurt, fouled out or lent with nobody on) are filled
   * first.
   */
  spots?: Partial<Record<BasketballLine, number>>;
  /** At most this many subs in one batch; omitted = as many as even time. */
  maxSubs?: number;
}

/**
 * A sub-due batch: empty spots first, a bench kid on with nobody off
 * (round 3 edge cases, 24 Oct 2026: with 2 on court and 3 spots empty
 * the card said "Ruby → Archie", and following it cost Ruby 3:36);
 * then the bench, least time this game first, on for the
 * kids on court with the most (foul trouble first), while each sub evens
 * their time. Under Home line and Set positions a kid comes on only for
 * one in their line; otherwise the kids coming on are matched to the
 * spots being left by the strategy's score. Empty when no sub evens
 * time.
 */
export function suggestBasketballSubs(input: SuggestBasketballSubsInput): BasketballSub[] {
  const { state, nowMs, strategy, prefs, season, foulOutAt } = input;
  const lu = state.lineup;
  if (!lu) return [];
  const minStint = input.minStintMs ?? 0;
  const guard = minStint > 0;
  const game = (pid: string) => basketballGameMs(state, pid);
  const fouls = (pid: string) => state.fouls[pid] ?? 0;
  const trouble = (pid: string) => (foulOutAt > 1 && fouls(pid) >= foulOutAt - 1 ? 1 : 0);
  const justOff = (pid: string) => guard && state.lastSubbedOffMs[pid] !== undefined && nowMs - state.lastSubbedOffMs[pid] < minStint;
  const justOn = (pid: string) => guard && nowMs - (state.lastSubbedOnMs[pid] ?? 0) < minStint;
  const held = new Set(Object.entries(state.locks).filter(([, l]) => l.kind === "field").map(([pid]) => pid));
  const lineHold = (pid: string): BasketballLine | null => {
    const l = state.locks[pid];
    return l?.kind === "zone" && (BASKETBALL_TWO_LINES as readonly string[]).includes(l.zone) ? (l.zone as BasketballLine) : null;
  };

  const fit = lu.bench.filter((p) => basketballCanPlay(state, p, nowMs));
  const rested = fit.filter((p) => !justOff(p));
  // Bench kids who haven't rested wait while anyone else can come on;
  // kids in foul trouble come on last.
  const bench = sortBy(rested.length > 0 ? rested : fit, (p) => [trouble(p), keptOn(prefs, p), game(p)]);
  // Kids in foul trouble go off first; kids who just came on go off last.
  // Kids who play every minute stay on unless they're in foul trouble.
  const court = sortBy(
    basketballOnCourt(lu).filter((p) => !held.has(p) && (keptOn(prefs, p) === 1 || trouble(p) === 1)),
    (p) => [-trouble(p), justOn(p) ? 1 : 0, -game(p)],
  );

  const likeForLike = basketballLikeForLike(strategy);
  const homeLineOf = (pid: string): BasketballLine | null => {
    if (strategy === "preferred-line") return prefs?.homeLine?.[pid] ?? null;
    if (strategy === "set-positions") {
      const home = prefs?.homePosition?.[pid];
      return home ? POSITION_LINE[home] : null;
    }
    return null;
  };

  // Under Equal minutes, a ball handler stays on court: the last one on
  // goes off only for another.
  const handlers = new Set(strategy === "minutes" ? (prefs?.ballHandlers ?? []) : []);
  let handlersOn = basketballOnCourt(lu).filter((p) => handlers.has(p)).length;
  const keepsHandler = (off: string, on: string) => !handlers.has(off) || handlers.has(on) || handlersOn > 1;

  // Fill: empty spots, nobody off; a kid held to a line (or, like for
  // like, their home line) fills only there.
  const fills: BasketballSub[] = [];
  const filled = new Set<string>();
  // Only when the spots are the lineup's own kind (lines, or the court).
  const courtSpots = (input.spots?.court ?? 0) > 0;
  const sameKind = courtSpots
    ? lu.lines.guard.length + lu.lines.forward.length === 0
    : lu.lines.court.length === 0;
  for (const line of sameKind ? BASKETBALL_LINES : []) {
    for (let open = (input.spots?.[line] ?? 0) - lu.lines[line].length; open > 0; open--) {
      if (input.maxSubs !== undefined && fills.length >= input.maxSubs) break;
      const on = bench.find((p) => {
        if (filled.has(p)) return false;
        const only = lineHold(p) ?? (likeForLike ? homeLineOf(p) : null);
        return (!only || only === line) && playsSpot(prefs, p, line, null);
      });
      if (!on) break;
      filled.add(on);
      fills.push({ off_player_id: null, on_player_id: on, line });
      if (handlers.has(on)) handlersOn++;
    }
  }

  // Pair: who comes on for whom.
  const used = new Set<string>();
  const pairs: { on: string; off: string }[] = [];
  for (const on of bench) {
    if (input.maxSubs !== undefined && fills.length + pairs.length >= input.maxSubs) break;
    if (filled.has(on)) continue;
    const only = lineHold(on) ?? (likeForLike ? homeLineOf(on) : null);
    const plays = (p: string) => {
      const line = basketballLineOf(lu, p) as BasketballLine;
      return playsSpot(prefs, on, line, lu.slots?.[p] ?? null);
    };
    const off = court.find((p) => !used.has(p) && (!only || basketballLineOf(lu, p) === only) && plays(p) && keepsHandler(p, on));
    if (!off) continue;
    // Foul trouble comes off even when it doesn't even time; otherwise
    // only a sub that evens time.
    if (!(game(on) < game(off)) && !trouble(off)) continue;
    used.add(off);
    pairs.push({ on, off });
    if (handlers.has(off)) handlersOn--;
    if (handlers.has(on)) handlersOn++;
  }

  // Match the kids coming on to the spots being left. Like-for-like
  // pairs keep their line already; otherwise the best fit by score.
  if (!likeForLike && usesBasketballLines(strategy) && pairs.length > 1) {
    const periodMs = season?.periodMs ?? 600_000;
    const score = spotScore(
      strategy,
      prefs,
      season,
      (pid, line) => state.ms[pid]?.[line] ?? 0,
      (pid, pos) => state.posMs[pid]?.[pos] ?? 0,
      periodMs,
    );
    const offs = pairs.map((p) => p.off);
    const spots = offs.map((off) => ({ line: basketballLineOf(lu, off) as BasketballLine, pos: lu.slots?.[off] ?? null }));
    const ons = pairs.map((p) => p.on);
    const assigned = bestAssignment(ons, spots, score);
    pairs.splice(0, pairs.length, ...ons.map((on, i) => ({ on, off: offs[assigned[i]] })));
  }

  return [...fills, ...pairs.map((p) => ({ off_player_id: p.off, on_player_id: p.on, line: basketballLineOf(lu, p.off) as BasketballLine }))];
}

// ─── The next period ─────────────────────────────────────────

export interface SuggestBasketballBreakInput {
  /** The game to the break: replayBasketballGame(events) after the period's quarter_end. */
  state: BasketballGameState;
  onCourtSize: number;
  strategy: BasketballStrategy;
  /** The team's line shape: it carries from one period to the next. */
  shapeId?: string | null;
  prefs?: BasketballPrefs;
  season?: BasketballSeasonBalance;
}

/**
 * The next period's lineup: who plays (the least time this game first,
 * then season minutes), and where (by the strategy: lines and positions
 * not played this game first, then season debt). Kids who can't play
 * (fouled out, hurt, lent, still sitting out) stay on the bench, after
 * everyone who can. Null before there's a lineup.
 */
export function suggestBasketballBreakPlan(input: SuggestBasketballBreakInput): BasketballLineupSuggestion | null {
  const { state, prefs, season, strategy } = input;
  const lu = state.lineup;
  if (!lu) return null;
  const squad = [...basketballOnCourt(lu), ...lu.bench];
  const start = state.completedPeriodMs;
  const here = squad.filter((p) => basketballCanPlay(state, p, start));
  const out = squad.filter((p) => !here.includes(p));
  const onCount = Math.min(input.onCourtSize, here.length);
  const shape = basketballShapeFor(strategy, onCount, input.shapeId);
  let starters = sortBy(here, (p) => [keptOn(prefs, p), basketballGameMs(state, p), seasonTotal(season, p)]).slice(0, onCount);
  if (strategy === "minutes") starters = withBallHandler(starters, here, prefs);
  const playing = new Set(starters);
  const periodMs = season?.periodMs ?? (state.periodElapsedMs || 600_000);
  const seated = seat(
    here.filter((p) => playing.has(p)),
    spotsFor(strategy, shape),
    spotScore(
      strategy,
      prefs,
      season,
      (pid, line) => state.ms[pid]?.[line] ?? 0,
      (pid, pos) => state.posMs[pid]?.[pos] ?? 0,
      periodMs,
    ),
  );
  return {
    shape,
    lineup: {
      lines: seated.lines,
      bench: [...here.filter((p) => !playing.has(p)), ...out],
      ...(seated.slots ? { slots: seated.slots } : {}),
    },
  };
}
