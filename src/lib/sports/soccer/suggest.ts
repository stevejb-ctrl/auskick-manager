// ─── Football (soccer) suggesters ────────────────────────────
// The starting lineup, the next rolling sub, a sub window's batch and
// the half-time plan (.planning/SOCCER-PLAN.md). Pure: the caller hands
// in the replayed game and the season.
//
// The rules they keep:
//   - Equal time is the target: who plays is this game's minutes. The
//     kid on the bench longest comes on for the kid on the field longest,
//     and only when that evens their time.
//   - The keeper is a slot, held for the half: no sub ever takes the
//     keeper off, and rolling subs fill outfield lines only. Nor does a
//     sub take off a kid held on (Keep on, Keep in goal).
//   - Season balance decides where kids play, never how much: the shape's
//     lines go to the kids owed time there (lib/playbook/seasonBalance),
//     after the lines they haven't played this game.
//   - At half-time the next keeper comes from keeper.ts, and under
//     "Everyone has a turn" last half's keeper plays out in the field.

import type { UnitTime } from "@/lib/playbook/seasonTime";
import { periodsOwed } from "@/lib/playbook/seasonBalance";
import { subDueBoundariesMs } from "@/lib/live/subDistribution";
import { soccerFormations } from "@/lib/sports/soccer";
import { pickSoccerKeeper, type SoccerKeeperPrefs } from "@/lib/sports/soccer/keeper";
import { soccerOnField, soccerOutfield, soccerUnitOf, type SoccerLineup } from "@/lib/sports/soccer/lineup";
import { soccerGameMs, type SoccerGameState } from "@/lib/sports/soccer/replay";
import {
  SOCCER_LINES,
  SOCCER_OUTFIELD_LINES,
  type SoccerAgeGroupConfig,
  type SoccerFormation,
  type SoccerKeeperStrategy,
  type SoccerLine,
  type SoccerSubMode,
  type SoccerUnit,
} from "@/lib/sports/soccer/types";

/** Season balance, as How we play sets it. */
export interface SoccerSeasonBalance {
  /** Season time per kid per unit: seasonTimeByUnit(sport, …, "line"). */
  time: UnitTime;
  /** seasonBalanceWeight(sport, strength); 0 = off. */
  weight: number;
  /** A half's length in ms (season debt is counted in halves). */
  periodMs: number;
}

/** A suggested sub: the shape of the `swap` event it becomes. */
export interface SoccerSub {
  /** Null: into an empty spot (the goal, or one on the field), nobody off. */
  off_player_id: string | null;
  on_player_id: string;
  /** The line the kid comes on in; "gk" only to fill an empty goal. */
  line: SoccerUnit;
}

const seasonTotal = (season: SoccerSeasonBalance | undefined, pid: string) =>
  Object.values(season?.time[pid] ?? {}).reduce((s, ms) => s + ms, 0);

/**
 * The age group's shape at a size: the team's pick, else the first (the
 * default first) with a line every kid here plays. Futsal's 2-2 has no
 * wings, so a "Plays as: Wings" kid was put up front (audit, 23 Oct
 * 2026); the diamond has wings. Every kid, not just the starters: rolling
 * subs bring a kid on only for a line they play. Nothing fits: the default.
 */
function shapeFor(
  ag: SoccerAgeGroupConfig,
  size: number,
  formationId: string | null | undefined,
  fit?: { players: readonly string[]; prefs?: SoccerKeeperPrefs },
): SoccerFormation {
  const shapes = soccerFormations(ag, size);
  const picked = shapes.find((f) => f.id === formationId);
  if (picked) return picked;
  const fits = (f: SoccerFormation) =>
    !f.keeper ||
    (fit?.players ?? []).every((pid) => SOCCER_OUTFIELD_LINES.some((l) => f.lines[l] > 0 && playsLine(fit?.prefs, pid, l)));
  return shapes.find(fits) ?? shapes[0];
}

