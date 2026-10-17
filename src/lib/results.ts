// Final scores and the season record, for every sport, from the event
// log. Uses each sport's own replay so undo / late-score handling stays
// in one place.

import { replayGame } from "@/lib/fairness";
import { replayNetballGame } from "@/lib/sports/netball/fairness";
import { replayRugbyGame, rugbyPoints, rugbyScoreWords } from "@/lib/sports/rugby_league/fairness";
import type { GameEvent, Sport } from "@/lib/types";
import { isRugby, isSoccer, noSportBranch, sportNotBuilt } from "@/lib/sports/registry";

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
    const r = replayRugbyGame(events, rugbyPoints(sport));
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
  if (isSoccer(sport)) return sportNotBuilt(sport, "scoreFromEvents");
  return noSportBranch(sport, "scoreFromEvents");
}

/** One player's scoring in a game, in their sport's words. */
export interface ScorerTally {
  playerId: string;
  /** "2 g · 1 b" (AFL), "3 goals" (netball), "1T · 2C" (league). */
  detail: string;
  points: number;
  /** Show the points beside the detail (not for netball: goals are points). */
  showPoints: boolean;
}

/**
 * Who scored in a game, most points first (ties in player order). From
 * each sport's own replay, so an undone score doesn't count and a
 * missed conversion isn't a score.
 */
export function scorersFromEvents(sport: Sport, events: GameEvent[]): ScorerTally[] {
  const rows: ScorerTally[] = [];
  if (sport === "afl") {
    for (const [playerId, s] of Object.entries(replayGame(events).playerScores)) {
      const points = s.goals * 6 + s.behinds;
      if (points > 0) rows.push({ playerId, detail: `${s.goals} g · ${s.behinds} b`, points, showPoints: true });
    }
  } else if (sport === "netball") {
    for (const [playerId, goals] of Object.entries(replayNetballGame(events).playerGoals)) {
      if (goals > 0) rows.push({ playerId, detail: `${goals} ${goals === 1 ? "goal" : "goals"}`, points: goals, showPoints: false });
    }
  } else if (isRugby(sport)) {
    const pts = rugbyPoints(sport);
    const words = rugbyScoreWords(sport);
    const r = replayRugbyGame(events, pts);
    const ids = Array.from(new Set(Object.keys(r.playerTries).concat(Object.keys(r.playerConversions), Object.keys(r.playerGoals))));
    for (const playerId of ids) {
      const tries = r.playerTries[playerId] ?? 0;
      const conversions = r.playerConversions[playerId]?.made ?? 0;
      const { penalty = 0, field = 0 } = r.playerGoals[playerId] ?? {};
      const points = tries * pts.try + conversions * pts.conversion + penalty * pts.penaltyGoal + field * pts.fieldGoal;
      if (points === 0) continue;
      const parts = [
        tries > 0 && `${tries}T`,
        conversions > 0 && `${conversions}C`,
        penalty > 0 && `${penalty}${words.penaltyGoal.short}`,
        field > 0 && `${field}${words.fieldGoal.short}`,
      ].filter(Boolean);
      rows.push({ playerId, detail: parts.join(" · "), points, showPoints: true });
    }
  } else if (isSoccer(sport)) {
    return sportNotBuilt(sport, "scorersFromEvents");
  } else {
    return noSportBranch(sport, "scorersFromEvents");
  }
  return rows.sort((a, b) => b.points - a.points || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0));
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
