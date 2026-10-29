/**
 * Pure aggregator functions for the coach/manager dashboard.
 * Each function accepts raw data and returns the shape each section component needs.
 */
import type { Game, GameAvailability, Player, Zone } from "@/lib/types";
import { ALL_ZONES } from "@/lib/fairness";
import {
  type AttendanceRow,
  type GameSnapshot,
  type HeadToHeadRecord,
  type PlayerChemistryPair,
  type PlayerSeasonStats,
  type PositionFitRow,
  type QuarterScoringRow,
  type Season,
  type ZoneCombination,
  emptyZoneMs,
} from "./types";

// ─── Season derivation ───────────────────────────────────────

// Every year with a game is a season to pick, but the count is games
// played: next week's fixture read "2026 (4 games)" beside "3 completed
// games" (Stagehand round 7, 28 Oct 2026).
export function deriveSeasons(games: Game[]): Season[] {
  const counts: Record<number, number> = {};
  for (const g of games) {
    const year = new Date(g.scheduled_at).getFullYear();
    counts[year] = (counts[year] ?? 0) + (g.status === "completed" ? 1 : 0);
  }
  return Object.entries(counts)
    .map(([y, c]) => ({ year: Number(y), gameCount: c }))
    .sort((a, b) => b.year - a.year);
}

/**
 * The season Stats opens on: the latest season a game was played in (up
 * to today), else this year if it has games, else the soonest season.
 * It opened on the newest year with any game, so one mistyped 9999
 * fixture, or next season's first game added in December, showed "0
 * completed games" (UX round 3, 24 Oct 2026). Null with no games.
 */
export function defaultSeasonYear(
  games: readonly Pick<Game, "scheduled_at" | "status">[],
  now: Date = new Date(),
): number | null {
  const year = (g: Pick<Game, "scheduled_at">) => new Date(g.scheduled_at).getFullYear();
  const played = games.filter((g) => g.status === "completed" && Date.parse(g.scheduled_at) <= now.getTime());
  if (played.length > 0) return Math.max(...played.map(year));
  const years = games.map(year);
  if (years.length === 0) return null;
  if (years.includes(now.getFullYear())) return now.getFullYear();
  const ahead = years.filter((y) => y > now.getFullYear());
  return ahead.length > 0 ? Math.min(...ahead) : Math.max(...years);
}

export function filterBySeason(games: Game[], year: number): Game[] {
  return games.filter((g) => new Date(g.scheduled_at).getFullYear() === year);
}

// ─── Section 1: Per-player season stats ──────────────────────