/** Keeper strategy in force: none at 4 a side, else the team's or the age group's. */
function keeperStrategyFor(ag: SoccerAgeGroupConfig, team: SoccerKeeperStrategy | undefined): SoccerKeeperStrategy {
  if (ag.keeper === "none") return "none";
  return team && team !== "none" ? team : ag.keeper;
}

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

/**
 * Seat outfield kids in the shape's lines: repeatedly the kid and line
 * with the best score, ties to the earlier kid, then the line further
 * back (defence first). No lines (4 a side): everyone in the field.
 */
function seatLines(
  kids: readonly string[],
  formation: SoccerFormation,
  score: (pid: string, line: SoccerLine) => number,
): Record<SoccerLine, string[]> {
  const out: Record<SoccerLine, string[]> = { def: [], mid: [], att: [], field: [] };
  if (!formation.keeper) {
    out.field = [...kids];
    return out;
  }
  const room = { ...formation.lines };
  const pool = [...kids];
  while (pool.length > 0) {
    let best: { i: number; line: SoccerLine; s: number } | null = null;
    for (let i = 0; i < pool.length; i++) {
      for (const line of SOCCER_OUTFIELD_LINES) {
        if (room[line] <= 0) continue;
        const s = score(pool[i], line);
        if (!best || s > best.s + 1e-9) best = { i, line, s };
      }
    }
    if (!best) break;
    const { i, line } = best;
    out[line].push(pool[i]);
    room[line]--;
    pool.splice(i, 1);
  }
  // More kids than the shape holds (it shouldn't happen): attack takes them.
  out.att.push(...pool);
  return out;
}

/** A line a kid's "Plays as" leaves out: outweighs every other term, used only when nobody else can fill it. */
const NOT_PLAYED = -1000;
const playsLine = (prefs: SoccerKeeperPrefs | undefined, pid: string, line: SoccerLine) =>
  !(prefs?.notInLine?.[pid]?.includes(line));
const withPlays = (prefs: SoccerKeeperPrefs | undefined, score: (pid: string, line: SoccerLine) => number) =>
  (pid: string, line: SoccerLine) => score(pid, line) + (playsLine(prefs, pid, line) ? 0 : NOT_PLAYED);

/** Season debt per line for a kid, weighted (0 when balance is off). */
function seasonTerm(season: SoccerSeasonBalance | undefined) {
  const cache = new Map<string, Record<string, number>>();
  return (pid: string, line: SoccerLine): number => {
    if (!season || !(season.weight > 0)) return 0;
    let owed = cache.get(pid);
    if (!owed) {
      owed = periodsOwed({ byUnit: season.time[pid], units: [...SOCCER_OUTFIELD_LINES], periodMs: season.periodMs });
      cache.set(pid, owed);
    }
    return season.weight * (owed[line] ?? 0);
  };
}

// ─── The starting lineup ─────────────────────────────────────

export interface SuggestSoccerLineupInput {
  ageGroup: SoccerAgeGroupConfig;
  /** The game's players on the field. */
  onFieldSize: number;
  /** The team's shape (How we play); the age group's default otherwise. */
  formationId?: string | null;
  /** Kids here today, in squad order. */
  players: readonly string[];
  /** The team's keeper strategy (How we play); the age group's otherwise. */
  keeperStrategy?: SoccerKeeperStrategy;
  prefs?: SoccerKeeperPrefs;
  season?: SoccerSeasonBalance;
}

export interface SoccerLineupSuggestion {
  lineup: SoccerLineup;
  formation: SoccerFormation;
}

/**
 * The kick-off lineup, in the team's shape or, with none picked, the
 * first that fits every kid's "Plays as". The keeper by the team's
 * strategy (season keeper minutes); the kids with the most season
 * minutes start on the bench (everyone gets the same this game either
 * way); lines by season debt.
 * Fewer kids than the size: everyone plays, in the shape for that many.
 */
