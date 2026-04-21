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
}

export interface PlayerSeasonStats {
  playerId: string;
  playerName: string;
  jerseyNumber: number;
  gamesPlayed: number;
  totalMs: number;
  avgMsPerGame: number;
  zoneMs: ZoneMs;
  goals: number;
  behinds: number;
  subsIn: number;
  subsOut: number;
  /** % of total possible on-field time across games they played. */
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
  jerseyNumber: number;
  gamesAvailable: number;
  gamesPlayed: number;
  attendancePct: number;
}
