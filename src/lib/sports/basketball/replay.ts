// ─── Basketball replay ───────────────────────────────────────
// A basketball game's events → its lineup, score, fouls, holds, and each
// kid's time in each line and each position. Pure: no clock, no React,
// no DB. Modelled on soccer's replay (lines, slots, the same stint
// bookkeeping), without the keeper, plus fouls and sit-outs.
//
// The events it reads (migration 0069), and their metadata:
//   lineup_set       { lineup: BasketballLineup, elapsed_ms? } at tip-off
//                    and at each break
//   quarter_start    { quarter } — the period starting (1, 2, …)
//   quarter_end      { quarter, elapsed_ms }
//   swap             { off_player_id, on_player_id, line?, elapsed_ms }
//                    — the kid coming on takes the line (and position)
//                    of the kid going off. When that kid has already
//                    left (fouled out, hurt, sat out), they take the spot
//                    left, or `line` when given
//   field_zone_swap  { player_a_id, player_b_id?, zone_b, elapsed_ms } —
//                    two kids on court swap places (lines and positions);
//                    without B, A moves into line zone_b
//   free_throw / two_pointer / three_pointer (player_id = scorer) and
//   opponent_free_throw / opponent_two_pointer / opponent_three_pointer
//   score_undo       { target_event_id? }
//   foul             { kind: "personal" | "technical" | "unsportsmanlike" }
//                    — one of ours (player_id)
//   sit_out          { duration_ms } — off court, unable to come back on
//                    for duration_ms of clock time (0 ends it early)
//   injury           { injured, reason? } — reason "fouled_out" is out for
//                    the game; anything else is a hurt (or "out") kid
//   player_lock, player_arrived, player_loan { loaned }, game_finalised
// A kid who leaves the court (hurt, lent, fouled out, sat out) goes to
// the bench, as in AFL's and soccer's replays; whoever replaces them
// comes on with a swap.

import type { GameEvent } from "@/lib/types";
import { replayLocks, type PlayerLock } from "@/lib/live/locks";
import { takeUndoTarget } from "@/lib/live/scoreUndo";
import { BASKETBALL_POINTS } from "@/lib/sports/basketball";
import {
  basketballLineOf,
  normalizeBasketballLineup,
  type BasketballLineup,
} from "@/lib/sports/basketball/lineup";
import {
  BASKETBALL_LINES,
  type BasketballLine,
  type BasketballPosition,
} from "@/lib/sports/basketball/types";

/** ms in each line; a line never played is absent. */
export type BasketballLineMs = Partial<Record<BasketballLine, number>>;
/** ms in each position; a position never played is absent. */
export type BasketballPositionMs = Partial<Record<BasketballPosition, number>>;

export type BasketballFoulKind = "personal" | "technical" | "unsportsmanlike";

export interface BasketballScore {
  points: number;
  /** Made baskets by type: 1 = free throws, 2 = twos, 3 = threes. */
  made: { 1: number; 2: number; 3: number };
}

export interface BasketballGameState {
  lineup: BasketballLineup | null;
  /** The period in play or last played (the events' `quarter`); 0 before tip-off. */
  currentPeriod: number;
  periodEnded: boolean;
  /** The last ended period's elapsed ms. */
  periodElapsedMs: number;
  periodStartedAt: string | null;
  finalised: boolean;
  teamScore: BasketballScore;
  opponentScore: BasketballScore;
  /** Points each kid has scored. */
  playerPoints: Record<string, number>;
  /** Points per period, for both sides. */
  scoreByPeriod: Record<number, { ours: number; theirs: number }>;
  /** Fouls each kid has this game (every kind counts towards fouling out). */
  fouls: Record<string, number>;
  /** Kids out for the game on fouls (an `injury` with reason "fouled_out"). */
  fouledOutIds: string[];
  /** Kids sitting out, and the absolute game ms they may come back on. */
  sittingOut: Record<string, number>;
  /** Each kid's current hold (Keep on, Keep in a line). */
  locks: Record<string, PlayerLock>;
  /** Hurt, marked out, or fouled out: none of them play on. */
  injuredIds: string[];
  loanedIds: string[];
  /** Each kid's time this game, per line. */
  ms: Record<string, BasketballLineMs>;
  /** Each kid's time this game, per position (the position strategies). */
  posMs: Record<string, BasketballPositionMs>;
  /** Time per line, per period. */
  msByPeriod: Record<string, Record<number, BasketballLineMs>>;
  /** Absolute game ms each kid last came on / went off (recency guards). */
  lastSubbedOnMs: Record<string, number>;
  lastSubbedOffMs: Record<string, number>;
  /** ms of every period already ended. */
  completedPeriodMs: number;
}

