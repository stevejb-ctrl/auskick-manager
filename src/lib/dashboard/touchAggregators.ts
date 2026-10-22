// ─── Touch family season aggregate ───────────────────────────
// Stats for a touch or Oztag team's finished games, through the same
// replay the live screen uses (lib/sports/touch/replay), so live and
// post-game numbers agree. Pure. Nothing here says who counts as a girl
// or a boy: a girl's try counts in points, not as a kind of try.

import type { GameEvent } from "@/lib/types";
import { replayTouchGame, touchGameMs } from "@/lib/sports/touch/replay";

export interface TouchSeasonPlayerStats {
  playerId: string;
  /** Games they got on the field in. */
  gamesPlayed: number;
  /** Time on the field, every lane. */
  ms: number;
  /** Time in each lane (the position strategies). */
  middleMs: number;
  linkMs: number;
  wingMs: number;
  tries: number;
  points: number;
}

export interface TouchSeasonAggregate {
  totals: {
    games: number;
    pointsFor: number;
    pointsAgainst: number;
    wins: number;
    draws: number;
    losses: number;
  };
  perPlayer: Record<string, TouchSeasonPlayerStats>;
}

/** The season so far, from each finished game's events. */
export function aggregateTouchSeason(
  games: readonly { id: string }[],
  eventsByGame: ReadonlyMap<string, GameEvent[]> | Readonly<Record<string, GameEvent[]>>,
): TouchSeasonAggregate {
  const eventsOf = (id: string): GameEvent[] =>
    (eventsByGame instanceof Map ? eventsByGame.get(id) : (eventsByGame as Record<string, GameEvent[]>)[id]) ?? [];
  const out: TouchSeasonAggregate = {
    totals: { games: 0, pointsFor: 0, pointsAgainst: 0, wins: 0, draws: 0, losses: 0 },
    perPlayer: {},
  };
  for (const game of games) {
    const state = replayTouchGame(eventsOf(game.id));
    const t = out.totals;
    t.games++;
    t.pointsFor += state.teamScore.points;
    t.pointsAgainst += state.opponentScore.points;
    if (state.teamScore.points > state.opponentScore.points) t.wins++;
    else if (state.teamScore.points < state.opponentScore.points) t.losses++;
    else t.draws++;

    const ids = new Set([...Object.keys(state.ms), ...Object.keys(state.playerTries)]);
    ids.forEach((pid) => {
      const row = (out.perPlayer[pid] ??= {
        playerId: pid,
        gamesPlayed: 0,
        ms: 0,
        middleMs: 0,
        linkMs: 0,
        wingMs: 0,
        tries: 0,
        points: 0,
      });
      const ms = touchGameMs(state, pid);
      if (ms > 0) row.gamesPlayed++;
      row.ms += ms;
      row.middleMs += state.ms[pid]?.middle ?? 0;
      row.linkMs += state.ms[pid]?.link ?? 0;
      row.wingMs += state.ms[pid]?.wing ?? 0;
      row.tries += state.playerTries[pid] ?? 0;
      row.points += state.playerPoints[pid] ?? 0;
    });
  }
  return out;
}
