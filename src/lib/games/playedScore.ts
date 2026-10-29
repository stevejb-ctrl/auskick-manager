// A game marked played, with its final score. Round 3 follow-up (25 Oct
// 2026): a game that happened without Siren (lib/games/notPlayed) could be
// marked played, but not given its score, so the season record and Stats
// left it out. The coach can now enter our score and theirs as they mark
// it played (AFL in goals and behinds, as AFL says every score). It's
// stored on the game (games.played_score, migration 0076) and counts as a
// played game wherever a run game's score does. A game marked played
// without a score is still no result: never a 0–0 draw.
//
// Pure: the game page, Today and Stats read it.

import { playedInSiren } from "@/lib/games/notPlayed";
import { scoreFromEvents, scoresKept, type GameScore } from "@/lib/results";
import type { HeadToHeadRecord } from "@/lib/dashboard/types";
import type { NetballHeadToHeadRecord } from "@/lib/dashboard/netballAggregators";
import type { GameEvent, Sport } from "@/lib/types";

export interface PlayedScore {
  /** Our points (goals, in netball and soccer). */
  us: number;
  them: number;
  /** AFL: the goals and behinds the points came from. */
  usGoals?: number;
  usBehinds?: number;
  themGoals?: number;
  themBehinds?: number;
}

/** Highest score the form takes: a typo, not a real junior score, above it. */
export const PLAYED_SCORE_MAX = 999;
const AFL_PART_MAX = 99;

/** AFL enters goals and behinds; every other sport one number a side. */
export function playedScoreInGoalsAndBehinds(sport: Sport): boolean {
  return sport === "afl";
}

function wholeNumber(raw: unknown, max: number): number | null {
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

/** A score from the Mark played form, checked; or why it can't be taken. */
export function parsePlayedScore(sport: Sport, raw: unknown): { score: PlayedScore } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (playedScoreInGoalsAndBehinds(sport)) {
    const [usGoals, usBehinds, themGoals, themBehinds] = (["usGoals", "usBehinds", "themGoals", "themBehinds"] as const).map((k) =>
      wholeNumber(r[k], AFL_PART_MAX),
    );
    if (usGoals === null || usBehinds === null || themGoals === null || themBehinds === null) {
      return { error: `Enter goals and behinds for both teams, 0 to ${AFL_PART_MAX}.` };
    }
    return {
      score: { us: usGoals * 6 + usBehinds, them: themGoals * 6 + themBehinds, usGoals, usBehinds, themGoals, themBehinds },
    };
  }
  const us = wholeNumber(r.us, PLAYED_SCORE_MAX);
  const them = wholeNumber(r.them, PLAYED_SCORE_MAX);
  if (us === null || them === null) return { error: `Enter both scores, 0 to ${PLAYED_SCORE_MAX}.` };
  return { score: { us, them } };
}

/** The score stored on a game marked played, if it has a whole one. */
export function playedScoreOf(game: { played_score?: unknown }): PlayedScore | null {
  const s = game.played_score as Partial<PlayedScore> | null | undefined;
  if (!s || typeof s !== "object" || typeof s.us !== "number" || typeof s.them !== "number") return null;
  const out: PlayedScore = { us: s.us, them: s.them };
  if ([s.usGoals, s.usBehinds, s.themGoals, s.themBehinds].every((n) => typeof n === "number")) {
    Object.assign(out, { usGoals: s.usGoals, usBehinds: s.usBehinds, themGoals: s.themGoals, themBehinds: s.themBehinds });
  }
  return out;
}

function playedGameScore(s: PlayedScore): GameScore {
  if (s.usGoals === undefined) return { us: s.us, them: s.them };
  return { us: s.us, them: s.them, usDetail: `${s.usGoals}.${s.usBehinds}`, themDetail: `${s.themGoals}.${s.themBehinds}` };
}

