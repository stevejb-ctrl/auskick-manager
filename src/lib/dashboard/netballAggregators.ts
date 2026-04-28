// ─── Netball stats aggregators ───────────────────────────────
// Per-game and per-season rollups for the netball stats dashboard.
// Mirrors the shape of the AFL aggregators in ./aggregators.ts but
// uses netball's primitives — three thirds (attack / centre /
// defence), seven named positions (GS / GA / WA / C / WD / GD / GK),
// goals-only scoring (no behinds, no points calc).
//
// Most of the heavy lifting (per-player time-by-third, per-player
// goal counts, lineup-set / period_break_swap event walks) lives in
// netball/fairness.ts and is reused here verbatim.

import {
  playerThirdMs,
  type PlayerThirdMs,
} from "@/lib/sports/netball/fairness";
import { primaryThirdFor, netballSport } from "@/lib/sports/netball";
import type { Game, GameEvent, GameAvailability, Player } from "@/lib/types";
import type { AttendanceRow, Season } from "@/lib/dashboard/types";

const MS_PER_MIN = 60_000;
const ALL_POSITIONS = ["gs", "ga", "wa", "c", "wd", "gd", "gk"] as const;
type NetballPosition = (typeof ALL_POSITIONS)[number];

// ─── Game-level snapshot ─────────────────────────────────────
// One per completed game. Aggregated from that game's event log.
export interface NetballGameSnapshot {
  gameId: string;
  /** Per-player time-by-third in ms. */
  playerThirdMs: Record<string, PlayerThirdMs>;
  /** Per-player goal count for THIS game (us, attributed only). */
  playerGoals: Record<string, number>;
  /** Per-player position-appearance count for THIS game (lineup events). */
  playerPositionCounts: Record<string, Partial<Record<NetballPosition, number>>>;
  /** Team and opponent goals by quarter. Goals-only — netball has no behinds. */
  teamGoalsByQtr: Record<number, number>;
  oppGoalsByQtr: Record<number, number>;
  /** Quarter length in ms — needed for per-game time-pct computation. */
  quarterLengthMs: number;
  /** Full game length (4 × quarterLengthMs). */
  gameLengthMs: number;
  /**
   * Pairs of players who shared a third for some duration this game.
   * Drives the chemistry section. Key is a sorted "a:b" pair.
   */
  pairThirdMs: Record<string, number>;
  /** All player ids that appeared in any lineup event for this game. */
  playerIds: string[];
}

// ─── Season-level aggregates ─────────────────────────────────
export interface NetballPlayerSeasonStats {
  playerId: string;
  playerName: string;
  gamesPlayed: number;
  totalMs: number;
  avgMsPerGame: number;
  thirdMs: PlayerThirdMs;
  /** Per-position appearance count across the season. */
  positionCounts: Partial<Record<NetballPosition, number>>;
  goals: number;
  /** % of total possible on-court time across games they played. */
  teamGameTimePct: number;
}

export interface NetballChemistryPair {
  playerAId: string;
  playerBId: string;
  /** Time both players were in the same third together (across season). */
  durationMs: number;
}

export interface NetballHeadToHeadRecord {
  opponent: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  goalsFor: number;
  goalsAgainst: number;
}

