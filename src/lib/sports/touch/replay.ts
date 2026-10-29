// ─── Touch family replay ─────────────────────────────────────
// A touch or Oztag game's events → its lineup, score, holds, and each
// kid's time in each lane. Pure: no clock, no React, no DB. Modelled on
// basketball's replay (lines, the same stint bookkeeping), without fouls
// or positions, plus tries and the field shrinking on a mixed team.
//
// The events it reads (migration 0071), and their metadata:
//   lineup_set       { lineup: TouchLineup, elapsed_ms? } at the start
//                    and at each break
//   quarter_start    { quarter } — the period starting (1, 2)
//   quarter_end      { quarter, elapsed_ms }
//   swap             { off_player_id, on_player_id, line?, elapsed_ms }
//                    — the kid coming on takes the lane of the kid going
//                    off. When that kid has already left (hurt, lent),
//                    they take the spot left, or `line` when given
//   field_zone_swap  { player_a_id, player_b_id?, zone_b, elapsed_ms } —
//                    two kids on the field swap lanes; without B, A moves
//                    into lane zone_b
//   try / girls_try (player_id = scorer) and opponent_try /
//   opponent_girls_try — a girl's try (Oztag mixed) is 2 points, its own
//   event so nothing works the points out again
//   score_undo       { target_event_id? }
//   roster_shrink    { on_field_size, elapsed_ms } — the field's size
//                    from now: a mixed team short of girls plays fewer
//                    (and back up when one returns)
//   injury           { injured }, player_lock, player_arrived,
//   player_loan { loaned }, game_finalised
// A kid who leaves the field (hurt, lent) goes to the bench, as in the
// other sports' replays; whoever replaces them comes on with a swap.

import type { GameEvent, MixedGroup } from "@/lib/types";
import { replayLocks, type PlayerLock } from "@/lib/live/locks";
import { takeUndoTarget } from "@/lib/live/scoreUndo";
import { normalizeTouchLineup, touchLineOf, type TouchLineup } from "@/lib/sports/touch/lineup";
import { TOUCH_LINES, type TouchLine } from "@/lib/sports/touch/types";

/** ms in each lane; a lane never played is absent. */
export type TouchLineMs = Partial<Record<TouchLine, number>>;

/** Points for each score event, ours and theirs. */
export const TOUCH_POINTS: Record<string, number> = {
  try: 1,
  girls_try: 2,
  opponent_try: 1,
  opponent_girls_try: 2,
};

/** Our score event types, and theirs. */
export const TOUCH_OWN_SCORES = ["try", "girls_try"] as const;
export const TOUCH_OPPONENT_SCORES = ["opponent_try", "opponent_girls_try"] as const;
export const TOUCH_SCORE_EVENTS: readonly string[] = [...TOUCH_OWN_SCORES, ...TOUCH_OPPONENT_SCORES];

const SCORE_SIDE: Record<string, "ours" | "theirs"> = {
  try: "ours",
  girls_try: "ours",
  opponent_try: "theirs",
  opponent_girls_try: "theirs",
};

export interface TouchScore {
  points: number;
  tries: number;
  /** Girls' tries among them (each worth 2). */
  girlsTries: number;
}

