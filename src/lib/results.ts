// Final scores and the season record, for every sport, from the event
// log. Uses each sport's own replay so undo / late-score handling stays
// in one place.

import { replayGame } from "@/lib/fairness";
import { replayNetballGame } from "@/lib/sports/netball/fairness";
import { replayLeagueGame } from "@/lib/sports/rugby_league/fairness";
import type { GameEvent, Sport } from "@/lib/types";
import { isRugby, noSportBranch } from "@/lib/sports/registry";

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
  if (isRugby(sport)) {
    const r = replayLeagueGame(events);
    return { us: r.teamScore.points, them: r.opponentScore.points };
  }
  if (sport === "afl") {
    const r = replayGame(events);
    const pts = (s: { goals: number; behinds: number }) => s.goals * 6 + s.behinds;
    return {
      us: pts(r.teamScore),
      them: pts(r.opponentScore),
      usDetail: `${r.teamScore.goals}.${r.teamScore.behinds}`,
      themDetail: `${r.opponentScore.goals}.${r.opponentScore.behinds}`,
    };
  }
  return noSportBranch(sport, "scoreFromEvents");
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

export interface LiveStatus {
  /** The latest period started (0 before kickoff). */
  period: number;
  /** That period has ended (a break, or full time). */
  periodEnded: boolean;
  finalised: boolean;
}

/** Where a game is up to, from its events — any sport. */
export function liveStatusFromEvents(events: GameEvent[]): LiveStatus {
  let period = 0;
  let endedPeriod = 0;
  let finalised = false;
  for (const ev of events) {
    const q = (ev.metadata as { quarter?: number } | null)?.quarter ?? 0;
    if (ev.type === "quarter_start") period = Math.max(period, q);
    else if (ev.type === "quarter_end") endedPeriod = Math.max(endedPeriod, q);
    else if (ev.type === "game_finalised") finalised = true;
  }
  return { period, periodEnded: period > 0 && endedPeriod >= period, finalised };
}
