// ─── Netball fairness — position-count-per-game ──────────────
// AFL fairness is "zone-minutes": how many minutes has each player
// spent in each zone. Netball substitutions only happen at period
// breaks, so minutes-in-position is a step function (0, 1Q, 2Q, 3Q,
// 4Q worth of minutes). The coach's real question is: has this
// player had a fair spread of positions across the season?
//
// This module counts, per player, how many times they've been
// rostered into each position. Goal Keeper 3 times + Goal Shooter
// 1 time + Wing Attack 2 times ≠ Centre 6 times. The UI surfaces
// the variance so coaches can rotate fairly.
//
// Events consumed:
//   * lineup_set          — initial lineup at start of game
//   * period_break_swap   — lineup about to take the court at each
//                           period break (Q2/Q3/Q4 lineups). metadata:
//                           { quarter: number, lineup: GenericLineup }
//   * quarter_start       — optional anchor; implicit if not present
//   * quarter_end         — closes the period's lineup count

import type { GameEvent } from "@/lib/types";

/** Generic map lineup shape used by netball game_events. */
export interface GenericLineup {
  positions: Record<string, string[]>;
  bench: string[];
}

export type PositionCount = Record<string, number>;
export type PlayerPositionCounts = Record<string, PositionCount>;

/** Safe accessor: counts for a single position. */
function inc(counts: PlayerPositionCounts, playerId: string, positionId: string): void {
  counts[playerId] ??= {};
  counts[playerId][positionId] = (counts[playerId][positionId] ?? 0) + 1;
}

/**
 * Replay one netball game → per-player, per-position appearance counts.
 * Each period where a player starts in a position increments that
 * (player, position) pair by 1. Bench periods aren't counted.
 */
export function gamePositionCounts(events: GameEvent[]): PlayerPositionCounts {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const result: PlayerPositionCounts = {};
  let currentLineup: GenericLineup | null = null;
  let quartersCounted = 0;

  const countLineup = () => {
    if (!currentLineup) return;
    for (const [posId, playerIds] of Object.entries(currentLineup.positions)) {
      for (const pid of playerIds) {
        if (pid) inc(result, pid, posId);
      }
    }
    quartersCounted++;
  };

  for (const ev of sorted) {
    const meta = ev.metadata as {
      lineup?: Partial<GenericLineup>;
      quarter?: number;
    };

    if (ev.type === "lineup_set" && meta.lineup) {
      currentLineup = normaliseGenericLineup(meta.lineup);
    } else if (ev.type === "period_break_swap" && meta.lineup) {
      // Close the current quarter's counts, then adopt the new lineup.
      countLineup();
      currentLineup = normaliseGenericLineup(meta.lineup);
    } else if (ev.type === "game_finalised" && quartersCounted < 4) {
      // Ensure the final quarter gets counted even if no period_break_swap
      // fired (happens at the end of Q4).
      countLineup();
    }
  }

  // If no game_finalised yet but we have a current lineup, count it
  // once so in-progress stats include the current quarter.
  if (quartersCounted === 0 && currentLineup) {
    countLineup();
  }

  return result;
}

/** Sum counts across many games. Input: events for an entire season. */
export function seasonPositionCounts(events: GameEvent[]): PlayerPositionCounts {
  const byGame = new Map<string, GameEvent[]>();
  for (const ev of events) {
    const arr = byGame.get(ev.game_id) ?? [];
    arr.push(ev);
    byGame.set(ev.game_id, arr);
  }
  const total: PlayerPositionCounts = {};
  byGame.forEach((gameEvents) => {
    const game = gamePositionCounts(gameEvents);
    for (const [pid, counts] of Object.entries(game)) {
      total[pid] ??= {};
      for (const [posId, n] of Object.entries(counts)) {
        total[pid][posId] = (total[pid][posId] ?? 0) + n;
      }
    }
  });
  return total;
}

/** Normalise a partial lineup map into a full { positions, bench } shape. */
export function normaliseGenericLineup(l: Partial<GenericLineup> | null | undefined): GenericLineup {
  return {
    positions: { ...(l?.positions ?? {}) },
    bench: l?.bench ? [...l.bench] : [],
  };
}

/** Empty generic lineup for netball (no positions, empty bench). */
export function emptyGenericLineup(positions: string[]): GenericLineup {
  const p: Record<string, string[]> = {};
  for (const id of positions) p[id] = [];
  return { positions: p, bench: [] };
}

/**
 * Fairness score for a netball team. Measures how evenly each player
 * has played across their positions. 100 = perfectly even rotation;
 * 0 = the most imbalanced roster possible.
 */