export function computePlayerStats(
  players: Player[],
  snapshots: GameSnapshot[],
  seasonGames: Game[]
): PlayerSeasonStats[] {
  const playerMap = new Map(players.map((p) => [p.id, p]));

  // Players who actually took part (had non-zero zone time OR were loaned to
  // the opposition in at least one game).
  const allPlayerIds = new Set<string>();
  for (const snap of snapshots) {
    for (const pid of Object.keys(snap.playerZoneMs)) {
      const total = ALL_ZONES.reduce((s, z) => s + snap.playerZoneMs[pid][z], 0);
      if (total > 0) allPlayerIds.add(pid);
    }
    for (const [pid, ms] of Object.entries(snap.playerLoanMs ?? {})) {
      if (ms > 0) allPlayerIds.add(pid);
    }
  }

  const stats: PlayerSeasonStats[] = [];

  for (const pid of Array.from(allPlayerIds)) {
    const player = playerMap.get(pid);
    const name = player?.full_name ?? "Unknown";
    const jersey = player?.jersey_number ?? null;

    let gamesPlayed = 0;
    let totalMs = 0;
    // Available time = the full playing time of every game this player was
    // PRESENT for (in a lineup, field or bench). Dividing on-field time by
    // this gives "% of available time" — i.e. how much of the time they
    // COULD have been on, they actually were. A never-benched ever-present
    // player is 100%; a heavy bencher is lower. This is what surfaces who's
    // sitting more than their team-mates. Steve 2026-07-07.
    let availableMs = 0;
    const zoneMs = emptyZoneMs();
    let goals = 0;
    let behinds = 0;
    let siCount = 0;
    let soCount = 0;
    let loanMs = 0;

    for (const snap of snapshots) {
      const zm = snap.playerZoneMs[pid];
      const gameMs = zm ? ALL_ZONES.reduce((s, z) => s + zm[z], 0) : 0;
      if (gameMs > 0) {
        gamesPlayed++;
        totalMs += gameMs;
        for (const z of ALL_ZONES) zoneMs[z] += zm?.[z] ?? 0;
      }
      // Present at this game → their available time counts, whether they
      // played the whole thing or barely came on. A late arrival is only
      // charged from when they showed up (playerAvailableMs), so they
      // aren't penalised for minutes before they were there.
      availableMs += snap.playerAvailableMs[pid] ?? 0;
      goals += snap.playerGoals[pid] ?? 0;
      behinds += snap.playerBehinds[pid] ?? 0;
      siCount += snap.subsIn[pid] ?? 0;
      soCount += snap.subsOut[pid] ?? 0;
      loanMs += snap.playerLoanMs?.[pid] ?? 0;
    }

    const teamGameTimePct =
      availableMs > 0
        ? Math.min(100, Math.round((totalMs / availableMs) * 100))
        : 0;

    stats.push({
      playerId: pid,
      playerName: name,
      jerseyNumber: jersey,
      gamesPlayed,
      totalMs,
      avgMsPerGame: gamesPlayed > 0 ? Math.round(totalMs / gamesPlayed) : 0,
      zoneMs,
      goals,
      behinds,
      subsIn: siCount,
      subsOut: soCount,
      teamGameTimePct,
      loanMs,
    });
  }

  return stats.sort((a, b) => b.totalMs - a.totalMs);
}

// ─── Section 2: Winning combinations ─────────────────────────

interface CombinationAccum {
  zone: Zone;
  playerIds: string[];
  durationMs: number;
  goalsFor: number;
  goalsAgainst: number;
}

export function computeWinningCombinations(
  snapshots: GameSnapshot[]
): ZoneCombination[] {
  const accumMap = new Map<string, CombinationAccum>();

  for (const snap of snapshots) {
    for (const period of snap.lineupPeriods) {
      const durationMs = period.endMs - period.startMs;
      if (durationMs <= 0) continue;

      for (const zone of ALL_ZONES) {
        const players = period.zonePlayers[zone];
        if (!players || players.length === 0) continue;

        const key = `${zone}:${[...players].sort().join("|")}`;
        const existing = accumMap.get(key);
        if (existing) {
          existing.durationMs += durationMs;
          existing.goalsFor += period.goalsFor;
          existing.goalsAgainst += period.goalsAgainst;
        } else {
          accumMap.set(key, {
            zone,
            playerIds: [...players].sort(),
            durationMs,
            goalsFor: period.goalsFor,
            goalsAgainst: period.goalsAgainst,
          });
        }
      }
    }
  }

  const LOW_CONFIDENCE_MS = 20 * 60 * 1000;

  const results: ZoneCombination[] = Array.from(accumMap.values()).map((a) => ({
    zone: a.zone,
    playerIds: a.playerIds,
    durationMs: a.durationMs,
    goalsFor: a.goalsFor,
    goalsAgainst: a.goalsAgainst,
    netDiff: a.goalsFor - a.goalsAgainst,
    isLowConfidence: a.durationMs < LOW_CONFIDENCE_MS,
  }));

  return results.sort((a, b) => b.netDiff - a.netDiff || b.goalsFor - a.goalsFor);
}

/** Top 5 combos per zone. */
export function topCombosPerZone(
  combos: ZoneCombination[]
): Partial<Record<Zone, ZoneCombination[]>> {
  const byZone: Partial<Record<Zone, ZoneCombination[]>> = {};
  for (const combo of combos) {
    if (!byZone[combo.zone]) byZone[combo.zone] = [];
    byZone[combo.zone]!.push(combo);
  }
  for (const z of ALL_ZONES) {
    if (byZone[z]) byZone[z] = byZone[z]!.slice(0, 5);
  }
  return byZone;
}