export interface ReplayBasketballOptions {
  /**
   * Elapsed ms in the period in play. Given, kids on court are credited
   * up to it (the live suggesters need time "so far"); without it only
   * ended stints count.
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

const isLine = (v: unknown): v is BasketballLine =>
  typeof v === "string" && (BASKETBALL_LINES as readonly string[]).includes(v);

const SCORE_SIDE: Record<string, "ours" | "theirs"> = {
  free_throw: "ours",
  two_pointer: "ours",
  three_pointer: "ours",
  opponent_free_throw: "theirs",
  opponent_two_pointer: "theirs",
  opponent_three_pointer: "theirs",
};

/** A kid's total time this game: every line. */
export function basketballGameMs(state: Pick<BasketballGameState, "ms">, playerId: string): number {
  const lines = state.ms[playerId];
  if (!lines) return 0;
  return Object.values(lines).reduce((s, ms) => s + (ms ?? 0), 0);
}

/**
 * Whether a kid can come on at absolute game ms `nowMs`: not hurt, out,
 * fouled out or lent, and not still sitting out.
 */
export function basketballCanPlay(state: BasketballGameState, playerId: string, nowMs: number): boolean {
  if (state.injuredIds.includes(playerId) || state.loanedIds.includes(playerId)) return false;
  const until = state.sittingOut[playerId];
  return until === undefined || nowMs >= until;
}

const emptyScore = (): BasketballScore => ({ points: 0, made: { 1: 0, 2: 0, 3: 0 } });

export function replayBasketballGame(events: GameEvent[], opts: ReplayBasketballOptions = {}): BasketballGameState {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const state: BasketballGameState = {
    lineup: null,
    currentPeriod: 0,
    periodEnded: false,
    periodElapsedMs: 0,
    periodStartedAt: null,
    finalised: false,
    teamScore: emptyScore(),
    opponentScore: emptyScore(),
    playerPoints: {},
    scoreByPeriod: {},
    fouls: {},
    fouledOutIds: [],
    sittingOut: {},
    locks: {},
    injuredIds: [],
    loanedIds: [],
    ms: {},
    posMs: {},
    msByPeriod: {},
    lastSubbedOnMs: {},
    lastSubbedOffMs: {},
    completedPeriodMs: 0,
  };

  // Open stints: when each kid on court started in their line (and
  // position), this period. Credited once, at whichever event ends it.
  const stintStart: Record<string, number> = {};
  const stintLine: Record<string, BasketballLine> = {};
  const stintPos: Record<string, BasketballPosition | null> = {};
  const inPlay = () => state.currentPeriod >= 1 && !state.periodEnded;

  const credit = (pid: string, line: BasketballLine, pos: BasketballPosition | null, ms: number) => {
    if (!(ms > 0)) return;
    const total = (state.ms[pid] ??= {});
    total[line] = (total[line] ?? 0) + ms;
    const byPeriod = ((state.msByPeriod[pid] ??= {})[state.currentPeriod] ??= {});
    byPeriod[line] = (byPeriod[line] ?? 0) + ms;
    if (pos) {
      const p = (state.posMs[pid] ??= {});
      p[pos] = (p[pos] ?? 0) + ms;
    }
  };
  const closeStint = (pid: string, elapsed: number) => {
    const start = stintStart[pid];
    if (start === undefined) return;
    credit(pid, stintLine[pid], stintPos[pid], elapsed - start);
    delete stintStart[pid];
    delete stintLine[pid];
    delete stintPos[pid];
  };
  const openStint = (lu: BasketballLineup, pid: string, elapsed: number) => {
    if (!inPlay()) return;
    const line = basketballLineOf(lu, pid);
    if (!line) return;
    stintStart[pid] = elapsed;
    stintLine[pid] = line;
    stintPos[pid] = lu.slots?.[pid] ?? null;
  };
  const openAll = (lu: BasketballLineup, elapsed: number) => {
    for (const line of BASKETBALL_LINES) for (const pid of lu.lines[line]) openStint(lu, pid, elapsed);
  };
  const closeAll = (elapsed: number) => {
    for (const pid of Object.keys(stintStart)) closeStint(pid, elapsed);
  };

  /** Take a kid off court (wherever they are), leaving their place empty. */
  const removeFromCourt = (lu: BasketballLineup, pid: string) => {
    for (const line of BASKETBALL_LINES) lu.lines[line] = lu.lines[line].filter((p) => p !== pid);
    if (lu.slots) delete lu.slots[pid];
  };
  // Where a kid who left stood (line, place in it, position), so their
  // replacement takes the same spot rather than the end of a line.
  const vacated: Record<string, { line: BasketballLine; index: number; pos: BasketballPosition | null }> = {};
  const leaveCourt = (lu: BasketballLineup, pid: string) => {
    const line = basketballLineOf(lu, pid);
    if (!line) return;
    vacated[pid] = { line, index: lu.lines[line].indexOf(pid), pos: lu.slots?.[pid] ?? null };
    removeFromCourt(lu, pid);
  };
  const toBench = (lu: BasketballLineup, pid: string) => {
    if (!lu.bench.includes(pid)) lu.bench.push(pid);
  };
  const inLineup = (lu: BasketballLineup, pid: string) => lu.bench.includes(pid) || basketballLineOf(lu, pid) !== null;
  /** Off court to the bench, crediting the stint, remembering the spot. */
  const sendOff = (pid: string, elapsed: number) => {
    const lu = state.lineup;
    if (!lu || !basketballLineOf(lu, pid)) return;
    closeStint(pid, elapsed);
    leaveCourt(lu, pid);
    toBench(lu, pid);
  };

  // Baskets still standing, for score_undo (named target, else the latest).
  const standing: { id: string; side: "ours" | "theirs"; player: string | null; period: number; points: number }[] = [];
  const periodScore = (p: number) => (state.scoreByPeriod[p] ??= { ours: 0, theirs: 0 });

  for (const ev of sorted) {
    const meta = (ev.metadata ?? {}) as { lineup?: unknown; quarter?: number; elapsed_ms?: number; intended_quarter?: number };
    const elapsed = typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : 0;
    const absolute = state.completedPeriodMs + elapsed;

    switch (ev.type) {
      case "lineup_set": {
        if (!meta.lineup) break;
        const next = normalizeBasketballLineup(meta.lineup);
        const before = new Set(state.lineup ? BASKETBALL_LINES.flatMap((l) => state.lineup!.lines[l]) : []);
        // A lineup set while a period is in play re-seats everyone.
        if (inPlay()) closeAll(elapsed);
        for (const pid of Object.keys(vacated)) delete vacated[pid];
        state.lineup = next;
        if (inPlay()) openAll(next, elapsed);
        for (const pid of BASKETBALL_LINES.flatMap((l) => next.lines[l])) {
          if (!before.has(pid)) state.lastSubbedOnMs[pid] = absolute;
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
          delete stintPos[pid];
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
        if (!lu || !on || basketballLineOf(lu, on)) break; // nothing to do, or a replayed duplicate
        const offLine = off ? basketballLineOf(lu, off) : null;
        if (off && offLine) {
          closeStint(off, elapsed);
          lu.lines[offLine] = lu.lines[offLine].map((p) => (p === off ? on : p));
          lu.bench = lu.bench.filter((p) => p !== on && p !== off);
          lu.bench.push(off);
          if (lu.slots?.[off]) {
            lu.slots[on] = lu.slots[off];
            delete lu.slots[off];
          }
          state.lastSubbedOffMs[off] = absolute;
        } else {
          // Fill: the kid going off already left (fouled out, hurt, sat
          // out), or the place was empty. The event's line wins; without
          // one, the kid coming on takes the spot that was left.
          const spot = off ? vacated[off] : undefined;
          const target = isLine(line) ? line : spot?.line;
          if (!target) break;
          const row = [...lu.lines[target]];
          row.splice(spot?.line === target ? spot.index : row.length, 0, on);
          lu.lines[target] = row;
          if (spot?.pos && spot.line === target) {
            const taken = Object.values(lu.slots ?? {}).includes(spot.pos);
            if (!taken) lu.slots = { ...(lu.slots ?? {}), [on]: spot.pos };
          }
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
        // Where they are now wins over where the event says (an earlier
        // move may have landed since it was read).
        const la = basketballLineOf(lu, a);
        if (!la) break;
        if (b) {
          const lb = basketballLineOf(lu, b);
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
          if (lu.slots) {
            const sa = lu.slots[a];
            const sb = lu.slots[b];
            delete lu.slots[a];
            delete lu.slots[b];
            if (sb) lu.slots[a] = sb;
            if (sa) lu.slots[b] = sa;
          }
          openStint(lu, a, elapsed);
          openStint(lu, b, elapsed);
        } else {
          if (!isLine(zone_b) || zone_b === la) break;
          closeStint(a, elapsed);
          removeFromCourt(lu, a);
          lu.lines[zone_b] = [...lu.lines[zone_b], a];
          openStint(lu, a, elapsed);
        }
        break;
      }

      case "free_throw":
      case "two_pointer":
      case "three_pointer":
      case "opponent_free_throw":
      case "opponent_two_pointer":
      case "opponent_three_pointer": {
        const side = SCORE_SIDE[ev.type];
        const points = BASKETBALL_POINTS[ev.type];
        // A basket added later says which period it was scored in.
        const period = typeof meta.intended_quarter === "number" ? meta.intended_quarter : state.currentPeriod;
        const score = side === "ours" ? state.teamScore : state.opponentScore;
        score.points += points;
        score.made[points as 1 | 2 | 3]++;
        if (side === "ours" && ev.player_id) {
          state.playerPoints[ev.player_id] = (state.playerPoints[ev.player_id] ?? 0) + points;
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
        const made = undone.points as 1 | 2 | 3;
        score.made[made] = Math.max(0, score.made[made] - 1);
        if (undone.side === "ours" && undone.player && state.playerPoints[undone.player]) {
          state.playerPoints[undone.player] = Math.max(0, state.playerPoints[undone.player] - undone.points);
        }
        break;
      }

      case "foul": {
        const pid = ev.player_id;
        if (!pid) break;
        const undo = (ev.metadata as { undo?: boolean }).undo === true;
        state.fouls[pid] = Math.max(0, (state.fouls[pid] ?? 0) + (undo ? -1 : 1));
        break;
      }

      case "sit_out": {
        const pid = ev.player_id;
        if (!pid) break;
        const duration = (ev.metadata as { duration_ms?: number }).duration_ms ?? 0;
        if (!(duration > 0)) {
          delete state.sittingOut[pid];
          break;
        }
        state.sittingOut[pid] = absolute + duration;
        sendOff(pid, elapsed);
        break;
      }

      case "player_arrived": {
        if (state.lineup && ev.player_id && !inLineup(state.lineup, ev.player_id)) state.lineup.bench.push(ev.player_id);
        break;
      }

      case "injury": {
        const pid = ev.player_id;
        if (!pid) break;
        const m = ev.metadata as { injured?: boolean; reason?: string };
        const injured = m.injured ?? true;
        if (!injured) {
          state.injuredIds = state.injuredIds.filter((p) => p !== pid);
          state.fouledOutIds = state.fouledOutIds.filter((p) => p !== pid);
          break;
        }
        if (!state.injuredIds.includes(pid)) state.injuredIds.push(pid);
        if (m.reason === "fouled_out" && !state.fouledOutIds.includes(pid)) state.fouledOutIds.push(pid);
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
        // player_lock is read below; anything else isn't basketball's.
        break;
    }
  }

  // The period in play: credit time so far.
  if (inPlay() && typeof opts.nowMs === "number") {
    for (const [pid, start] of Object.entries(stintStart)) credit(pid, stintLine[pid], stintPos[pid], opts.nowMs - start);
  }
  state.locks = replayLocks(sorted);
  return state;
}
