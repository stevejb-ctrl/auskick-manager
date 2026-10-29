// ─── Football (soccer) replay ────────────────────────────────
// A soccer game's events → its lineup, score, holds, and each kid's
// time in each line and in goal. Pure: no clock, no React, no DB.
//
// Soccer records no event type of its own (migration 0068). The ones it
// reuses, and the metadata it reads:
//   lineup_set       { lineup: SoccerLineup, elapsed_ms? } at kick-off
//                    and at half-time
//   quarter_start    { quarter } — the half starting (1 or 2)
//   quarter_end      { quarter, elapsed_ms }
//   swap             { off_player_id, on_player_id, line?, elapsed_ms }
//                    — the kid coming on takes the place of the kid
//                    going off, in goal or in their line. When that kid
//                    has already left (an injury landed first), they take
//                    the spot left, or `line` (a line or "gk") when given
//   field_zone_swap  { player_a_id, zone_a, player_b_id?, zone_b,
//                    elapsed_ms } — two on-field kids swap places
//                    (between lines, or one into goal); without B, A
//                    moves into zone_b (an empty goal, a short line)
//   player_lock      { lock: PlayerLock | null } — the keeper's hold is
//                    { kind: "position", position: "gk" }
//   goal / opponent_goal, score_undo, player_arrived, injury { injured },
//   player_loan { loaned }, game_finalised
// An injured or lent kid leaves the field for the bench, as in AFL's
// replay (the reference); whoever replaces them comes on with a swap.
// Keeper minutes are counted apart (`gk`) and still count as game time.

import type { GameEvent } from "@/lib/types";
import { replayLocks, type PlayerLock } from "@/lib/live/locks";
import { takeUndoTarget } from "@/lib/live/scoreUndo";
import { normalizeSoccerLineup, soccerUnitOf, type SoccerLineup } from "@/lib/sports/soccer/lineup";
import { SOCCER_LINES, SOCCER_UNITS, type SoccerUnit } from "@/lib/sports/soccer/types";

/** ms in each unit (lines and `gk`); a unit never played is absent. */
export type SoccerUnitMs = Partial<Record<SoccerUnit, number>>;

export interface SoccerGameState {
  lineup: SoccerLineup | null;
  /** The half in play or last played (the events' `quarter`); 0 before kick-off. */
  currentPeriod: number;
  periodEnded: boolean;
  /** The last ended period's elapsed ms. */
  periodElapsedMs: number;
  periodStartedAt: string | null;
  finalised: boolean;
  teamScore: { goals: number };
  opponentScore: { goals: number };
  playerGoals: Record<string, number>;
  /** Our goals they put in their own net (metadata.own_goal): no scorer of ours. */
  ownGoals: number;
  /** Goals per period, for both sides. */
  scoreByPeriod: Record<number, { ours: number; theirs: number }>;
  /** Each kid's current hold (Keep on, Keep in goal, Keep in a line). */
  locks: Record<string, PlayerLock>;
  injuredIds: string[];
  loanedIds: string[];
  /** Each kid's time this game, per unit. */
  ms: Record<string, SoccerUnitMs>;
  /** The same, per period. */
  msByPeriod: Record<string, Record<number, SoccerUnitMs>>;
  /** Who was in goal when each period ended (the period in play: now). */
  keeperAtEnd: Record<number, string | null>;
  /** Absolute game ms each kid last came on / went off (recency guards). */
  lastSubbedOnMs: Record<string, number>;
  lastSubbedOffMs: Record<string, number>;
  /** ms of every period already ended. */
  completedPeriodMs: number;
}

export interface ReplaySoccerOptions {
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
  zone_a?: string;
  player_b_id?: string;
  zone_b?: string;
}

const isUnit = (v: unknown): v is SoccerUnit => typeof v === "string" && (SOCCER_UNITS as readonly string[]).includes(v);

/** A kid's total time this game: every line plus goal. */
export function soccerGameMs(state: Pick<SoccerGameState, "ms">, playerId: string): number {
  const units = state.ms[playerId];
  if (!units) return 0;
  return Object.values(units).reduce((s, ms) => s + (ms ?? 0), 0);
}