// ─── Section 4: Player chemistry (top pairs) ─────────────────

export function computePlayerChemistry(
  snapshots: GameSnapshot[]
): PlayerChemistryPair[] {
  const accumMap = new Map<
    string,
    { playerAId: string; playerBId: string; durationMs: number; goalsFor: number; goalsAgainst: number }
  >();

  for (const snap of snapshots) {
    for (const period of snap.lineupPeriods) {
      const durationMs = period.endMs - period.startMs;
      if (durationMs <= 0) continue;

      const fieldPlayers: string[] = [];
      for (const z of ALL_ZONES) {
        for (const pid of period.zonePlayers[z] ?? []) {
          if (!fieldPlayers.includes(pid)) fieldPlayers.push(pid);
        }
      }

      for (let i = 0; i < fieldPlayers.length; i++) {
        for (let j = i + 1; j < fieldPlayers.length; j++) {
          const a = fieldPlayers[i];
          const b = fieldPlayers[j];
          const key = [a, b].sort().join("|");
          const existing = accumMap.get(key);
          if (existing) {
            existing.durationMs += durationMs;
            existing.goalsFor += period.goalsFor;
            existing.goalsAgainst += period.goalsAgainst;
          } else {
            const [sortedA, sortedB] = [a, b].sort();
            accumMap.set(key, {
              playerAId: sortedA,
              playerBId: sortedB,
              durationMs,
              goalsFor: period.goalsFor,
              goalsAgainst: period.goalsAgainst,
            });
          }
        }
      }
    }
  }

  return Array.from(accumMap.values())
    .map((a) => ({
      ...a,
      netDiff: a.goalsFor - a.goalsAgainst,
    }))
    .sort((a, b) => b.netDiff - a.netDiff || b.goalsFor - a.goalsFor)
    .slice(0, 10);
}

// ─── Section 5: Position fit ──────────────────────────────────

export function computePositionFit(snapshots: GameSnapshot[]): PositionFitRow[] {
  const accumMap = new Map<
    string,
    { playerId: string; zone: Zone; durationMs: number; goalsFor: number; goalsAgainst: number }
  >();

  for (const snap of snapshots) {
    for (const period of snap.lineupPeriods) {
      const durationMs = period.endMs - period.startMs;
      if (durationMs <= 0) continue;

      for (const zone of ALL_ZONES) {
        for (const pid of period.zonePlayers[zone] ?? []) {
          const key = `${pid}:${zone}`;
          const existing = accumMap.get(key);
          if (existing) {
            existing.durationMs += durationMs;
            existing.goalsFor += period.goalsFor;
            existing.goalsAgainst += period.goalsAgainst;
          } else {
            accumMap.set(key, {
              playerId: pid,
              zone,
              durationMs,
              goalsFor: period.goalsFor,
              goalsAgainst: period.goalsAgainst,
            });
          }
        }
      }
    }
  }

  const MS_PER_90 = 90 * 60 * 1000;

  return Array.from(accumMap.values()).map((a) => ({
    playerId: a.playerId,
    zone: a.zone,
    durationMs: a.durationMs,
    goalsForRate: a.durationMs > 0 ? (a.goalsFor / a.durationMs) * MS_PER_90 : 0,
    goalsAgainstRate:
      a.durationMs > 0 ? (a.goalsAgainst / a.durationMs) * MS_PER_90 : 0,
  }));
}

// ─── Section 6: Head-to-head by opponent ─────────────────────