export function suggestSoccerLineup(input: SuggestSoccerLineupInput): SoccerLineupSuggestion {
  const { ageGroup: ag, players, prefs, season } = input;
  const onCount = Math.min(input.onFieldSize, players.length);
  const formation = shapeFor(ag, onCount, input.formationId, { players, prefs });
  const keeper = formation.keeper
    ? pickSoccerKeeper({
        strategy: keeperStrategyFor(ag, input.keeperStrategy),
        candidates: players,
        prefs,
        keeperMs: Object.fromEntries(players.map((p) => [p, season?.time[p]?.gk ?? 0])),
      })
    : null;
  const rest = players.filter((p) => p !== keeper);
  const starters = sortBy(rest, (p) => seasonTotal(season, p)).slice(0, onCount - (keeper ? 1 : 0));
  const playing = new Set(starters);
  const order = (ids: string[]) => rest.filter((p) => ids.includes(p));
  return {
    formation,
    lineup: {
      keeper,
      lines: seatLines(order(starters), formation, withPlays(prefs, seasonTerm(season))),
      bench: rest.filter((p) => !playing.has(p)),
    },
  };
}

// ─── Subs during a half ──────────────────────────────────────

export interface SuggestSoccerSubInput {
  /** The game so far: replaySoccerGame(events, { nowMs }) for the half in play. */
  state: SoccerGameState;
  /** Absolute game ms now (state.completedPeriodMs + the half's elapsed). */
  nowMs: number;
  /**
   * A kid's minimum time on after coming on, and rest after going off,
   * before a rolling sub moves them again. 0 or omitted = no guard.
   */
  minStintMs?: number;
  /**
   * The cool-down after going off: a kid who went off less than this long
   * ago isn't brought back on (round 2 usability, 24 Oct 2026: after
   * Mateo → Ollie the card at once had Mateo back on). 0 or omitted = none.
   */
  restMs?: number;
  /** The kids' roles: a kid comes on only for a line they play. */
  prefs?: SoccerKeeperPrefs;
  /**
   * The shape on the field now (the live screen's): whether it plays a
   * keeper, and the places in each line. Any left empty are filled first.
   */
  spots?: { keeper: boolean; lines: Partial<Record<SoccerLine, number>> };
}

/** Who may come on, who may go off, and how long each has played. */
function subPools(state: SoccerGameState, nowMs: number, minStintMs: number, restMs = 0) {
  const lu = state.lineup;
  if (!lu) return null;
  const away = new Set([...state.injuredIds, ...state.loanedIds]);
  const held = new Set(
    Object.entries(state.locks)
      .filter(([, l]) => l.kind === "field" || (l.kind === "position" && l.position === "gk"))
      .map(([pid]) => pid),
  );
  const zoneHold = (pid: string): SoccerLine | null => {
    const l = state.locks[pid];
    return l?.kind === "zone" && (SOCCER_LINES as readonly string[]).includes(l.zone) ? (l.zone as SoccerLine) : null;
  };
  const game = (pid: string) => soccerGameMs(state, pid);
  const guard = minStintMs > 0;
  const justOff = (pid: string) => guard && state.lastSubbedOffMs[pid] !== undefined && nowMs - state.lastSubbedOffMs[pid] < minStintMs;
  const justOn = (pid: string) => guard && nowMs - (state.lastSubbedOnMs[pid] ?? 0) < minStintMs;

  const resting = (pid: string) =>
    restMs > 0 && state.lastSubbedOffMs[pid] !== undefined && nowMs - state.lastSubbedOffMs[pid] < restMs;
  const fit = lu.bench.filter((p) => !away.has(p) && !resting(p));
  const rested = fit.filter((p) => !justOff(p));
  // Bench kids who haven't rested wait while anyone else has.
  const bench = sortBy(rested.length > 0 ? rested : fit, game);
  // The keeper isn't outfield, so never goes off. Kids who just came on
  // go off last, never first.
  const field = sortBy(
    soccerOutfield(lu).filter((p) => !held.has(p) && !away.has(p)),
    (p) => [justOn(p) ? 1 : 0, -game(p)],
  );
  return { lu, bench, field, game, zoneHold };
}