export function replaySoccerGame(events: GameEvent[], opts: ReplaySoccerOptions = {}): SoccerGameState {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const state: SoccerGameState = {
    lineup: null,
    currentPeriod: 0,
    periodEnded: false,
    periodElapsedMs: 0,
    periodStartedAt: null,
    finalised: false,
    teamScore: { goals: 0 },
    opponentScore: { goals: 0 },
    playerGoals: {},
    ownGoals: 0,
    scoreByPeriod: {},
    locks: {},
    injuredIds: [],
    loanedIds: [],
    ms: {},
    msByPeriod: {},
    keeperAtEnd: {},
    lastSubbedOnMs: {},
    lastSubbedOffMs: {},
    completedPeriodMs: 0,
  };

  // Open stints: when each kid on the field started in their unit, this
  // period. Credited once, at whichever event ends the stint.
  const stintStart: Record<string, number> = {};
  const stintUnit: Record<string, SoccerUnit> = {};
  const inPlay = () => state.currentPeriod >= 1 && !state.periodEnded;

  const credit = (pid: string, unit: SoccerUnit, ms: number) => {
    if (!(ms > 0)) return;
    const total = (state.ms[pid] ??= {});
    total[unit] = (total[unit] ?? 0) + ms;
    const byPeriod = ((state.msByPeriod[pid] ??= {})[state.currentPeriod] ??= {});
    byPeriod[unit] = (byPeriod[unit] ?? 0) + ms;
  };
  const closeStint = (pid: string, elapsed: number) => {
    const start = stintStart[pid];
    if (start === undefined) return;
    credit(pid, stintUnit[pid], elapsed - start);
    delete stintStart[pid];
    delete stintUnit[pid];
  };
  const openStint = (pid: string, unit: SoccerUnit, elapsed: number) => {
    if (!inPlay()) return;
    stintStart[pid] = elapsed;
    stintUnit[pid] = unit;
  };
  const openAll = (lu: SoccerLineup, elapsed: number) => {
    if (lu.keeper) openStint(lu.keeper, "gk", elapsed);
    for (const line of SOCCER_LINES) for (const pid of lu.lines[line]) openStint(pid, line, elapsed);
  };
  const closeAll = (elapsed: number) => {
    for (const pid of Object.keys(stintStart)) closeStint(pid, elapsed);
  };

  /** Take a kid off the field (wherever they are), leaving their place empty. */
  const removeFromField = (lu: SoccerLineup, pid: string) => {
    if (lu.keeper === pid) lu.keeper = null;
    for (const line of SOCCER_LINES) lu.lines[line] = lu.lines[line].filter((p) => p !== pid);
    if (lu.slots) delete lu.slots[pid];
  };
  // Where an injured or lent kid stood, so their replacement takes the
  // same spot rather than the end of the line (rugby's "vacant slot in
  // the wrong position" bug).
  const vacated: Record<string, { unit: SoccerUnit; index: number }> = {};
  const leaveField = (lu: SoccerLineup, pid: string) => {
    const unit = soccerUnitOf(lu, pid);
    if (!unit) return;
    vacated[pid] = { unit, index: unit === "gk" ? 0 : lu.lines[unit].indexOf(pid) };
    removeFromField(lu, pid);
  };
  /** Put a kid in a unit: in goal (if empty) or in a line, at `index` or the end. */
  const place = (lu: SoccerLineup, pid: string, unit: SoccerUnit, index?: number): boolean => {
    if (unit === "gk") {
      if (lu.keeper) return false;
      lu.keeper = pid;
    } else {
      const row = [...lu.lines[unit]];
      row.splice(index ?? row.length, 0, pid);
      lu.lines[unit] = row;
    }
    return true;
  };
  /** In `unit`, replace `from` with `to` in the same place. */
  const replaceIn = (lu: SoccerLineup, unit: SoccerUnit, from: string, to: string) => {
    if (unit === "gk") lu.keeper = to;
    else lu.lines[unit] = lu.lines[unit].map((p) => (p === from ? to : p));
  };
  const inLineup = (lu: SoccerLineup, pid: string) => lu.bench.includes(pid) || soccerUnitOf(lu, pid) !== null;
  const toBench = (lu: SoccerLineup, pid: string) => {
    if (!lu.bench.includes(pid)) lu.bench.push(pid);
  };

  // Goals still standing, for score_undo (named target, else the latest).
  const standing: { id: string; side: "ours" | "theirs"; player: string | null; period: number; own?: boolean }[] = [];
  const periodScore = (p: number) => (state.scoreByPeriod[p] ??= { ours: 0, theirs: 0 });

  for (const ev of sorted) {
    const meta = (ev.metadata ?? {}) as { lineup?: unknown; quarter?: number; elapsed_ms?: number; intended_quarter?: number; own_goal?: boolean };
    const elapsed = typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : 0;
    const absolute = state.completedPeriodMs + elapsed;

    switch (ev.type) {
      case "lineup_set": {
        if (!meta.lineup) break;
        const next = normalizeSoccerLineup(meta.lineup);
        const before = new Set(state.lineup ? [state.lineup.keeper, ...SOCCER_LINES.flatMap((l) => state.lineup!.lines[l])] : []);
        // A lineup set while a half is in play re-seats everyone.
        if (inPlay()) closeAll(elapsed);
        for (const pid of Object.keys(vacated)) delete vacated[pid];
        state.lineup = next;
        if (inPlay()) openAll(next, elapsed);
        for (const pid of [next.keeper, ...SOCCER_LINES.flatMap((l) => next.lines[l])]) {
          if (pid && !before.has(pid)) state.lastSubbedOnMs[pid] = absolute;
        }
        break;
      }

      case "quarter_start": {
        state.currentPeriod = typeof meta.quarter === "number" ? meta.quarter : state.currentPeriod + 1;
        state.periodEnded = false;
        state.periodStartedAt = ev.created_at;
        // A half that never ended (no quarter_end) credits nothing more.
        for (const pid of Object.keys(stintStart)) {
          delete stintStart[pid];
          delete stintUnit[pid];
        }
        if (state.lineup) openAll(state.lineup, 0);
        break;
      }

      case "quarter_end": {
        if (!inPlay()) break;
        closeAll(elapsed);
        state.keeperAtEnd[state.currentPeriod] = state.lineup?.keeper ?? null;
        state.periodEnded = true;
        state.periodStartedAt = null;
        state.periodElapsedMs = elapsed;
        state.completedPeriodMs += elapsed;
        break;
      }

      case "swap": {
        const lu = state.lineup;
        const { off_player_id: off, on_player_id: on, line } = ev.metadata as SwapMeta;
        if (!lu || !on || soccerUnitOf(lu, on)) break; // nothing to do, or a replayed duplicate
        const offUnit = off ? soccerUnitOf(lu, off) : null;
        let unit: SoccerUnit;
        if (off && offUnit) {
          unit = offUnit;
          closeStint(off, elapsed);
          replaceIn(lu, offUnit, off, on);
          lu.bench = lu.bench.filter((p) => p !== on && p !== off);
          lu.bench.push(off);
          if (lu.slots?.[off]) {
            lu.slots[on] = lu.slots[off];
            delete lu.slots[off];
          }
          state.lastSubbedOffMs[off] = absolute;
        } else {
          // Fill: the kid going off already left (their injury or loan
          // landed first), or the place was empty. The event's line wins;
          // without one, the kid coming on takes the spot that was left.
          const spot = off ? vacated[off] : undefined;
          const target = isUnit(line) ? line : spot?.unit;
          if (!target || !place(lu, on, target, spot?.unit === target ? spot.index : undefined)) break;
          if (off) delete vacated[off];
          unit = target;
          lu.bench = lu.bench.filter((p) => p !== on);
        }
        delete vacated[on];
        openStint(on, unit, elapsed);
        state.lastSubbedOnMs[on] = absolute;
        break;
      }

      case "field_zone_swap": {
        const lu = state.lineup;
        const { player_a_id: a, player_b_id: b, zone_b } = ev.metadata as ZoneSwapMeta;
        if (!lu || !a) break;
        // Where they are now wins over where the event says (an earlier
        // move may have landed since it was read).
        const ua = soccerUnitOf(lu, a);
        if (!ua) break;
        if (b) {
          const ub = soccerUnitOf(lu, b);
          if (!ub) break;
          if (ua === ub) {
            // Same line: they swap spots in it, and their time stays there.
            if (ua !== "gk") {
              const row = lu.lines[ua];
              const i = row.indexOf(a);
              const j = row.indexOf(b);
              [row[i], row[j]] = [row[j], row[i]];
            }
            break;
          }
          closeStint(a, elapsed);
          closeStint(b, elapsed);
          // Swap places: each takes the other's spot.
          replaceIn(lu, ua, a, b);
          replaceIn(lu, ub, b, a);
          if (lu.slots) {
            const sa = lu.slots[a];
            const sb = lu.slots[b];
            delete lu.slots[a];
            delete lu.slots[b];
            if (sb) lu.slots[a] = sb;
            if (sa) lu.slots[b] = sa;
          }
          openStint(a, ub, elapsed);
          openStint(b, ua, elapsed);
        } else {
          if (!isUnit(zone_b) || zone_b === ua) break;
          if (zone_b === "gk" && lu.keeper) break;
          closeStint(a, elapsed);
          removeFromField(lu, a);
          place(lu, a, zone_b);
          openStint(a, zone_b, elapsed);
        }
        break;
      }

      case "goal":
      case "opponent_goal": {
        const side = ev.type === "goal" ? "ours" : "theirs";
        // A goal added later says which period it was scored in.
        const period = typeof meta.intended_quarter === "number" ? meta.intended_quarter : state.currentPeriod;
        if (side === "ours") {
          state.teamScore.goals++;
          if (ev.player_id) state.playerGoals[ev.player_id] = (state.playerGoals[ev.player_id] ?? 0) + 1;
          if (meta.own_goal === true) state.ownGoals++;
        } else {
          state.opponentScore.goals++;
        }
        periodScore(period)[side]++;
        standing.push({
          id: ev.id,
          side,
          player: side === "ours" ? ev.player_id : null,
          period,
          ...(side === "ours" && meta.own_goal === true ? { own: true } : {}),
        });
        break;
      }

      case "score_undo": {
        const undone = takeUndoTarget(standing, ev.metadata);
        if (!undone) break;
        const slot = periodScore(undone.period);
        slot[undone.side] = Math.max(0, slot[undone.side] - 1);
        if (undone.side === "theirs") {
          state.opponentScore.goals = Math.max(0, state.opponentScore.goals - 1);
        } else {
          state.teamScore.goals = Math.max(0, state.teamScore.goals - 1);
          if (undone.player && state.playerGoals[undone.player]) {
            state.playerGoals[undone.player] = Math.max(0, state.playerGoals[undone.player] - 1);
          }
          if (undone.own) state.ownGoals = Math.max(0, state.ownGoals - 1);
        }
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
          break;
        }
        if (!state.injuredIds.includes(pid)) state.injuredIds.push(pid);
        if (state.lineup && soccerUnitOf(state.lineup, pid)) {
          closeStint(pid, elapsed);
          leaveField(state.lineup, pid);
          toBench(state.lineup, pid);
        }
        break;
      }

      case "player_loan": {
        const pid = ev.player_id;
        if (!pid) break;
        const loaned = (ev.metadata as { loaned?: boolean }).loaned ?? true;
        if (loaned) {
          if (!state.loanedIds.includes(pid)) state.loanedIds.push(pid);
          if (state.lineup && soccerUnitOf(state.lineup, pid)) {
            closeStint(pid, elapsed);
            leaveField(state.lineup, pid);
            toBench(state.lineup, pid);
          }
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
        // player_lock is read below; anything else isn't soccer's.
        break;
    }
  }

  // The period in play: credit time so far, and its keeper now.
  if (inPlay()) {
    if (typeof opts.nowMs === "number") {
      for (const [pid, start] of Object.entries(stintStart)) credit(pid, stintUnit[pid], opts.nowMs - start);
    }
    state.keeperAtEnd[state.currentPeriod] = state.lineup?.keeper ?? null;
  }
  state.locks = replayLocks(sorted);
  return state;
}