export interface TouchGameState {
  lineup: TouchLineup | null;
  /** The period in play or last played (the events' `quarter`); 0 before the start. */
  currentPeriod: number;
  periodEnded: boolean;
  /** The last ended period's elapsed ms. */
  periodElapsedMs: number;
  periodStartedAt: string | null;
  finalised: boolean;
  teamScore: TouchScore;
  opponentScore: TouchScore;
  /** Points each kid has scored. */
  playerPoints: Record<string, number>;
  /** Tries each kid has scored. */
  playerTries: Record<string, number>;
  /** Points per period, for both sides. */
  scoreByPeriod: Record<number, { ours: number; theirs: number }>;
  /** Each kid's current hold (Keep on, Keep in a lane). */
  locks: Record<string, PlayerLock>;
  injuredIds: string[];
  /** Of the injured, the kids who went home (an injury with reason "out", lib/live/wentHome). */
  wentHomeIds: string[];
  loanedIds: string[];
  /** Each kid's time this game, per lane. */
  ms: Record<string, TouchLineMs>;
  /** Time per lane, per period. */
  msByPeriod: Record<string, Record<number, TouchLineMs>>;
  /** Absolute game ms each kid last came on / went off (recency guards). */
  lastSubbedOnMs: Record<string, number>;
  lastSubbedOffMs: Record<string, number>;
  /** ms of every period already ended. */
  completedPeriodMs: number;
  /** The field's size since the last roster_shrink; null = the game's own. */
  fieldSize: number | null;
  /** Each change of the field's size, in order. */
  sizeChanges: { period: number; elapsedMs: number; size: number }[];
}

export interface ReplayTouchOptions {
  /**
   * Elapsed ms in the period in play. Given, kids on the field are
   * credited up to it (the live suggesters need time "so far"); without
   * it only ended stints count.
   */
  nowMs?: number;
}

interface SwapMeta {
  off_player_id?: string;
  on_player_id?: string;
  line?: string;
}
interface ZoneSwapMeta {
  player_a_id?: string;
  player_b_id?: string;
  zone_b?: string;
}

const isLine = (v: unknown): v is TouchLine => typeof v === "string" && (TOUCH_LINES as readonly string[]).includes(v);

/** A kid's total time this game: every lane. */
export function touchGameMs(state: Pick<TouchGameState, "ms">, playerId: string): number {
  const lines = state.ms[playerId];
  if (!lines) return 0;
  return Object.values(lines).reduce((s, ms) => s + (ms ?? 0), 0);
}

/** Whether a kid can come on: not hurt or lent. */
export function touchCanPlay(state: Pick<TouchGameState, "injuredIds" | "loanedIds">, playerId: string): boolean {
  return !state.injuredIds.includes(playerId) && !state.loanedIds.includes(playerId);
}

/** Field time by mixed group: each group's total, and how many kids it's shared by. */
export interface TouchGroupMs {
  girl: { ms: number; kids: number };
  boy: { ms: number; kids: number };
}

/**
 * Minutes per mixed group over `playerIds` (the kids who were here),
 * for "Boys and girls are evened separately". Kids with no group count
 * in neither.
 */
export function touchMsByGroup(
  state: Pick<TouchGameState, "ms">,
  playerIds: readonly string[],
  groupOf: (id: string) => MixedGroup | null | undefined,
): TouchGroupMs {
  const out: TouchGroupMs = { girl: { ms: 0, kids: 0 }, boy: { ms: 0, kids: 0 } };
  for (const id of playerIds) {
    const g = groupOf(id);
    if (!g) continue;
    out[g].ms += touchGameMs(state, id);
    out[g].kids++;
  }
  return out;
}

const emptyScore = (): TouchScore => ({ points: 0, tries: 0, girlsTries: 0 });

