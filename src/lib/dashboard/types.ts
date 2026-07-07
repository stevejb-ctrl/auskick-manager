import type { Zone } from "@/lib/types";

export interface Season {
  year: number;
  gameCount: number;
}

export type ZoneMs = Record<Zone, number>;

export function emptyZoneMs(): ZoneMs {
  return { back: 0, hback: 0, mid: 0, hfwd: 0, fwd: 0 };
}

/** A continuous interval of stable lineup in one quarter. */
export interface LineupPeriod {
  gameId: string;
  quarter: number;
  startMs: number;
  endMs: number;
  /** Players currently in each zone during this period. */
  zonePlayers: Record<Zone, string[]>;
  goalsFor: number;
  goalsAgainst: number;
}

/** Everything derived from one completed game's event log. */
export interface GameSnapshot {
  gameId: string;
  /** Zone time in milliseconds (not minutes) per player. */
  playerZoneMs: Record<string, ZoneMs>;
  playerGoals: Record<string, number>;
  playerBehinds: Record<string, number>;
  subsIn: Record<string, number>;
  subsOut: Record<string, number>;
  /** Milliseconds each player spent loaned to the opposition this game. */
  playerLoanMs: Record<string, number>;
  /** Team score keyed by quarter number. */
  teamScoreByQtr: Record<number, { goals: number; behinds: number }>;
  oppScoreByQtr: Record<number, { goals: number; behinds: number }>;
  lineupPeriods: LineupPeriod[];
  /** All player IDs seen in any lineup_set event for this game. */
  playerIds: string[];
  /**
   * Total playing time of the game in ms — sum of every quarter's
   * `quarter_end` elapsed_ms. This is the on-field time a player who was
   * never benched would accrue, so it's the denominator for "% of
   * available time". Mirrors netball's `gameLengthMs`.
   */
  gameLengthMs: number;
  /**
   * Per-player AVAILABLE time in ms = `gameLengthMs` minus the time
   * before the player joined the game. A starter is the full game length;
   * a LATE ARRIVAL is only charged from when they showed up, so they're
   * not penalised in "% of available time" for minutes they were never
   * there for. Keyed by player id; players who never appeared are absent.
   */
  playerAvailableMs: Record<string, number>;
}

export interface PlayerSeasonStats {
  playerId: string;
  playerName: string;
  jerseyNumber: number | null;
  gamesPlayed: number;
  totalMs: number;
  avgMsPerGame: number;
  zoneMs: ZoneMs;
  goals: number;
  behinds: number;
  subsIn: number;
  subsOut: number;
  /**
   * % of AVAILABLE time on the field: on-field ms / the total playing
   * time of every game the player was present for. 100% = never benched
   * across every game attended; lower = more time on the bench.
   */
  teamGameTimePct: number;
  /** Total ms lent to the opposition across the season. */
  loanMs: number;
}

export interface ZoneCombination {
  zone: Zone;
  playerIds: string[];
  durationMs: number;
  goalsFor: number;
  goalsAgainst: number;
  netDiff: number;
  /** < 20 min combined = low confidence. */
  isLowConfidence: boolean;
}

export interface PlayerChemistryPair {
  playerAId: string;
  playerBId: string;
  durationMs: number;
  goalsFor: number;
  goalsAgainst: number;
  netDiff: number;
}

export interface PositionFitRow {
  playerId: string;
  zone: Zone;
  durationMs: number;
  /** Goals per 90 min while in this zone. */
  goalsForRate: number;
  goalsAgainstRate: number;
}

export interface HeadToHeadRecord {
  opponent: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  goalsFor: number;
  behindsFor: number;
  goalsAgainst: number;
  behindsAgainst: number;
}

export interface QuarterScoringRow {
  quarter: number;
  avgGoalsFor: number;
  avgBehindsFor: number;
  avgGoalsAgainst: number;
  avgBehindsAgainst: number;
  gamesCount: number;
}

export interface AttendanceRow {
  playerId: string;
  playerName: string;
  jerseyNumber: number | null;
  gamesAvailable: number;
  gamesPlayed: number;
  attendancePct: number;
}