// ─── Replay one game → snapshot ──────────────────────────────
// Walks events for a single game and rolls up per-player time, goals,
// per-quarter scores, and shared-third pair time.
export function replayNetballGameForStats(
  gameId: string,
  events: GameEvent[],
  quarterLengthSeconds: number,
): NetballGameSnapshot {
  const sorted = [...events].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const quarterLengthMs = quarterLengthSeconds * 1000;

  // Per-player time-by-third — reuse the netball fairness helper. It
  // already handles lineup_set / period_break_swap + midQuarterSubs
  // properly, including the closed-quarter credit split.
  const thirdMsMap = playerThirdMs(
    sorted,
    null,
    quarterLengthSeconds,
    primaryThirdFor as (
      posId: string,
    ) => "attack-third" | "centre-third" | "defence-third" | null,
  );
  const playerThirdMsRecord: Record<string, PlayerThirdMs> = {};
  thirdMsMap.forEach((v, k) => {
    playerThirdMsRecord[k] = { ...v };
  });

  const playerGoals: Record<string, number> = {};
  const playerPositionCounts: Record<
    string,
    Partial<Record<NetballPosition, number>>
  > = {};
  const teamGoalsByQtr: Record<number, number> = {};
  const oppGoalsByQtr: Record<number, number> = {};
  const pairThirdMs: Record<string, number> = {};
  const playerIds = new Set<string>();

  // Track score-undo via LIFO stack.
  const undoStack: Array<{ kind: "team-anon" | "opp" } | { kind: "team-player"; player: string }> = [];
  let currentQuarter = 0;

  // Per-pair time tally: walk the lineup_set + period_break_swap
  // events, credit each pair (a, b) sharing a third with the
  // quarter's worth of ms (or quarter-end's elapsed_ms when present).
  // We emit pair time using quarterLengthMs as a baseline — accurate
  // enough for "who plays best together" stats given the noise of
  // 1-min test quarters and 8-min real ones.
  const incPair = (a: string, b: string, ms: number) => {
    if (a === b) return;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    pairThirdMs[key] = (pairThirdMs[key] ?? 0) + ms;
  };

  for (const ev of sorted) {
    const meta = (ev.metadata ?? {}) as {
      lineup?: { positions?: Record<string, string[]>; bench?: string[] };
      quarter?: number;
      elapsed_ms?: number;
      target?: string;
    };
    if (ev.type === "lineup_set" || ev.type === "period_break_swap") {
      const lineup = meta.lineup ?? {};
      const positions = lineup.positions ?? {};
      // Per-position count + per-pair shared-third time for the
      // quarter this lineup represents.
      const byThird: Record<string, string[]> = {};
      for (const [posId, ids] of Object.entries(positions)) {
        for (const pid of ids ?? []) {
          if (!pid) continue;
          playerIds.add(pid);
          const pcounts = (playerPositionCounts[pid] ??= {});
          const pos = posId as NetballPosition;
          pcounts[pos] = (pcounts[pos] ?? 0) + 1;
          const t = primaryThirdFor(posId);
          if (!t) continue;
          (byThird[t] ??= []).push(pid);
        }
      }
      for (const ids of Object.values(byThird)) {
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            incPair(ids[i], ids[j], quarterLengthMs);
          }
        }
      }
      // Bench appearances also seed playerIds so the snapshot's
      // squad list matches "anyone who showed up in any lineup".
      for (const pid of lineup.bench ?? []) {
        if (pid) playerIds.add(pid);
      }
    } else if (ev.type === "quarter_start" && meta.quarter) {
      currentQuarter = meta.quarter;
    } else if (ev.type === "goal") {
      teamGoalsByQtr[currentQuarter] = (teamGoalsByQtr[currentQuarter] ?? 0) + 1;
      if (ev.player_id) {
        playerGoals[ev.player_id] = (playerGoals[ev.player_id] ?? 0) + 1;
        undoStack.push({ kind: "team-player", player: ev.player_id });
      } else {
        undoStack.push({ kind: "team-anon" });
      }
    } else if (ev.type === "opponent_goal") {
      oppGoalsByQtr[currentQuarter] = (oppGoalsByQtr[currentQuarter] ?? 0) + 1;
      undoStack.push({ kind: "opp" });
    } else if (ev.type === "score_undo" && undoStack.length > 0) {
      const last = undoStack.pop();
      if (!last) continue;
      if (last.kind === "opp") {
        oppGoalsByQtr[currentQuarter] = Math.max(
          0,
          (oppGoalsByQtr[currentQuarter] ?? 0) - 1,
        );
      } else {
        teamGoalsByQtr[currentQuarter] = Math.max(
          0,
          (teamGoalsByQtr[currentQuarter] ?? 0) - 1,
        );
        if (last.kind === "team-player") {
          playerGoals[last.player] = Math.max(
            0,
            (playerGoals[last.player] ?? 0) - 1,
          );
        }
      }
    }
  }

  return {
    gameId,
    playerThirdMs: playerThirdMsRecord,
    playerGoals,
    playerPositionCounts,
    teamGoalsByQtr,
    oppGoalsByQtr,
    quarterLengthMs,
    gameLengthMs: quarterLengthMs * 4,
    pairThirdMs,
    playerIds: Array.from(playerIds),
  };
}

// ─── Season-level rollups ────────────────────────────────────
export function computeNetballPlayerStats(
  players: Player[],
  snapshots: NetballGameSnapshot[],
): NetballPlayerSeasonStats[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const totals = new Map<
    string,
    {
      gamesPlayed: number;
      totalMs: number;
      thirdMs: PlayerThirdMs;
      positionCounts: Partial<Record<NetballPosition, number>>;
      goals: number;
      onCourtCapacityMs: number;
    }
  >();
  const ensure = (pid: string) => {
    let row = totals.get(pid);
    if (!row) {
      row = {
        gamesPlayed: 0,
        totalMs: 0,
        thirdMs: { attack: 0, centre: 0, defence: 0 },
        positionCounts: {},
        goals: 0,
        onCourtCapacityMs: 0,
      };
      totals.set(pid, row);
    }
    return row;
  };

  for (const snap of snapshots) {
    for (const pid of snap.playerIds) {
      const row = ensure(pid);
      const t = snap.playerThirdMs[pid];
      const playedMs = t ? t.attack + t.centre + t.defence : 0;
      if (playedMs > 0) {
        row.gamesPlayed++;
        row.totalMs += playedMs;
        row.thirdMs.attack += t.attack;
        row.thirdMs.centre += t.centre;
        row.thirdMs.defence += t.defence;
        // Capacity: full game length per game they played in. Used
        // for the % team game time below.
        row.onCourtCapacityMs += snap.gameLengthMs;
      }
      const counts = snap.playerPositionCounts[pid] ?? {};
      for (const [pos, n] of Object.entries(counts)) {
        const p = pos as NetballPosition;
        row.positionCounts[p] = (row.positionCounts[p] ?? 0) + (n ?? 0);
      }
      row.goals += snap.playerGoals[pid] ?? 0;
    }
  }

  const out: NetballPlayerSeasonStats[] = [];
  totals.forEach((row, pid) => {
    const player = byId.get(pid);
    out.push({
      playerId: pid,
      playerName: player?.full_name ?? "Unknown",
      gamesPlayed: row.gamesPlayed,
      totalMs: row.totalMs,
      avgMsPerGame: row.gamesPlayed > 0 ? row.totalMs / row.gamesPlayed : 0,
      thirdMs: row.thirdMs,
      positionCounts: row.positionCounts,
      goals: row.goals,
      teamGameTimePct:
        row.onCourtCapacityMs > 0
          ? Math.round((row.totalMs / row.onCourtCapacityMs) * 100)
          : 0,
    });
  });
  // Sort by total minutes descending — most-played first.
  return out.sort((a, b) => b.totalMs - a.totalMs);
}