/** Whether `on` may take `off`'s place: a line they play (a field kid at 4 a side always). */
const takesPlace = (lu: SoccerLineup, prefs: SoccerKeeperPrefs | undefined, on: string, off: string) => {
  const line = soccerUnitOf(lu, off) as SoccerLine;
  return line === "field" || playsLine(prefs, on, line);
};

/**
 * The next rolling sub: the bench kid with the least time this game on
 * for the outfield kid with the most, into the same line, or null when
 * no sub evens their time. A kid held in a line comes on only there.
 */
export function suggestSoccerRollingSub(input: SuggestSoccerSubInput): SoccerSub | null {
  const pools = subPools(input.state, input.nowMs, input.minStintMs ?? 0, input.restMs ?? 0);
  if (!pools) return null;
  const { lu, bench, field, game, zoneHold } = pools;
  for (const on of bench) {
    const only = zoneHold(on);
    const off = field.find((p) => (!only || soccerUnitOf(lu, p) === only) && takesPlace(lu, input.prefs, on, p));
    if (off && game(on) < game(off)) {
      return { off_player_id: off, on_player_id: on, line: soccerUnitOf(lu, off) as SoccerLine };
    }
  }
  return null;
}

/**
 * When a period's sub windows fall, in ms from the start of the period:
 * the shared even spread (lib/live/subDistribution) with the mode's
 * final-minutes cutoff. Rolling subs have no windows. `periodMs` is the
 * period's effective length (clock multiplier applied); the mode's cutoff,
 * in real seconds, is scaled by the same `clockMultiplier`.
 */
export function soccerSubWindowsMs(mode: SoccerSubMode, periodMs: number, clockMultiplier = 1): number[] {
  if (mode.kind !== "windows") return [];
  return subDueBoundariesMs({
    quarterMs: periodMs,
    subsPerQuarter: mode.perPeriod,
    cutoffMs: (mode.cutoffSeconds * 1000) / clockMultiplier,
  });
}

/**
 * A sub window's batch: empty spots first, nobody off (round 3 edge
 * cases, 24 Oct 2026: hockey's keeper was hurt with nobody to replace
 * them, and the card offered only outfield swaps with the goal empty) —
 * the goal before the field, a keen keeper first, never a kid marked
 * "not in goal". Then the bench, least time first, on for the outfield
 * kids with the most, while each sub evens their time. Windows are the
 * only time to sub, so no stint guard.
 */
export function suggestSoccerWindowBatch(input: Omit<SuggestSoccerSubInput, "minStintMs">): SoccerSub[] {
  const pools = subPools(input.state, input.nowMs, 0, input.restMs ?? 0);
  if (!pools) return [];
  const { lu, bench, field, game, zoneHold } = pools;
  const used = new Set<string>();
  const subs: SoccerSub[] = [];
  const filled = new Set<string>();
  if (input.spots?.keeper && !lu.keeper) {
    const keen = (p: string) => (input.prefs?.keenKeepers?.includes(p) || input.prefs?.namedKeepers?.includes(p) ? 0 : 1);
    const keeper = sortBy(
      bench.filter((p) => !zoneHold(p) && !input.prefs?.notInGoal?.includes(p)),
      (p) => [keen(p), game(p)],
    )[0];
    if (keeper) {
      filled.add(keeper);
      subs.push({ off_player_id: null, on_player_id: keeper, line: "gk" });
    }
  }
  for (const line of SOCCER_LINES) {
    for (let open = (input.spots?.lines[line] ?? 0) - lu.lines[line].length; open > 0; open--) {
      const on = bench.find((p) => !filled.has(p) && (!zoneHold(p) || zoneHold(p) === line) && (line === "field" || playsLine(input.prefs, p, line)));
      if (!on) break;
      filled.add(on);
      subs.push({ off_player_id: null, on_player_id: on, line });
    }
  }
  for (const on of bench) {
    if (filled.has(on)) continue;
    const only = zoneHold(on);
    const off = field.find((p) => !used.has(p) && (!only || soccerUnitOf(lu, p) === only) && takesPlace(lu, input.prefs, on, p));
    if (!off || !(game(on) < game(off))) continue;
    used.add(off);
    subs.push({ off_player_id: off, on_player_id: on, line: soccerUnitOf(lu, off) as SoccerLine });
  }
  return subs;
}

