// ─── Touch family suggesters ─────────────────────────────────
// The starting side, each sub-due batch, and the plan for the next half
// (.planning/FOUR-SPORTS-PLAN.md, "What the touch family owns"). Pure:
// the caller hands in the replayed game and the season. The sub pick
// goes through the shared lib/live/rollingSubs.ts.
//
// The rules they keep, under every strategy:
//   - Equal time is the target: who plays is this game's minutes. The
//     kids on the bench longest come on for the kids on the field
//     longest, and only when that evens their time. Total minutes always
//     win: no kid is kept off to even out a lane.
//   - A mixed team keeps to its rule (lib/sports/touch/mixed.ts): the
//     starting side and every suggested sub. Fair time is evened within
//     each group, so a girl comes on for a girl and a boy for a boy; at
//     the cap that's the rule anyway. A side a hand sub took outside the
//     rule is put back first. Short of girls, the side is what the rule
//     allows.
//   - Nobody hurt or lent comes on; no sub takes off a kid held on.
//   - Where kids play follows the strategy: anywhere (Minutes only), the
//     lane they're short of (Rotate positions), their home lane (Home
//     position). Season balance decides where, never how much.

import type { MixedGroup } from "@/lib/types";
import type { UnitTime } from "@/lib/playbook/seasonTime";
import { periodsOwed } from "@/lib/playbook/seasonBalance";
import { compositionFixes, suggestRollingSubs, sortByKeys, type RollingSub, type RollingSubsInput } from "@/lib/live/rollingSubs";
import { touchLineOf, touchOnField, type TouchLineup } from "@/lib/sports/touch/lineup";
import {
  countMixedGroups,
  mixedConstraints,
  mixedFieldPlan,
  mixedTags,
  type MixedFieldPlan,
} from "@/lib/sports/touch/mixed";
import { touchCanPlay, touchGameMs, type TouchGameState } from "@/lib/sports/touch/replay";
import {
  TOUCH_LANES,
  TOUCH_LINES,
  type MixedRule,
  type TouchAgeGroupConfig,
  type TouchLine,
  type TouchShape,
  type TouchStrategy,
} from "@/lib/sports/touch/types";

/** Season balance, as How we play sets it. */
export interface TouchSeasonBalance {
  /** Season time per kid per lane ("middle" / "link" / "wing"). */
  time: UnitTime;
  /** seasonBalanceWeight(sport, strength); 0 = off. */
  weight: number;
  /** A period's length in ms (season debt is counted in periods). */
  periodMs: number;
}

/** How we play's roles, as the suggesters read them. */
export interface TouchPrefs {
  /** Home lane (Home position). */
  homeLane?: Record<string, TouchLine>;
  /** Lanes a kid doesn't play (their "Plays as" leaves them out). */
  neverLane?: Record<string, readonly TouchLine[]>;
  /** Kids who play every minute the rules allow. */
  keepOn?: readonly string[];
}

/** A mixed team's rule and who each kid counts as. */
export interface TouchMixed {
  rule: MixedRule;
  groupOf: (playerId: string) => MixedGroup | null | undefined;
}

/** A suggested sub: the shape of the `swap` event it becomes. */
export interface TouchSub {
  /** Null: into an empty place, nobody off. */
  off_player_id: string | null;
  on_player_id: string;
  line: TouchLine;
}

/** Whether a strategy plays in lanes. */
export function usesTouchLanes(strategy: TouchStrategy): boolean {
  return strategy !== "minutes";
}

/** A lane a kid doesn't play: outweighs every other term, so it's used only when nobody else can fill it. */
const NOT_PLAYED = -1000;

const keptOn = (prefs: TouchPrefs | undefined, pid: string) => (prefs?.keepOn?.includes(pid) ? 0 : 1);
const seasonTotal = (season: TouchSeasonBalance | undefined, pid: string) =>
  Object.values(season?.time[pid] ?? {}).reduce((s, ms) => s + ms, 0);

/** Minutes only: everyone on the field, no lanes. */
export function touchFieldShape(players: number): TouchShape {
  return { id: "field", lines: { middle: 0, link: 0, wing: 0, field: players } };
}

/**
 * The shape a strategy plays at a size: the field (Minutes only), or
 * the age group's lanes at that size (the team's shape when it plays
 * one there). A size outside the age's range takes the nearest.
 */
