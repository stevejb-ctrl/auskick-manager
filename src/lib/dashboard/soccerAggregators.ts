// ─── Football (soccer) season aggregate ──────────────────────
// Stats for a soccer team's finished games, through the same replay the
// live screen uses (lib/sports/soccer/replay), so live and post-game
// numbers agree. Pure.

import type { GameEvent } from "@/lib/types";
import { presentPlayerIds } from "@/lib/live/presentPlayers";
import { replaySoccerGame, soccerGameMs } from "@/lib/sports/soccer/replay";

export interface SoccerSeasonPlayerStats {
  playerId: string;
  /** Games they got on the field in. */
  gamesPlayed: number;
  /** Time on the field, every line and goal. */
  ms: number;
  /** Time in goal. */
  keeperMs: number;
  /** Games they kept goal in (any time at all). */
  keeperGames: number;
  goals: number;
}

export interface SoccerSeasonAggregate {
  totals: {
    games: number;
    goalsFor: number;
    goalsAgainst: number;
    wins: number;
    draws: number;
    losses: number;
  };
  /**
   * Every kid who came, at 0 if they never got on (UX round 2, 24 Oct
   * 2026: a late arrival who didn't get on vanished from the table).
   */
  perPlayer: Record<string, SoccerSeasonPlayerStats>;
  /** Goals nobody was named for: with the kids', goals for (as touch's). */
  noScorer: { goals: number };
}

/** The season so far, from each finished game's events. */
export function aggregateSoccerSeason(
  games: readonly { id: string }[],
  eventsByGame: ReadonlyMap<string, GameEvent[]> | Readonly<Record<string, GameEvent[]>>,
): SoccerSeasonAggregate {
  const eventsOf = (id: string): GameEvent[] =>
    (eventsByGame instanceof Map ? eventsByGame.get(id) : (eventsByGame as Record<string, GameEvent[]>)[id]) ?? [];
  const out: SoccerSeasonAggregate = {
    totals: { games: 0, goalsFor: 0, goalsAgainst: 0, wins: 0, draws: 0, losses: 0 },
    perPlayer: {},
    noScorer: { goals: 0 },
  };
  for (const game of games) {
    const state = replaySoccerGame(eventsOf(game.id));
    const t = out.totals;
    t.games++;
    t.goalsFor += state.teamScore.goals;
    t.goalsAgainst += state.opponentScore.goals;
    if (state.teamScore.goals > state.opponentScore.goals) t.wins++;
    else if (state.teamScore.goals < state.opponentScore.goals) t.losses++;
    else t.draws++;

    out.noScorer.goals += state.teamScore.goals - Object.values(state.playerGoals).reduce((s, n) => s + n, 0);

    const ids = new Set([...presentPlayerIds(eventsOf(game.id)), ...Object.keys(state.ms), ...Object.keys(state.playerGoals)]);
    ids.forEach((pid) => {
      const row = (out.perPlayer[pid] ??= {
        playerId: pid,
        gamesPlayed: 0,
        ms: 0,
        keeperMs: 0,
        keeperGames: 0,
        goals: 0,
      });
      const ms = soccerGameMs(state, pid);
      const keeperMs = state.ms[pid]?.gk ?? 0;
      if (ms > 0) row.gamesPlayed++;
      row.ms += ms;
      row.keeperMs += keeperMs;
      if (keeperMs > 0) row.keeperGames++;
      row.goals += state.playerGoals[pid] ?? 0;
    });
  }
  return out;
}
