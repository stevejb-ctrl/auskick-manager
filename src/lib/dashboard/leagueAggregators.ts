// ─── Rugby league stats aggregators ──────────────────────────
// Per-game and per-season rollups for the rugby-league stats
// dashboard. Mirrors the shape of the AFL aggregators in
// ./aggregators.ts and the netball aggregators in
// ./netballAggregators.ts but uses RL primitives: tries, conversions
// (attempted + made), vested-role assignments (FR / DH), kickoff
// rotations, and unbroken-period compliance.
//
// Most of the per-game derivation reuses helpers from
// rugby_league/{fairness,vests,kicks}.ts so the same algorithms
// power the live game UI AND the post-game dashboard.

import {
  replayLeagueGame,
  unbrokenPeriodCompliance,
  type UnbrokenPeriodCompliance,
} from "@/lib/sports/rugby_league/fairness";
import {
  vestHistoryByPlayer,
} from "@/lib/sports/rugby_league/vests";
import {
  kickoffTakers,
} from "@/lib/sports/rugby_league/kicks";
import { getAgeGroupConfig } from "@/lib/sports/registry";
import type { Game, GameEvent } from "@/lib/types";

// ─── Per-game snapshot ───────────────────────────────────────

export interface LeagueGameSnapshot {
  gameId: string;
  /** Tries credited to each player THIS game (player_id on try events). */
  playerTries: Record<string, number>;
  /** Conversion attempts + made per player THIS game. */
  playerConversions: Record<string, { attempts: number; made: number }>;
  /** Set of players who took a kickoff this game. */
  kickoffTakerIds: Set<string>;
  /**
   * Per-player vest history for THIS game.
   * `{ fr: [periodNumbers], dh: [periodNumbers] }`
   */
  vestsByPlayer: Record<string, { fr: number[]; dh: number[] }>;
  /** Unbroken-period compliance per player THIS game. */
  unbroken: Record<string, UnbrokenPeriodCompliance>;
  /** Team + opponent final scores. */
  teamScore: { tries: number; conversions: number; points: number };
  opponentScore: { tries: number; conversions: number; points: number };
  /** Players that appeared in any lineup / event this game. */
  playerIds: string[];
}

/**
 * Derive a single game's RL snapshot from its event log + the
 * team's age-group config (drives the unbroken-period required
 * count: 2 for U6–U9, 1 for U10–U12).
 */
export function snapshotLeagueGame(
  gameId: string,
  events: GameEvent[],
  required: number,
): LeagueGameSnapshot {
  const state = replayLeagueGame(events);
  const vests = vestHistoryByPlayer(events);
  const kickoffs = kickoffTakers(events);
  const unbroken = unbrokenPeriodCompliance(events, required);

  // Player id set = union of everyone who appeared anywhere
  // (lineup, vest, kickoff, scoring). Keeps the dashboard table
  // honest about who showed up.
  const playerIds = new Set<string>();
  Object.keys(unbroken).forEach((id) => playerIds.add(id));
  Object.keys(vests).forEach((id) => playerIds.add(id));
  kickoffs.forEach((id) => playerIds.add(id));
  Object.keys(state.playerTries).forEach((id) => playerIds.add(id));
  Object.keys(state.playerConversions).forEach((id) => playerIds.add(id));

  return {
    gameId,
    playerTries: state.playerTries,
    playerConversions: state.playerConversions,
    kickoffTakerIds: kickoffs,
    vestsByPlayer: vests,
    unbroken,
    teamScore: state.teamScore,
    opponentScore: state.opponentScore,
    playerIds: Array.from(playerIds),
  };
}

// ─── Per-season rollup ───────────────────────────────────────