export function touchShapeFor(
  ageGroup: TouchAgeGroupConfig,
  strategy: TouchStrategy,
  size: number,
  shapeId?: string | null,
): TouchShape {
  if (!usesTouchLanes(strategy)) return touchFieldShape(size);
  const sizes = Object.keys(ageGroup.shapes).map(Number).sort((a, b) => a - b);
  const n = sizes.reduce((best, s) => (Math.abs(s - size) < Math.abs(best - size) ? s : best), sizes[0]);
  const shapes = ageGroup.shapes[n] ?? [];
  return shapes.find((s) => s.id === shapeId) ?? shapes[0] ?? touchFieldShape(size);
}

/** The shape a lineup plays ("2-2-2"), from its lane counts; null for Minutes only. */
export function touchShapeIdOf(lineup: TouchLineup | null): string | null {
  if (!lineup || lineup.lines.field.length > 0) return null;
  const { middle, link, wing } = lineup.lines;
  return `${middle.length}-${link.length}-${wing.length}`;
}

/** The places a shape seats, one per kid. */
function spotsFor(shape: TouchShape): TouchLine[] {
  const out: TouchLine[] = [];
  for (const line of TOUCH_LINES) for (let i = 0; i < shape.lines[line]; i++) out.push(line);
  return out;
}

/** Season debt per lane for a kid, weighted (0 when off). */
function seasonTerm(season: TouchSeasonBalance | undefined) {
  const cache = new Map<string, Record<string, number>>();
  return (pid: string, lane: TouchLine): number => {
    if (!season || !(season.weight > 0)) return 0;
    let owed = cache.get(pid);
    if (!owed) {
      owed = periodsOwed({ byUnit: season.time[pid], units: [...TOUCH_LANES], periodMs: season.periodMs });
      cache.set(pid, owed);
    }
    return season.weight * (owed[lane] ?? 0);
  };
}

/**
 * How much a kid suits a lane under the strategy: a home lane counts
 * most (Home position); then this game's time there (lanes not yet
 * played first); then season debt.
 */
function laneScore(
  strategy: TouchStrategy,
  prefs: TouchPrefs | undefined,
  season: TouchSeasonBalance | undefined,
  gameLaneMs: (pid: string, lane: TouchLine) => number,
  periodMs: number,
) {
  const debt = seasonTerm(season);
  return (pid: string, lane: TouchLine): number => {
    if (lane === "field") return 0;
    let s = prefs?.neverLane?.[pid]?.includes(lane) ? NOT_PLAYED : 0;
    if (strategy === "home-position" && prefs?.homeLane?.[pid] === lane) s += 4;
    return s - gameLaneMs(pid, lane) / periodMs + debt(pid, lane);
  };
}

/**
 * The best way to give each kid a lane: the assignment with the highest
 * total score, every distinct one tried (identical places in a lane are
 * one choice, so 8 a side is at most a few hundred). Ties go to the
 * first found. Returns each kid's spot index, or -1 beyond the spots.
 */