export function computeNetballChemistry(
  snapshots: NetballGameSnapshot[],
): NetballChemistryPair[] {
  const totals: Record<string, number> = {};
  for (const snap of snapshots) {
    for (const [key, ms] of Object.entries(snap.pairThirdMs)) {
      totals[key] = (totals[key] ?? 0) + ms;
    }
  }
  const pairs: NetballChemistryPair[] = [];
  for (const [key, ms] of Object.entries(totals)) {
    const [a, b] = key.split(":");
    pairs.push({ playerAId: a, playerBId: b, durationMs: ms });
  }
  // Top-N by duration descending.
  return pairs.sort((x, y) => y.durationMs - x.durationMs);
}

export function computeNetballHeadToHead(
  games: Game[],
  snapshots: NetballGameSnapshot[],
): NetballHeadToHeadRecord[] {
  const byId = new Map(snapshots.map((s) => [s.gameId, s]));
  const byOpp = new Map<string, NetballHeadToHeadRecord>();
  for (const game of games) {
    const snap = byId.get(game.id);
    if (!snap) continue;
    const opp = game.opponent;
    let row = byOpp.get(opp);
    if (!row) {
      row = {
        opponent: opp,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        goalsFor: 0,
        goalsAgainst: 0,
      };
      byOpp.set(opp, row);
    }
    const teamGoals = Object.values(snap.teamGoalsByQtr).reduce(
      (a, b) => a + b,
      0,
    );
    const oppGoals = Object.values(snap.oppGoalsByQtr).reduce(
      (a, b) => a + b,
      0,
    );
    row.gamesPlayed++;
    row.goalsFor += teamGoals;
    row.goalsAgainst += oppGoals;
    if (teamGoals > oppGoals) row.wins++;
    else if (teamGoals < oppGoals) row.losses++;
    else row.draws++;
  }
  return Array.from(byOpp.values()).sort((a, b) => b.gamesPlayed - a.gamesPlayed);
}

export function computeNetballAttendance(
  players: Player[],
  games: Game[],
  availability: GameAvailability[],
): AttendanceRow[] {
  const gameIds = new Set(games.map((g) => g.id));
  const availBy: Record<string, number> = {};
  for (const a of availability) {
    if (!gameIds.has(a.game_id)) continue;
    if (a.status !== "available") continue;
    availBy[a.player_id] = (availBy[a.player_id] ?? 0) + 1;
  }
  const total = games.length;
  const rows: AttendanceRow[] = [];
  for (const p of players) {
    const avail = availBy[p.id] ?? 0;
    rows.push({
      playerId: p.id,
      playerName: p.full_name,
      // jerseyNumber on netball players is null — we keep the field
      // present on the row so AttendanceTable's existing column
      // header stays consistent (it just renders empty).
      jerseyNumber: p.jersey_number,
      gamesAvailable: avail,
      gamesPlayed: avail, // same — we count "available" as "showed up"
      attendancePct: total > 0 ? Math.round((avail / total) * 100) : 0,
    });
  }
  // Sort by attendance pct descending so most-reliable players are at
  // the top.
  return rows.sort((a, b) => b.attendancePct - a.attendancePct);
}

// Helpers used by the dashboard shell.
export function netballPositionLabel(pos: NetballPosition): string {
  const found = netballSport.allPositions.find((p) => p.id === pos);
  return found?.shortLabel ?? pos.toUpperCase();
}
export const NETBALL_ALL_POSITIONS: readonly NetballPosition[] = ALL_POSITIONS;
export type { NetballPosition };

// Re-export from existing dashboard types so callers don't need two
// imports. Seasons are sport-agnostic.
export type { Season, AttendanceRow };

// MS_PER_MIN re-export for components.
export { MS_PER_MIN };