export interface LeagueSeasonPlayerStats {
  playerId: string;
  /** Games this player appeared in any event (lineup, vest, kickoff, score). */
  gamesPlayed: number;
  /** Sum of tries across the season. */
  tries: number;
  /** Sum of conversion attempts across the season. */
  conversionsAttempted: number;
  /** Sum of made conversions. */
  conversionsMade: number;
  /** Total times worn FR. */
  vestFr: number;
  /** Total times worn DH. */
  vestDh: number;
  /** Total kickoffs taken. */
  kickoffs: number;
  /** Games this player met the age group's unbroken-period minimum. */
  unbrokenCompliantGames: number;
  /** Games this player appeared in but didn't meet the minimum. */
  unbrokenShortfallGames: number;
}

export interface LeagueSeasonAggregate {
  perPlayer: Record<string, LeagueSeasonPlayerStats>;
  /** Team totals across all snapshots. */
  totals: {
    games: number;
    tries: number;
    conversionsAttempted: number;
    conversionsMade: number;
    points: number;
    opponentPoints: number;
  };
}

/**
 * Roll a season's worth of `LeagueGameSnapshot`s into a flat per-
 * player table the dashboard can render directly. The input ordering
 * doesn't matter — all aggregates are commutative sums / counts.
 */
export function aggregateLeagueSeason(
  snapshots: LeagueGameSnapshot[],
): LeagueSeasonAggregate {
  const perPlayer: Record<string, LeagueSeasonPlayerStats> = {};

  function slot(id: string): LeagueSeasonPlayerStats {
    perPlayer[id] ??= {
      playerId: id,
      gamesPlayed: 0,
      tries: 0,
      conversionsAttempted: 0,
      conversionsMade: 0,
      vestFr: 0,
      vestDh: 0,
      kickoffs: 0,
      unbrokenCompliantGames: 0,
      unbrokenShortfallGames: 0,
    };
    return perPlayer[id];
  }

  const totals = {
    games: snapshots.length,
    tries: 0,
    conversionsAttempted: 0,
    conversionsMade: 0,
    points: 0,
    opponentPoints: 0,
  };

  for (const snap of snapshots) {
    totals.tries += snap.teamScore.tries;
    totals.conversionsAttempted += Object.values(snap.playerConversions).reduce(
      (acc, v) => acc + v.attempts,
      0,
    );
    totals.conversionsMade += snap.teamScore.conversions;
    totals.points += snap.teamScore.points;
    totals.opponentPoints += snap.opponentScore.points;

    for (const playerId of snap.playerIds) {
      const s = slot(playerId);
      s.gamesPlayed++;
      s.tries += snap.playerTries[playerId] ?? 0;
      const conv = snap.playerConversions[playerId];
      if (conv) {
        s.conversionsAttempted += conv.attempts;
        s.conversionsMade += conv.made;
      }
      const vest = snap.vestsByPlayer[playerId];
      if (vest) {
        s.vestFr += vest.fr.length;
        s.vestDh += vest.dh.length;
      }
      if (snap.kickoffTakerIds.has(playerId)) s.kickoffs++;
      const ubp = snap.unbroken[playerId];
      if (ubp) {
        if (ubp.compliant) s.unbrokenCompliantGames++;
        else s.unbrokenShortfallGames++;
      }
    }
  }

  return { perPlayer, totals };
}

/**
 * Convenience: aggregate a sport-aware season directly from games
 * + their events, resolving the unbroken-period requirement from
 * each game's team age-group. Used by the dashboard route which
 * has the games + events handy but doesn't want to hand-roll the
 * per-game required lookup.
 */
export function aggregateLeagueSeasonFromGames(
  games: Game[],
  eventsByGame: Record<string, GameEvent[]>,
  teamSport: string | null | undefined,
  teamAgeGroup: string | null | undefined,
): LeagueSeasonAggregate {
  const ageCfg = getAgeGroupConfig(teamSport, teamAgeGroup);
  const required = ageCfg.minUnbrokenPeriods ?? 1;
  const snaps = games.map((g) =>
    snapshotLeagueGame(g.id, eventsByGame[g.id] ?? [], required),
  );
  return aggregateLeagueSeason(snaps);
}