export function bestLaneAssignment(
  kids: readonly string[],
  spots: readonly TouchLine[],
  score: (pid: string, lane: TouchLine) => number,
): number[] {
  const n = Math.min(kids.length, spots.length);
  const table = kids.slice(0, n).map((pid) => spots.map((lane) => score(pid, lane)));
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
    const tried = new Set<TouchLine>();
    for (let j = 0; j < spots.length; j++) {
      if (used[j] || tried.has(spots[j])) continue;
      tried.add(spots[j]);
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

/** Seat kids in a shape's lanes by the best assignment, in squad order within a lane. */
function seat(kids: readonly string[], shape: TouchShape, score: (pid: string, lane: TouchLine) => number) {
  const lines: Record<TouchLine, string[]> = { middle: [], link: [], wing: [], field: [] };
  const spots = spotsFor(shape);
  const assigned = bestLaneAssignment(kids, spots, score);
  const extra: string[] = [];
  kids.forEach((pid, i) => {
    const j = assigned[i];
    if (j < 0) extra.push(pid);
    else lines[spots[j]].push(pid);
  });
  // More kids than places (it shouldn't happen): the field (or links) take them.
  lines[shape.lines.field > 0 ? "field" : "link"].push(...extra);
  return lines;
}

/**
 * Who plays: the side's size, and its kids in order of `rank`. A mixed
 * team fields what its rule allows, each group's places to that group's
 * kids; otherwise the first `size` kids.
 */
function pickSide(
  here: readonly string[],
  size: number,
  rank: (pid: string) => number[],
  mixed: TouchMixed | undefined,
): { starters: string[]; plan: MixedFieldPlan | null } {
  if (!mixed) {
    return { starters: sortByKeys(here, rank).slice(0, Math.min(size, here.length)), plan: null };
  }
  const plan = mixedFieldPlan(mixed.rule, size, countMixedGroups(here, mixed.groupOf));
  const of = (group: MixedGroup | null, n: number) =>
    sortByKeys(
      here.filter((p) => (mixed.groupOf(p) ?? null) === group),
      rank,
    ).slice(0, n);
  return { starters: [...of("boy", plan.boys), ...of("girl", plan.girls), ...of(null, plan.unknown)], plan };
}

export interface TouchLineupSuggestion {
  lineup: TouchLineup;
  shape: TouchShape;
  /** A mixed team's side: how many boys and girls, and whether it's short. */
  plan: MixedFieldPlan | null;
}

// ─── The starting side ───────────────────────────────────────

export interface SuggestTouchLineupInput {
  ageGroup: TouchAgeGroupConfig;
  /** The game's players on the field. */
  onFieldSize: number;
  strategy: TouchStrategy;
  /** The team's lane shape; the default otherwise. */
  shapeId?: string | null;
  /** Kids here today, in squad order. */
  players: readonly string[];
  prefs?: TouchPrefs;
  season?: TouchSeasonBalance;
  mixed?: TouchMixed;
}

/**
 * The starting side. The kids with the most season minutes start on the
 * bench (everyone gets the same this game either way), within each
 * group on a mixed team; lanes by the strategy and season debt.
 */
export function suggestTouchLineup(input: SuggestTouchLineupInput): TouchLineupSuggestion {
  const { players, prefs, season, strategy, mixed } = input;
  const { starters, plan } = pickSide(players, input.onFieldSize, (p) => [keptOn(prefs, p), seasonTotal(season, p)], mixed);
  const playing = new Set(starters);
  const ordered = players.filter((p) => playing.has(p));
  const shape = touchShapeFor(input.ageGroup, strategy, ordered.length, input.shapeId);
  const periodMs = season?.periodMs ?? input.ageGroup.periodSeconds * 1000;
  const lines = seat(ordered, shape, laneScore(strategy, prefs, season, () => 0, periodMs));
  return { shape, plan, lineup: { lines, bench: players.filter((p) => !playing.has(p)) } };
}

// ─── Subs during a half ──────────────────────────────────────

export interface SuggestTouchSubsInput {
  /** The game so far: replayTouchGame(events, { nowMs }) for the period in play. */
  state: TouchGameState;
  /** Absolute game ms now (state.completedPeriodMs + the period's elapsed). */
  nowMs: number;
  strategy: TouchStrategy;
  prefs?: TouchPrefs;
  season?: TouchSeasonBalance;
  mixed?: TouchMixed;
  /**
   * A kid's minimum time on after coming on, and rest after going off,
   * before a sub moves them again. 0 or omitted = no guard.
   */
  minStintMs?: number;
  /**
   * The cool-down after going off: a kid who went off less than this long
   * ago isn't brought back on (the live game passes one sub interval). 0
   * or omitted = none.
   */
  restMs?: number;
  /**
   * Places in each lane on the field now (the live screen's): any left
   * empty (a kid hurt with nobody on) are filled first.
   */
  spots?: Partial<Record<TouchLine, number>>;
  /** At most this many subs in one batch; omitted = as many as even time. */
  maxSubs?: number;
}

/**
 * A sub-due batch through the shared rolling-sub pick: the bench, least
 * time this game first, on for the kids on the field with the most,
 * while each sub evens their time. A mixed team's kids come on for
 * their own group and never break the rule; a side that already breaks
 * it (a hand sub put a fourth boy on) is fixed first, a girl on for the
 * boy on longest, before anything evens time. A lane hold keeps a kid to
 * their lane; Home position brings a kid on into their home lane when
 * that evens time too; under Rotate positions the kids coming on are
 * matched to the lanes being left by this game's lanes and season debt.
 */
const laneHoldOf = (state: TouchGameState) => (pid: string): TouchLine | null => {
  const l = state.locks[pid];
  return l?.kind === "zone" && (TOUCH_LANES as readonly string[]).includes(l.zone) ? (l.zone as TouchLine) : null;
};
const poolOfFor = (mixed: TouchMixed | undefined) => (pid: string) => mixed?.groupOf(pid) ?? "none";

/** The game now as the shared rolling-sub pick reads it. */
function touchRollingInput(input: SuggestTouchSubsInput, lu: TouchLineup): RollingSubsInput<TouchLine> {
  const { state, nowMs, strategy, prefs, mixed } = input;
  const minStint = input.minStintMs ?? 0;
  const guard = minStint > 0;
  return {
    field: touchOnField(lu).map((id) => ({ id, line: touchLineOf(lu, id) as TouchLine })),
    bench: lu.bench.filter((p) => touchCanPlay(state, p)),
    gameMs: (p) => touchGameMs(state, p),
    held: (p) => state.locks[p]?.kind === "field",
    keepOn: (p) => keptOn(prefs, p) === 0,
    onlyLine: laneHoldOf(state),
    preferLine: strategy === "home-position" ? (p) => prefs?.homeLane?.[p] ?? null : undefined,
    plays: (p, line) => line === "field" || !prefs?.neverLane?.[p]?.includes(line),
    ...(mixed ? { tags: mixedTags(mixed.groupOf), constraints: mixedConstraints(mixed.rule), pool: poolOfFor(mixed) } : {}),
    justOn: (p) => guard && nowMs - (state.lastSubbedOnMs[p] ?? 0) < minStint,
    justOff: (p) => guard && state.lastSubbedOffMs[p] !== undefined && nowMs - state.lastSubbedOffMs[p] < minStint,
    resting: (p) => (input.restMs ?? 0) > 0 && state.lastSubbedOffMs[p] !== undefined && nowMs - state.lastSubbedOffMs[p] < (input.restMs ?? 0),
    open: TOUCH_LINES.flatMap((l) => Array.from({ length: Math.max(0, (input.spots?.[l] ?? 0) - lu.lines[l].length) }, () => l)),
    maxSubs: input.maxSubs,
  };
}

const asTouchSub = (s: RollingSub<TouchLine>): TouchSub => ({ off_player_id: s.off, on_player_id: s.on, line: s.line });

/** How a mixed side that breaks its rule gets back inside it. */
export interface TouchMixFix {
  /** Subs first: a girl on for the boy on longest, or a boy for a girl when there's no boy on. */
  subs: TouchSub[];
  /**
   * Still over the boys' cap with nobody on the bench to swap in: the
   * boys to take off with no replacement, the one on longest first, so
   * the side plays short at the size the rule allows.
   */
  off: string[];
}

/**
 * The fix for a mixed side that breaks its rule (a hand sub put a
 * fourth boy on). Round 2 usability, 24 Oct 2026 (Oztag): after a girl
 * was hurt and the only bench girl came on, 5 boys stayed on with no
 * fix offered, though the banner said the side could field 6. Empty when
 * the side keeps the rule, nobody can fix it, or the team isn't mixed.
 */
export function touchMixFix(input: SuggestTouchSubsInput): TouchMixFix {
  const lu = input.state.lineup;
  if (!lu || !input.mixed) return { subs: [], off: [] };
  const { rule, groupOf } = input.mixed;
  const subs = compositionFixes(touchRollingInput(input, lu)).map(asTouchSub);
  const onField = new Set(touchOnField(lu));
  for (const s of subs) {
    if (s.off_player_id) onField.delete(s.off_player_id);
    onField.add(s.on_player_id);
  }
  const boys = Array.from(onField).filter((p) => groupOf(p) === "boy");
  const over = boys.length - rule.maxBoys;
  if (over <= 0) return { subs, off: [] };
  // The boy on longest goes; one held on or kept on only if no other can.
  const stays = (p: string) => (input.state.locks[p]?.kind === "field" || keptOn(input.prefs, p) === 0 ? 1 : 0);
  const order = sortByKeys(boys, (p) => [stays(p), -touchGameMs(input.state, p)]);
  return { subs, off: order.slice(0, over) };
}

export function suggestTouchSubs(input: SuggestTouchSubsInput): TouchSub[] {
  const { state, strategy, prefs, season, mixed } = input;
  const lu = state.lineup;
  if (!lu) return [];
  const laneHold = laneHoldOf(state);
  const poolOf = poolOfFor(mixed);
  const rolling = touchRollingInput(input, lu);
  const subs = suggestRollingSubs<TouchLine>(rolling);
  // A side that breaks the mixed rule is fixed first: those subs lead
  // the batch, and stay as they are.
  const fixCount = mixed ? compositionFixes(rolling).length : 0;

  // Rotate positions: match the kids coming on to the lanes being left,
  // within each group so every pair still keeps the mixed rule alone.
  if (strategy === "rotate-positions" && subs.length - fixCount > 1) {
    const periodMs = season?.periodMs ?? (state.periodElapsedMs || 20 * 60_000);
    const score = laneScore(strategy, prefs, season, (pid, lane) => state.ms[pid]?.[lane] ?? 0, periodMs);
    const pools = Array.from(new Set(subs.slice(fixCount).map((s) => poolOf(s.on))));
    for (const pool of pools) {
      const idx = subs
        .map((s, i) => (i >= fixCount && s.off !== null && poolOf(s.on) === pool && !laneHold(s.on) ? i : -1))
        .filter((i) => i >= 0);
      if (idx.length < 2) continue;
      const ons = idx.map((i) => subs[i].on);
      const lanes = idx.map((i) => subs[i].line);
      const offs = idx.map((i) => subs[i].off);
      const assigned = bestLaneAssignment(ons, lanes, score);
      idx.forEach((i, k) => {
        subs[i] = { on: ons[k], off: offs[assigned[k]], line: lanes[assigned[k]] };
      });
    }
  }

  return subs.map(asTouchSub);
}

// ─── The next half ───────────────────────────────────────────

export interface SuggestTouchBreakInput {
  /** The game to the break: replayTouchGame(events) after the period's quarter_end. */
  state: TouchGameState;
  ageGroup: TouchAgeGroupConfig;
  /** The game's players on the field (its format, before any shrink). */
  onFieldSize: number;
  strategy: TouchStrategy;
  /** The team's lane shape: it carries from one half to the next. */
  shapeId?: string | null;
  prefs?: TouchPrefs;
  season?: TouchSeasonBalance;
  mixed?: TouchMixed;
}

/**
 * The next half's side: who plays (the least time this game first, then
 * season minutes, within each group on a mixed team), and where (by the
 * strategy: lanes not played this game first, then season debt). A
 * mixed team short of girls fields what its rule allows. Kids who can't
 * play stay on the bench, after everyone who can. Null before there's a
 * lineup.
 */
export function suggestTouchBreakPlan(input: SuggestTouchBreakInput): TouchLineupSuggestion | null {
  const { state, prefs, season, strategy, mixed } = input;
  const lu = state.lineup;
  if (!lu) return null;
  const squad = [...touchOnField(lu), ...lu.bench];
  const here = squad.filter((p) => touchCanPlay(state, p));
  const out = squad.filter((p) => !here.includes(p));
  const { starters, plan } = pickSide(
    here,
    input.onFieldSize,
    (p) => [keptOn(prefs, p), touchGameMs(state, p), seasonTotal(season, p)],
    mixed,
  );
  const playing = new Set(starters);
  const ordered = here.filter((p) => playing.has(p));
  const shape = touchShapeFor(input.ageGroup, strategy, ordered.length, input.shapeId);
  const periodMs = season?.periodMs ?? (state.periodElapsedMs || input.ageGroup.periodSeconds * 1000);
  const lines = seat(ordered, shape, laneScore(strategy, prefs, season, (pid, lane) => state.ms[pid]?.[lane] ?? 0, periodMs));
  return {
    shape,
    plan,
    lineup: { lines, bench: [...here.filter((p) => !playing.has(p)), ...out] },
  };
}

/**
 * The field's size a mixed team can play now, from the kids who can
 * play (`available`): the game's size, or fewer when the rule can't
 * fill it. A team that isn't mixed plays the game's size.
 */
export function touchFieldPlan(
  gameSize: number,
  available: readonly string[],
  mixed: TouchMixed | undefined,
): MixedFieldPlan | null {
  if (!mixed) return null;
  return mixedFieldPlan(mixed.rule, gameSize, countMixedGroups(available, mixed.groupOf));
}