export function netballFairnessScore(season: PlayerPositionCounts): number {
  // For each player: compute the coefficient of variation across
  // the positions they've played. Then average across players.
  const playerCvs: number[] = [];
  for (const counts of Object.values(season)) {
    const values = Object.values(counts);
    if (values.length === 0) continue;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) continue;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
    const cv = Math.sqrt(variance) / mean;
    playerCvs.push(cv);
  }
  if (playerCvs.length === 0) return 100;
  const avgCv = playerCvs.reduce((a, b) => a + b, 0) / playerCvs.length;
  return Math.max(0, Math.min(100, Math.round((1 - avgCv) * 100)));
}

// ─── Lineup suggestion — next quarter ────────────────────────
// Given the current season counts and the positions a coach wants
// to field, suggest a lineup that moves each player toward under-
// represented positions. Respects netball rules of play (via the
// eligibility callback) so we never suggest GS on defence.
export interface NetballSuggestInput {
  /** Active player ids for this game. */
  playerIds: string[];
  /** Ordered list of position ids to fill (length = on-field size). */
  positions: string[];
  /** Season counts so far. */
  season: PlayerPositionCounts;
  /** Counts already accumulated this game (so players don't repeat in Q2 what they did in Q1). */
  thisGame: PlayerPositionCounts;
  /** (playerId, positionId) → allowed? — for zone-eligibility overrides. */
  isAllowed: (playerId: string, positionId: string) => boolean;
  /** Deterministic tie-break seed. */
  seed?: number;
}

export function suggestNetballLineup(input: NetballSuggestInput): GenericLineup {
  const { playerIds, positions, season, thisGame, isAllowed, seed = 0 } = input;
  const lineup = emptyGenericLineup(positions);
  if (playerIds.length === 0) return lineup;

  // "Owe" heuristic: prefer positions this player has played less often
  // across the season, AND hasn't played this game yet.
  const owed = (pid: string, posId: string): number => {
    const thisGameCount = thisGame[pid]?.[posId] ?? 0;
    const seasonCount = season[pid]?.[posId] ?? 0;
    const inGameBonus = thisGameCount === 0 ? 100 : 0;
    return inGameBonus - seasonCount;
  };

  const totalPlayed = (pid: string): number => {
    const counts = season[pid] ?? {};
    return Object.values(counts).reduce((a, b) => a + b, 0);
  };

  // Priority: players who've played fewest total periods go first.
  const shuffled = seededShuffle(playerIds, seed + 41);
  shuffled.sort((a, b) => totalPlayed(a) - totalPlayed(b));

  const assigned = new Set<string>();
  const remaining = new Set(positions);

  for (const pid of shuffled) {
    if (remaining.size === 0) {
      lineup.bench.push(pid);
      continue;
    }
    // Pick the open position with the highest "owed" score for this
    // player that they're also eligible for. If none, bench them.
    let bestPos: string | null = null;
    let bestScore = -Infinity;
    const remainingList = Array.from(remaining);
    for (const posId of remainingList) {
      if (!isAllowed(pid, posId)) continue;
      const s = owed(pid, posId);
      if (s > bestScore) {
        bestScore = s;
        bestPos = posId;
      }
    }
    if (bestPos === null) {
      lineup.bench.push(pid);
      continue;
    }
    lineup.positions[bestPos].push(pid);
    remaining.delete(bestPos);
    assigned.add(pid);
  }

  return lineup;
}

// ─── Replay one game → live state ────────────────────────────
export interface NetballGameState {
  lineup: GenericLineup | null;
  currentQuarter: number;
  quarterEnded: boolean;
  quarterElapsedMs: number;
  teamScore: { goals: number };
  opponentScore: { goals: number };
  /** Goals attributed per player, if player_id was set on the goal event. */
  playerGoals: Record<string, number>;
  finalised: boolean;
  /** ISO timestamp of the current quarter_start event; null when quarter ended. */
  quarterStartedAt: string | null;
}