export function replayTouchGame(events: GameEvent[], opts: ReplayTouchOptions = {}): TouchGameState {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const state: TouchGameState = {
    lineup: null,
    currentPeriod: 0,
    periodEnded: false,
    periodElapsedMs: 0,
    periodStartedAt: null,
    finalised: false,
    teamScore: emptyScore(),
    opponentScore: emptyScore(),
    playerPoints: {},
    playerTries: {},
    scoreByPeriod: {},
    locks: {},
    injuredIds: [],
    wentHomeIds: [],
    loanedIds: [],
    ms: {},
    msByPeriod: {},
    lastSubbedOnMs: {},
    lastSubbedOffMs: {},
    completedPeriodMs: 0,
    fieldSize: null,
    sizeChanges: [],
  };

  // Open stints: when each kid on the field started in their lane, this
  // period. Credited once, at whichever event ends it.
  const stintStart: Record<string, number> = {};
  const stintLine: Record<string, TouchLine> = {};
  const inPlay = () => state.currentPeriod >= 1 && !state.periodEnded;

  const credit = (pid: string, line: TouchLine, ms: number) => {
    if (!(ms > 0)) return;
    const total = (state.ms[pid] ??= {});
    total[line] = (total[line] ?? 0) + ms;
    const byPeriod = ((state.msByPeriod[pid] ??= {})[state.currentPeriod] ??= {});
    byPeriod[line] = (byPeriod[line] ?? 0) + ms;
  };
  const closeStint = (pid: string, elapsed: number) => {
    const start = stintStart[pid];
    if (start === undefined) return;
    credit(pid, stintLine[pid], elapsed - start);
    delete stintStart[pid];
    delete stintLine[pid];
  };
  const openStint = (lu: TouchLineup, pid: string, elapsed: number) => {
    if (!inPlay()) return;
    const line = touchLineOf(lu, pid);
    if (!line) return;
    stintStart[pid] = elapsed;
    stintLine[pid] = line;
  };
  const openAll = (lu: TouchLineup, elapsed: number) => {
    for (const line of TOUCH_LINES) for (const pid of lu.lines[line]) openStint(lu, pid, elapsed);
  };
  const closeAll = (elapsed: number) => {
    for (const pid of Object.keys(stintStart)) closeStint(pid, elapsed);
  };

  // Where a kid who left stood (lane and place in it), so their
  // replacement takes the same spot rather than the end of a lane.
  const vacated: Record<string, { line: TouchLine; index: number }> = {};
  const leaveField = (lu: TouchLineup, pid: string) => {
    const line = touchLineOf(lu, pid);
    if (!line) return;
    vacated[pid] = { line, index: lu.lines[line].indexOf(pid) };
    for (const l of TOUCH_LINES) lu.lines[l] = lu.lines[l].filter((p) => p !== pid);
  };
  const toBench = (lu: TouchLineup, pid: string) => {
    if (!lu.bench.includes(pid)) lu.bench.push(pid);
  };
  const inLineup = (lu: TouchLineup, pid: string) => lu.bench.includes(pid) || touchLineOf(lu, pid) !== null;
  /** Off the field to the bench, crediting the stint, remembering the spot. */
  const sendOff = (pid: string, elapsed: number) => {
    const lu = state.lineup;
    if (!lu || !touchLineOf(lu, pid)) return;
    closeStint(pid, elapsed);
    leaveField(lu, pid);
    toBench(lu, pid);
  };

  // Tries still standing, for score_undo (named target, else the latest).
  const standing: { id: string; side: "ours" | "theirs"; player: string | null; period: number; points: number }[] = [];
  const periodScore = (p: number) => (state.scoreByPeriod[p] ??= { ours: 0, theirs: 0 });

  for (const ev of sorted) {
    const meta = (ev.metadata ?? {}) as { lineup?: unknown; quarter?: number; elapsed_ms?: number; intended_quarter?: number };
    const elapsed = typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : 0;
    const absolute = state.completedPeriodMs + elapsed;

    switch (ev.type) {
      case "lineup_set": {
        if (!meta.lineup) break;
        const next = normalizeTouchLineup(meta.lineup);
        const before = new Set(state.lineup ? TOUCH_LINES.flatMap((l) => state.lineup!.lines[l]) : []);
        // A lineup set while a period is in play re-seats everyone.
        if (inPlay()) closeAll(elapsed);
        for (const pid of Object.keys(vacated)) delete vacated[pid];
        state.lineup = next;
        if (inPlay()) openAll(next, elapsed);
        const after = new Set(TOUCH_LINES.flatMap((l) => next.lines[l]));
        after.forEach((pid) => {
          if (!before.has(pid)) state.lastSubbedOnMs[pid] = absolute;
        });
        // Taken off mid-period ("Take off, no replacement"): they rest
        // like a kid subbed off.
        if (inPlay()) {
          before.forEach((pid) => {
            if (!after.has(pid)) state.lastSubbedOffMs[pid] = absolute;
          });
        }
        break;
      }

      case "quarter_start": {
        state.currentPeriod = typeof meta.quarter === "number" ? meta.quarter : state.currentPeriod + 1;
        state.periodEnded = false;
        state.periodStartedAt = ev.created_at;
        // A period that never ended (no quarter_end) credits nothing more.
        for (const pid of Object.keys(stintStart)) {
          delete stintStart[pid];
          delete stintLine[pid];
        }
        if (state.lineup) openAll(state.lineup, 0);
        break;
      }

      case "quarter_end": {
        if (!inPlay()) break;
        closeAll(elapsed);
        state.periodEnded = true;
        state.periodStartedAt = null;
        state.periodElapsedMs = elapsed;
        state.completedPeriodMs += elapsed;
        break;
      }

      case "swap": {
        const lu = state.lineup;
        const { off_player_id: off, on_player_id: on, line } = ev.metadata as SwapMeta;
        if (!lu || !on || touchLineOf(lu, on)) break; // nothing to do, or a replayed duplicate
        const offLine = off ? touchLineOf(lu, off) : null;
        if (off && offLine) {
          closeStint(off, elapsed);
          lu.lines[offLine] = lu.lines[offLine].map((p) => (p === off ? on : p));
          lu.bench = lu.bench.filter((p) => p !== on && p !== off);
          lu.bench.push(off);
          state.lastSubbedOffMs[off] = absolute;
        } else {
          // Fill: the kid going off already left (hurt, lent), or the
          // place was empty. The event's lane wins; without one, the kid
          // coming on takes the spot that was left.
          const spot = off ? vacated[off] : undefined;
          const target = isLine(line) ? line : spot?.line;
          if (!target) break;
          const row = [...lu.lines[target]];
          row.splice(spot?.line === target ? spot.index : row.length, 0, on);
          lu.lines[target] = row;
          if (off) delete vacated[off];
          lu.bench = lu.bench.filter((p) => p !== on);
        }
        delete vacated[on];
        openStint(lu, on, elapsed);
        state.lastSubbedOnMs[on] = absolute;
        break;
      }

      case "field_zone_swap": {
        const lu = state.lineup;
        const { player_a_id: a, player_b_id: b, zone_b } = ev.metadata as ZoneSwapMeta;
        if (!lu || !a) break;
        // Where they are now wins over where the event says.
        const la = touchLineOf(lu, a);
        if (!la) break;
        if (b) {
          const lb = touchLineOf(lu, b);
          if (!lb) break;
          closeStint(a, elapsed);
          closeStint(b, elapsed);
          if (la === lb) {
            const row = lu.lines[la];
            const i = row.indexOf(a);
            const j = row.indexOf(b);
            [row[i], row[j]] = [row[j], row[i]];
          } else {
            lu.lines[la] = lu.lines[la].map((p) => (p === a ? b : p));
            lu.lines[lb] = lu.lines[lb].map((p) => (p === b ? a : p));
          }
          openStint(lu, a, elapsed);
          openStint(lu, b, elapsed);
        } else {
          if (!isLine(zone_b) || zone_b === la) break;
          closeStint(a, elapsed);
          lu.lines[la] = lu.lines[la].filter((p) => p !== a);
          lu.lines[zone_b] = [...lu.lines[zone_b], a];
          openStint(lu, a, elapsed);
        }
        break;
      }

      case "try":
      case "girls_try":
      case "opponent_try":
      case "opponent_girls_try": {
        const side = SCORE_SIDE[ev.type];
        const points = TOUCH_POINTS[ev.type];
        // A try added later says which period it was scored in.
        const period = typeof meta.intended_quarter === "number" ? meta.intended_quarter : state.currentPeriod;
        const score = side === "ours" ? state.teamScore : state.opponentScore;
        score.points += points;
        score.tries++;
        if (points === 2) score.girlsTries++;
        if (side === "ours" && ev.player_id) {
          state.playerPoints[ev.player_id] = (state.playerPoints[ev.player_id] ?? 0) + points;
          state.playerTries[ev.player_id] = (state.playerTries[ev.player_id] ?? 0) + 1;
        }
        periodScore(period)[side] += points;
        standing.push({ id: ev.id, side, player: side === "ours" ? ev.player_id : null, period, points });
        break;
      }

      case "score_undo": {
        const undone = takeUndoTarget(standing, ev.metadata);
        if (!undone) break;
        const slot = periodScore(undone.period);
        slot[undone.side] = Math.max(0, slot[undone.side] - undone.points);
        const score = undone.side === "ours" ? state.teamScore : state.opponentScore;
        score.points = Math.max(0, score.points - undone.points);
        score.tries = Math.max(0, score.tries - 1);
        if (undone.points === 2) score.girlsTries = Math.max(0, score.girlsTries - 1);
        if (undone.side === "ours" && undone.player) {
          if (state.playerPoints[undone.player]) {
            state.playerPoints[undone.player] = Math.max(0, state.playerPoints[undone.player] - undone.points);
          }
          if (state.playerTries[undone.player]) {
            state.playerTries[undone.player] = Math.max(0, state.playerTries[undone.player] - 1);
          }
        }
        break;
      }

      case "roster_shrink": {
        const size = (ev.metadata as { on_field_size?: unknown }).on_field_size;
        if (typeof size !== "number" || !(size > 0)) break;
        state.fieldSize = Math.floor(size);
        state.sizeChanges.push({ period: state.currentPeriod, elapsedMs: elapsed, size: state.fieldSize });
        break;
      }

      case "player_arrived": {
        if (state.lineup && ev.player_id && !inLineup(state.lineup, ev.player_id)) state.lineup.bench.push(ev.player_id);
        break;
      }

      case "injury": {
        const pid = ev.player_id;
        if (!pid) break;
        const injured = (ev.metadata as { injured?: boolean }).injured ?? true;
        if (!injured) {
          state.injuredIds = state.injuredIds.filter((p) => p !== pid);
          state.wentHomeIds = state.wentHomeIds.filter((p) => p !== pid);
          break;
        }
        if (!state.injuredIds.includes(pid)) state.injuredIds.push(pid);
        // A kid going home is an injury with reason "out": say so (lib/live/wentHome).
        state.wentHomeIds = state.wentHomeIds.filter((p) => p !== pid);
        if ((ev.metadata as { reason?: string }).reason === "out") state.wentHomeIds.push(pid);
        sendOff(pid, elapsed);
        break;
      }

      case "player_loan": {
        const pid = ev.player_id;
        if (!pid) break;
        const loaned = (ev.metadata as { loaned?: boolean }).loaned ?? true;
        if (loaned) {
          if (!state.loanedIds.includes(pid)) state.loanedIds.push(pid);
          sendOff(pid, elapsed);
        } else {
          state.loanedIds = state.loanedIds.filter((p) => p !== pid);
          if (state.lineup && !inLineup(state.lineup, pid)) state.lineup.bench.push(pid);
        }
        break;
      }

      case "game_finalised": {
        state.finalised = true;
        break;
      }

      default:
        // player_lock is read below; anything else isn't the touch family's.
        break;
    }
  }

  // The period in play: credit time so far.
  if (inPlay() && typeof opts.nowMs === "number") {
    for (const [pid, start] of Object.entries(stintStart)) credit(pid, stintLine[pid], opts.nowMs - start);
  }
  state.locks = replayLocks(sorted);
  return state;
}