/**
 * A finished game's result, or null when it has none: a game run in
 * Siren is its events' score (if it kept score); a game marked played is
 * the score it was given, if any.
 */
export function finalScoreOf(
  sport: Sport,
  game: { played_score?: unknown; playbook_snapshot?: unknown },
  events: GameEvent[],
  teamTrackScoring: boolean,
): GameScore | null {
  if (playedInSiren(events)) {
    return scoresKept(sport, game, teamTrackScoring, events) ? scoreFromEvents(sport, events) : null;
  }
  const played = playedScoreOf(game);
  return played ? playedGameScore(played) : null;
}

/** "12 – 9"; AFL's "5.4 (34) – 3.2 (20)". */
export function playedScoreText(sport: Sport, s: PlayedScore): string {
  if (playedScoreInGoalsAndBehinds(sport) && s.usGoals !== undefined) {
    return `${s.usGoals}.${s.usBehinds} (${s.us}) – ${s.themGoals}.${s.themBehinds} (${s.them})`;
  }
  return `${s.us} – ${s.them}`;
}

// ─── Stats ───────────────────────────────────────────────────
// A game marked played has no events, so Stats' replays never see it.
// These add its result where the season's results are counted: a game,
// its points for and against, and a win, loss or draw.

export interface PlayedResult {
  opponent: string;
  score: PlayedScore;
}

type Outcome = "wins" | "losses" | "draws";
const outcomeKey = (s: { us: number; them: number }): Outcome => (s.us > s.them ? "wins" : s.us < s.them ? "losses" : "draws");

/** AFL's head-to-head, with the played games' results (in goals and behinds). */
export function withPlayedHeadToHead(rows: HeadToHeadRecord[], played: PlayedResult[]): HeadToHeadRecord[] {
  const out = rows.map((r) => ({ ...r }));
  for (const { opponent, score } of played) {
    let row = out.find((r) => r.opponent === opponent);
    if (!row) {
      row = { opponent, gamesPlayed: 0, wins: 0, losses: 0, draws: 0, goalsFor: 0, behindsFor: 0, goalsAgainst: 0, behindsAgainst: 0 };
      out.push(row);
    }
    row.gamesPlayed++;
    row[outcomeKey(score)]++;
    // A score without its goals and behinds counts as behinds: the points stay right.
    row.goalsFor += score.usGoals ?? 0;
    row.behindsFor += score.usBehinds ?? score.us;
    row.goalsAgainst += score.themGoals ?? 0;
    row.behindsAgainst += score.themBehinds ?? score.them;
  }
  return out.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
}

/** Netball's head-to-head, with the played games' results. */
export function withPlayedNetballHeadToHead(rows: NetballHeadToHeadRecord[], played: PlayedResult[]): NetballHeadToHeadRecord[] {
  const out = rows.map((r) => ({ ...r }));
  for (const { opponent, score } of played) {
    let row = out.find((r) => r.opponent === opponent);
    if (!row) {
      row = { opponent, gamesPlayed: 0, wins: 0, losses: 0, draws: 0, goalsFor: 0, goalsAgainst: 0 };
      out.push(row);
    }
    row.gamesPlayed++;
    row[outcomeKey(score)]++;
    row.goalsFor += score.us;
    row.goalsAgainst += score.them;
  }
  return out.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
}

/** A season's totals (soccer's, basketball's, touch's), with the played games. */
export function withPlayedTotals<T extends { games: number; wins: number; draws: number; losses: number }>(
  totals: T,
  /** The totals' points-for key ("goalsFor", "pointsFor"), and against. */
  forKey: string,
  againstKey: string,
  scores: { us: number; them: number }[],
): T {
  const out = { ...totals } as T & Record<string, number>;
  for (const s of scores) {
    out.games++;
    out[outcomeKey(s)]++;
    (out as Record<string, number>)[forKey] += s.us;
    (out as Record<string, number>)[againstKey] += s.them;
  }
  return out;
}