export function computeHeadToHead(
  seasonGames: Game[],
  snapshots: GameSnapshot[],
  /** Whether a game kept score: one that didn't isn't a result (no draw). */
  keptScore: (gameId: string) => boolean = () => true,
): HeadToHeadRecord[] {
  const snapMap = new Map(snapshots.map((s) => [s.gameId, s]));

  const accumMap = new Map<
    string,
    {
      gamesPlayed: number;
      wins: number;
      losses: number;
      draws: number;
      goalsFor: number;
      behindsFor: number;
      goalsAgainst: number;
      behindsAgainst: number;
    }
  >();

  for (const game of seasonGames) {
    if (!keptScore(game.id)) continue;
    const snap = snapMap.get(game.id);
    const opponent = game.opponent;

    const teamGoals = snap
      ? Object.values(snap.teamScoreByQtr).reduce((s, q) => s + q.goals, 0)
      : 0;
    const teamBehinds = snap
      ? Object.values(snap.teamScoreByQtr).reduce((s, q) => s + q.behinds, 0)
      : 0;
    const oppGoals = snap
      ? Object.values(snap.oppScoreByQtr).reduce((s, q) => s + q.goals, 0)
      : 0;
    const oppBehinds = snap
      ? Object.values(snap.oppScoreByQtr).reduce((s, q) => s + q.behinds, 0)
      : 0;

    const teamScore = teamGoals * 6 + teamBehinds;
    const oppScore = oppGoals * 6 + oppBehinds;

    const existing = accumMap.get(opponent) ?? {
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      goalsFor: 0,
      behindsFor: 0,
      goalsAgainst: 0,
      behindsAgainst: 0,
    };

    existing.gamesPlayed++;
    existing.goalsFor += teamGoals;
    existing.behindsFor += teamBehinds;
    existing.goalsAgainst += oppGoals;
    existing.behindsAgainst += oppBehinds;

    if (snap) {
      if (teamScore > oppScore) existing.wins++;
      else if (teamScore < oppScore) existing.losses++;
      else existing.draws++;
    }

    accumMap.set(opponent, existing);
  }

  return Array.from(accumMap.entries())
    .map(([opponent, data]) => ({ opponent, ...data }))
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed);
}

// ─── Section 7: Quarter-by-quarter scoring ───────────────────

export function computeQuarterScoring(
  snapshots: GameSnapshot[]
): QuarterScoringRow[] {
  const accumMap = new Map<
    number,
    { teamGoals: number; teamBehinds: number; oppGoals: number; oppBehinds: number; gameCount: number }
  >();

  for (const snap of snapshots) {
    const scored = Object.keys(snap.teamScoreByQtr).length > 0 || Object.keys(snap.oppScoreByQtr).length > 0;
    // A game with no score recorded (scoring off) says nothing about quarters.
    if (!scored) continue;
    // Every quarter played counts, scoreless ones too (a 0–0 quarter is
    // level, not missing from the average).
    const allQuarters = new Set([
      ...Object.keys(snap.teamScoreByQtr),
      ...Object.keys(snap.oppScoreByQtr),
      ...snap.quartersPlayed.map(String),
    ]);

    for (const qStr of Array.from(allQuarters)) {
      const q = Number(qStr);
      const team = snap.teamScoreByQtr[q] ?? { goals: 0, behinds: 0 };
      const opp = snap.oppScoreByQtr[q] ?? { goals: 0, behinds: 0 };

      const existing = accumMap.get(q) ?? {
        teamGoals: 0,
        teamBehinds: 0,
        oppGoals: 0,
        oppBehinds: 0,
        gameCount: 0,
      };
      existing.teamGoals += team.goals;
      existing.teamBehinds += team.behinds;
      existing.oppGoals += opp.goals;
      existing.oppBehinds += opp.behinds;
      existing.gameCount++;
      accumMap.set(q, existing);
    }
  }

  const avg = (n: number, games: number) => (games > 0 ? n / games : 0);
  return Array.from(accumMap.entries())
    .map(([quarter, data]): QuarterScoringRow => {
      // A quarter is won on points: 1.1 (7) beats 1.0 (6).
      const avgPointsFor = avg(data.teamGoals * 6 + data.teamBehinds, data.gameCount);
      const avgPointsAgainst = avg(data.oppGoals * 6 + data.oppBehinds, data.gameCount);
      return {
        quarter,
        avgGoalsFor: avg(data.teamGoals, data.gameCount),
        avgBehindsFor: avg(data.teamBehinds, data.gameCount),
        avgGoalsAgainst: avg(data.oppGoals, data.gameCount),
        avgBehindsAgainst: avg(data.oppBehinds, data.gameCount),
        avgPointsFor,
        avgPointsAgainst,
        result: Math.abs(avgPointsFor - avgPointsAgainst) < 1e-9 ? "level" : avgPointsFor > avgPointsAgainst ? "ahead" : "behind",
        gamesCount: data.gameCount,
      };
    })
    .sort((a, b) => a.quarter - b.quarter);
}

