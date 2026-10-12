// Final scores and the season record, for every sport, from the event
// log. Uses each sport's own replay so undo / late-score handling stays
// in one place.

import { replayGame } from "@/lib/fairness";
import { replayNetballGame } from "@/lib/sports/netball/fairness";
import { replayLeagueGame } from "@/lib/sports/rugby_league/fairness";
import type { GameEvent, Sport } from "@/lib/types";

export interface GameScore {
  us: number;
  them: number;
  /** Sport-native breakdown, e.g. "5.4" for AFL goals.behinds. */
  usDetail?: string;
  themDetail?: string;
}

export type Outcome = "W" | "L" | "D";

/** Points for and against from one game's events. */
export function scoreFromEvents(sport: Sport, events: GameEvent[]): GameScore {
  if (sport === "netball") {
    const r = replayNetballGame(events);
    return { us: r.teamScore.goals, them: r.opponentScore.goals };
  }
  if (sport === "rugby_league") {
    const r = replayLeagueGame(events);
    return { us: r.teamScore.points, them: r.opponentScore.points };
  }
  const r = replayGame(events);
  const pts = (s: { goals: number; behinds: number }) => s.goals * 6 + s.behinds;
  return {
    us: pts(r.teamScore),
    them: pts(r.opponentScore),
    usDetail: `${r.teamScore.goals}.${r.teamScore.behinds}`,
    themDetail: `${r.opponentScore.goals}.${r.opponentScore.behinds}`,
  };
}

export function outcomeOf(score: GameScore): Outcome {
  if (score.us > score.them) return "W";
  if (score.us < score.them) return "L";
  return "D";
}

export interface SeasonRecord {
  played: number;
  won: number;
  lost: number;
  drawn: number;
}

/** W/L/D across final games. */
export function seasonRecord(scores: GameScore[]): SeasonRecord {
  const rec: SeasonRecord = { played: scores.length, won: 0, lost: 0, drawn: 0 };
  for (const s of scores) {
    const o = outcomeOf(s);
    if (o === "W") rec.won++;
    else if (o === "L") rec.lost++;
    else rec.drawn++;
  }
  return rec;
}