// ─── Half-time ───────────────────────────────────────────────

export interface SuggestSoccerHalfTimeInput {
  /** The game to the break: replaySoccerGame(events) after the half's quarter_end. */
  state: SoccerGameState;
  ageGroup: SoccerAgeGroupConfig;
  onFieldSize: number;
  /** The team's shape: it carries from one half to the next. */
  formationId?: string | null;
  keeperStrategy?: SoccerKeeperStrategy;
  prefs?: SoccerKeeperPrefs;
  season?: SoccerSeasonBalance;
}

export interface SoccerHalfTimePlan {
  /** "Keeper top: Sam → Mia". The same kid twice means they keep goal. */
  keeper: { from: string | null; to: string | null };
  lineup: SoccerLineup;
  formation: SoccerFormation;
}

/**
 * The next half: who takes the keeper top (keeper.ts, on this season's
 * and this game's keeper minutes), who plays (the least time this game
 * first; under "Everyone has a turn" last half's keeper plays out in
 * the field), and where (lines not played this game first, then season
 * debt). Null before there's a lineup.
 */
export function suggestSoccerHalfTime(input: SuggestSoccerHalfTimeInput): SoccerHalfTimePlan | null {
  const { state, ageGroup: ag, prefs, season } = input;
  const lu = state.lineup;
  if (!lu) return null;
  const away = new Set([...state.injuredIds, ...state.loanedIds]);
  const squad = [...soccerOnField(lu), ...lu.bench];
  const here = squad.filter((p) => !away.has(p));
  const onCount = Math.min(input.onFieldSize, here.length);
  const formation = shapeFor(ag, onCount, input.formationId);
  const strategy = keeperStrategyFor(ag, input.keeperStrategy);

  const from = state.keeperAtEnd[state.currentPeriod] ?? lu.keeper;
  const keeper = formation.keeper
    ? pickSoccerKeeper({
        strategy,
        candidates: here,
        prefs,
        keeperMs: Object.fromEntries(here.map((p) => [p, (season?.time[p]?.gk ?? 0) + (state.ms[p]?.gk ?? 0)])),
        gameMs: Object.fromEntries(here.map((p) => [p, soccerGameMs(state, p)])),
        lastKeeper: from,
      })
    : null;

  const outfield = onCount - (keeper ? 1 : 0);
  const playsOut = strategy === "turns" && from && from !== keeper && here.includes(from) && outfield > 0 ? [from] : [];
  const others = sortBy(
    here.filter((p) => p !== keeper && !playsOut.includes(p)),
    (p) => [soccerGameMs(state, p), seasonTotal(season, p)],
  );
  const starters = [...playsOut, ...others.slice(0, outfield - playsOut.length)];
  const playing = new Set(starters);

  const periodMs = season?.periodMs ?? (state.periodElapsedMs || 60_000);
  const owed = seasonTerm(season);
  const lines = seatLines(
    here.filter((p) => playing.has(p)),
    formation,
    withPlays(prefs, (pid, line) => -(state.ms[pid]?.[line] ?? 0) / periodMs + owed(pid, line)),
  );
  // The injured and lent stay on the bench, after everyone who can play.
  const bench = [...here.filter((p) => p !== keeper && !playing.has(p)), ...squad.filter((p) => away.has(p))];
  return { keeper: { from: from ?? null, to: keeper }, formation, lineup: { keeper, lines, bench } };
}