// ─── Section 8: Attendance ───────────────────────────────────

export function computeAttendance(
  players: Player[],
  seasonGames: Game[],
  availability: GameAvailability[],
  snapshots: GameSnapshot[]
): AttendanceRow[] {
  const gameIds = new Set(seasonGames.map((g) => g.id));

  // "Available" = explicitly marked available (the coach's pre-game
  // toggle). Kept as a secondary signal.
  const availableSet = new Set(
    availability
      .filter((a) => a.status === "available" && gameIds.has(a.game_id))
      .map((a) => `${a.game_id}:${a.player_id}`)
  );

  // ATTENDANCE = games the player actually took part in — from the event
  // log, not the coach's availability toggle, which is why the old
  // availability-based % looked wrong. Steve 2026-07-07. Taking part
  // means getting on: a kid who came but sat on the bench all game
  // hasn't played (UX round 2, 24 Oct 2026).
  const gotOn = new Map<string, Set<string>>();
  for (const snap of snapshots) {
    const ids = new Set<string>();
    for (const [pid, zm] of Object.entries(snap.playerZoneMs)) {
      if (ALL_ZONES.some((z) => zm[z] > 0)) ids.add(pid);
    }
    gotOn.set(snap.gameId, ids);
  }

  return attendanceRows(players, seasonGames, (gid) => gotOn.get(gid), (gid, pid) =>
    availableSet.has(`${gid}:${pid}`),
  );
}

/**
 * Each active kid's games played out of the games they were on the
 * squad for, most reliable first. Shared by every sport's attendance
 * table. A kid added mid-season isn't charged for the games before
 * they joined (UX round 2, 24 Oct 2026: a newcomer read "1 / 2, 50%"
 * after his first game); a game they played in counts whenever they
 * were added.
 */
export function attendanceRows(
  players: Player[],
  seasonGames: Game[],
  /** Who got on in each game. */
  gotOn: (gameId: string) => ReadonlySet<string> | undefined,
  /** Marked available for the game (a secondary signal). */
  markedAvailable: (gameId: string, playerId: string) => boolean,
): AttendanceRow[] {
  const joinedBy = (player: Player, game: Game) => {
    const joined = Date.parse(player.created_at);
    return Number.isNaN(joined) || joined <= Date.parse(game.scheduled_at);
  };
  return players
    .filter((p) => p.is_active)
    .map((player) => {
      let gamesAvailable = 0;
      let gamesPlayed = 0;
      let gamesOnSquad = 0;
      for (const game of seasonGames) {
        const played = gotOn(game.id)?.has(player.id) ?? false;
        if (markedAvailable(game.id, player.id)) gamesAvailable++;
        if (played) gamesPlayed++;
        if (played || joinedBy(player, game)) gamesOnSquad++;
      }
      return {
        playerId: player.id,
        playerName: player.full_name,
        jerseyNumber: player.jersey_number,
        gamesAvailable,
        gamesPlayed,
        gamesOnSquad,
        attendancePct: gamesOnSquad > 0 ? Math.round((gamesPlayed / gamesOnSquad) * 100) : 0,
      };
    })
    .sort((a, b) => b.attendancePct - a.attendancePct);
}