export function replayNetballGame(events: GameEvent[]): NetballGameState {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const state: NetballGameState = {
    lineup: null,
    currentQuarter: 0,
    quarterEnded: false,
    quarterElapsedMs: 0,
    teamScore: { goals: 0 },
    opponentScore: { goals: 0 },
    playerGoals: {},
    finalised: false,
    quarterStartedAt: null,
  };

  // score_undo: stack the last-N score events to revert.
  const undoStack: Array<"team" | "opp" | { player: string }> = [];

  for (const ev of sorted) {
    const meta = ev.metadata as {
      lineup?: Partial<GenericLineup>;
      quarter?: number;
      elapsed_ms?: number;
      target?: string;
    };

    if (ev.type === "lineup_set" && meta.lineup) {
      state.lineup = normaliseGenericLineup(meta.lineup);
    } else if (ev.type === "period_break_swap" && meta.lineup) {
      state.lineup = normaliseGenericLineup(meta.lineup);
    } else if (ev.type === "quarter_start" && meta.quarter) {
      state.currentQuarter = meta.quarter;
      state.quarterEnded = false;
      state.quarterElapsedMs = 0;
      state.quarterStartedAt = ev.created_at;
    } else if (ev.type === "quarter_end") {
      state.quarterEnded = true;
      state.quarterStartedAt = null;
      state.quarterElapsedMs = meta.elapsed_ms ?? state.quarterElapsedMs;
    } else if (ev.type === "game_finalised") {
      state.finalised = true;
    } else if (ev.type === "goal") {
      state.teamScore.goals++;
      if (ev.player_id) {
        state.playerGoals[ev.player_id] = (state.playerGoals[ev.player_id] ?? 0) + 1;
        undoStack.push({ player: ev.player_id });
      } else {
        undoStack.push("team");
      }
    } else if (ev.type === "opponent_goal") {
      state.opponentScore.goals++;
      undoStack.push("opp");
    } else if (ev.type === "score_undo" && undoStack.length > 0) {
      const last = undoStack.pop()!;
      if (last === "opp") {
        state.opponentScore.goals = Math.max(0, state.opponentScore.goals - 1);
      } else if (last === "team") {
        state.teamScore.goals = Math.max(0, state.teamScore.goals - 1);
      } else {
        state.teamScore.goals = Math.max(0, state.teamScore.goals - 1);
        if (last.player && state.playerGoals[last.player]) {
          state.playerGoals[last.player] = Math.max(0, state.playerGoals[last.player] - 1);
        }
      }
    }
  }

  return state;
}

function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const a = [...arr];
  let s = (seed | 0) >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Per-third time accounting ──────────────────────────────
// Like AFL's per-zone minutes, but bucketed by netball's three thirds
// (attack / centre / defence). Each completed quarter contributes
// `periodSeconds` worth of time to whatever third the player's position
// rolled into via primaryThirdFor. The trailing in-progress quarter
// contributes `inProgressMs` (the live clockMs) when the game isn't
// finalised yet, so live court tiles show partial time.
export interface PlayerThirdMs {
  attack: number;
  centre: number;
  defence: number;
}

export interface ThirdLookup {
  (positionId: string): "attack-third" | "centre-third" | "defence-third" | null;
}

export function playerThirdMs(
  events: GameEvent[],
  inProgressMs: number | null,
  periodSeconds: number,
  thirdLookup: ThirdLookup,
): Map<string, PlayerThirdMs> {
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const out = new Map<string, PlayerThirdMs>();
  const ensure = (pid: string): PlayerThirdMs => {
    let s = out.get(pid);
    if (!s) {
      s = { attack: 0, centre: 0, defence: 0 };
      out.set(pid, s);
    }
    return s;
  };
  const addLineupTime = (lineup: GenericLineup, ms: number) => {
    for (const [posId, ids] of Object.entries(lineup.positions)) {
      const third = thirdLookup(posId);
      if (!third) continue;
      for (const pid of ids) {
        if (!pid) continue;
        const s = ensure(pid);
        if (third === "attack-third") s.attack += ms;
        else if (third === "centre-third") s.centre += ms;
        else if (third === "defence-third") s.defence += ms;
      }
    }
  };

  let currentLineup: GenericLineup | null = null;
  let hasFinalised = false;

  for (const ev of sorted) {
    const meta = ev.metadata as { lineup?: Partial<GenericLineup> };
    if (ev.type === "lineup_set" && meta.lineup) {
      currentLineup = normaliseGenericLineup(meta.lineup);
    } else if (ev.type === "period_break_swap" && meta.lineup) {
      if (currentLineup) addLineupTime(currentLineup, periodSeconds * 1000);
      currentLineup = normaliseGenericLineup(meta.lineup);
    } else if (ev.type === "game_finalised") {
      if (currentLineup) addLineupTime(currentLineup, periodSeconds * 1000);
      currentLineup = null;
      hasFinalised = true;
    }
  }

  if (!hasFinalised && currentLineup) {
    const ms = inProgressMs ?? periodSeconds * 1000;
    addLineupTime(currentLineup, ms);
  }

  return out;
}

export function formatMinSec(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
