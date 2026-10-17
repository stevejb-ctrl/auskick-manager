// ─── Football (soccer) season aggregate ──────────────────────
// Stats for a soccer team's finished games, through the same replay the
// live screen uses (lib/sports/soccer/replay), so live and post-game
// numbers agree. Pure.

import type { GameEvent } from "@/lib/types";
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
  perPlayer: Record<string, SoccerSeasonPlayerStats>;
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

    const ids = new Set([...Object.keys(state.ms), ...Object.keys(state.playerGoals)]);
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
