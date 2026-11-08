// A game marked played (it happened, without Siren) can take its final
// score (round 3 follow-up, 25 Oct 2026): our score and theirs, stored on
// the game (migration 0076), counted as a played game everywhere a run
// game's score is. Without one it's still no result, never a 0–0 draw.

import { describe, expect, it } from "vitest";
import {
  finalScoreOf,
  parsePlayedScore,
  playedScoreOf,
  playedScoreText,
  withPlayedHeadToHead,
  withPlayedNetballHeadToHead,
  withPlayedTotals,
} from "@/lib/games/playedScore";
import { seasonRecord } from "@/lib/results";
import type { GameEvent } from "@/lib/types";

describe("parsePlayedScore", () => {
  it("takes our score and theirs", () => {
    expect(parsePlayedScore("netball", { us: "12", them: 9 })).toEqual({ score: { us: 12, them: 9 } });
    expect(parsePlayedScore("soccer", { us: 0, them: 0 })).toEqual({ score: { us: 0, them: 0 } });
  });

  it("takes AFL's goals and behinds, and counts the points", () => {
    expect(parsePlayedScore("afl", { usGoals: 5, usBehinds: 4, themGoals: "3", themBehinds: 2 })).toEqual({
      score: { us: 34, them: 20, usGoals: 5, usBehinds: 4, themGoals: 3, themBehinds: 2 },
    });
  });

  it("refuses a missing, negative, fractional or silly score", () => {
    expect(parsePlayedScore("netball", { us: "", them: 3 })).toHaveProperty("error");
    expect(parsePlayedScore("netball", { us: -1, them: 3 })).toHaveProperty("error");
    expect(parsePlayedScore("netball", { us: 1.5, them: 3 })).toHaveProperty("error");
    expect(parsePlayedScore("netball", { us: 1000, them: 3 })).toHaveProperty("error");
    expect(parsePlayedScore("afl", { us: 34, them: 20 })).toHaveProperty("error");
    expect(parsePlayedScore("afl", null)).toHaveProperty("error");
  });
});

describe("playedScoreOf", () => {
  it("reads the stored score, and nothing from a game without one", () => {
    expect(playedScoreOf({ played_score: { us: 3, them: 1 } })).toEqual({ us: 3, them: 1 });
    expect(playedScoreOf({ played_score: null })).toBeNull();
    expect(playedScoreOf({})).toBeNull();
    expect(playedScoreOf({ played_score: { us: "3" } })).toBeNull();
  });
});

const ev = (type: string, metadata: Record<string, unknown> = {}, n = 0): GameEvent =>
  ({ id: `e${n}-${type}`, game_id: "g", type, player_id: null, metadata, created_by: null, created_at: `2026-10-24T09:00:0${n}.000Z` }) as GameEvent;

describe("finalScoreOf", () => {
  it("a game marked played with a score is that result", () => {
    expect(finalScoreOf("netball", { played_score: { us: 12, them: 9 } }, [], true)).toEqual({ us: 12, them: 9 });
    expect(finalScoreOf("afl", { played_score: { us: 34, them: 20, usGoals: 5, usBehinds: 4, themGoals: 3, themBehinds: 2 } }, [], false)).toEqual({
      us: 34,
      them: 20,
      usDetail: "5.4",
      themDetail: "3.2",
    });
  });

  it("a game marked played without one isn't a 0–0 draw", () => {
    expect(finalScoreOf("netball", { played_score: null }, [], true)).toBeNull();
  });

  it("a game run in Siren is its events' score, whatever's stored", () => {
    const events = [ev("lineup_set", { lineup: {} }, 1), ev("quarter_start", { quarter: 1 }, 2), ev("opponent_goal", { quarter: 1 }, 3), ev("game_finalised", {}, 4)];
    expect(finalScoreOf("netball", { played_score: { us: 9, them: 9 } }, events, true)).toEqual({ us: 0, them: 1 });
  });

  it("counts in the season record", () => {
    const scores = [
      finalScoreOf("netball", { played_score: { us: 12, them: 9 } }, [], true),
      finalScoreOf("netball", { played_score: { us: 4, them: 4 } }, [], true),
      finalScoreOf("netball", { played_score: null }, [], true),
    ].filter((s): s is NonNullable<typeof s> => s !== null);
    expect(seasonRecord(scores)).toEqual({ played: 2, won: 1, lost: 0, drawn: 1 });
  });
});

describe("playedScoreText", () => {
  it("says the score in the sport's words", () => {
    expect(playedScoreText("netball", { us: 12, them: 9 })).toBe("12 – 9");
    expect(playedScoreText("afl", { us: 34, them: 20, usGoals: 5, usBehinds: 4, themGoals: 3, themBehinds: 2 })).toBe("5.4 (34) – 3.2 (20)");
  });
});

describe("stats", () => {
  const played = [
    { opponent: "Kew", score: { us: 34, them: 20, usGoals: 5, usBehinds: 4, themGoals: 3, themBehinds: 2 } },
    { opponent: "Hawks", score: { us: 6, them: 6, usGoals: 1, usBehinds: 0, themGoals: 0, themBehinds: 6 } },
  ];

  it("AFL's head-to-head counts a played game with the run ones", () => {
    const rows = withPlayedHeadToHead(
      [{ opponent: "Kew", gamesPlayed: 1, wins: 0, losses: 1, draws: 0, goalsFor: 1, behindsFor: 1, goalsAgainst: 2, behindsAgainst: 2 }],
      played,
    );
    expect(rows).toEqual([
      { opponent: "Kew", gamesPlayed: 2, wins: 1, losses: 1, draws: 0, goalsFor: 6, behindsFor: 5, goalsAgainst: 5, behindsAgainst: 4 },
      { opponent: "Hawks", gamesPlayed: 1, wins: 0, losses: 0, draws: 1, goalsFor: 1, behindsFor: 0, goalsAgainst: 0, behindsAgainst: 6 },
    ]);
  });

  it("netball's head-to-head too", () => {
    const rows = withPlayedNetballHeadToHead([], [{ opponent: "Kew", score: { us: 12, them: 9 } }]);
    expect(rows).toEqual([{ opponent: "Kew", gamesPlayed: 1, wins: 1, losses: 0, draws: 0, goalsFor: 12, goalsAgainst: 9 }]);
  });

  it("a season's totals count it as a game and a result", () => {
    const totals = { games: 2, goalsFor: 3, goalsAgainst: 1, wins: 1, draws: 1, losses: 0 };
    expect(withPlayedTotals(totals, "goalsFor", "goalsAgainst", [{ us: 0, them: 2 }])).toEqual({
      games: 3,
      goalsFor: 3,
      goalsAgainst: 3,
      wins: 1,
      draws: 1,
      losses: 1,
    });
  });
});
