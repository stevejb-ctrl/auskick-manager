// ─── Basketball season aggregate ─────────────────────────────
// Stats for a basketball team's finished games, through the same replay
// the live screen uses (lib/sports/basketball/replay), so live and
// post-game numbers agree. Pure.

import type { GameEvent } from "@/lib/types";
import { basketballGameMs, replayBasketballGame } from "@/lib/sports/basketball/replay";

export interface BasketballSeasonPlayerStats {
  playerId: string;
  /** Games they got on court in. */
  gamesPlayed: number;
  /** Time on court, every line. */
  ms: number;
  /** Time at guard and at forward (the line and position strategies). */
  guardMs: number;
  forwardMs: number;
  points: number;
  fouls: number;
  /** Games they fouled out of. */
  foulOuts: number;
}

export interface BasketballSeasonAggregate {
  totals: {
    games: number;
    pointsFor: number;
    pointsAgainst: number;
    wins: number;
    draws: number;
    losses: number;
  };
  perPlayer: Record<string, BasketballSeasonPlayerStats>;
}

/** The season so far, from each finished game's events. */
export function aggregateBasketballSeason(
  games: readonly { id: string }[],
  eventsByGame: ReadonlyMap<string, GameEvent[]> | Readonly<Record<string, GameEvent[]>>,
): BasketballSeasonAggregate {
  const eventsOf = (id: string): GameEvent[] =>
    (eventsByGame instanceof Map ? eventsByGame.get(id) : (eventsByGame as Record<string, GameEvent[]>)[id]) ?? [];
  const out: BasketballSeasonAggregate = {
    totals: { games: 0, pointsFor: 0, pointsAgainst: 0, wins: 0, draws: 0, losses: 0 },
    perPlayer: {},
  };
  for (const game of games) {
    const state = replayBasketballGame(eventsOf(game.id));
    const t = out.totals;
    t.games++;
    t.pointsFor += state.teamScore.points;
    t.pointsAgainst += state.opponentScore.points;
    if (state.teamScore.points > state.opponentScore.points) t.wins++;
    else if (state.teamScore.points < state.opponentScore.points) t.losses++;
    else t.draws++;

    const ids = new Set([...Object.keys(state.ms), ...Object.keys(state.playerPoints), ...Object.keys(state.fouls)]);
    ids.forEach((pid) => {
      const row = (out.perPlayer[pid] ??= {
        playerId: pid,
        gamesPlayed: 0,
        ms: 0,
        guardMs: 0,
        forwardMs: 0,
        points: 0,
        fouls: 0,
        foulOuts: 0,
      });
      const ms = basketballGameMs(state, pid);
      if (ms > 0) row.gamesPlayed++;
      row.ms += ms;
      row.guardMs += state.ms[pid]?.guard ?? 0;
      row.forwardMs += state.ms[pid]?.forward ?? 0;
      row.points += state.playerPoints[pid] ?? 0;
      row.fouls += state.fouls[pid] ?? 0;
      if (state.fouledOutIds.includes(pid)) row.foulOuts++;
    });
  }
  return out;
}
