// Rugby points come from the sport's own score types (rugby union
// plan, phase 1). The replay used to add 4 for a try, 2 for a
// conversion, 2 for a penalty goal and 1 for a field goal whatever the
// sport; union scores 5 / 2 / 3 / 3. A table that isn't league's must
// drive every total, the undo and the per-period table.

import { describe, expect, it } from "vitest";
import {
  replayLeagueGame,
  replayRugbyGame,
  rugbyPoints,
  rugbyPointsFromScoreTypes,
  rugbyScoreByPeriod,
  type RugbyPoints,
} from "@/lib/sports/rugby_league/fairness";
import { RUGBY_SPORT_IDS, getSportConfig } from "@/lib/sports";
import type { GameEvent, GameEventType } from "@/lib/types";

let ts = 0;
function ev(type: GameEventType, metadata: Record<string, unknown> = {}, playerId: string | null = null): GameEvent {
  ts++;
  return {
    id: `e${ts}`,
    game_id: "g1",
    type,
    player_id: playerId,
    metadata,
    created_by: null,
    created_at: new Date(2026, 0, 1, 9, 0, ts).toISOString(),
  };
}

// Not league's table: every value differs from league's 4 / 2 / 2 / 1.
const OTHER: RugbyPoints = { try: 5, conversion: 3, penaltyGoal: 7, fieldGoal: 11 };

function everyScore(): GameEvent[] {
  ts = 0;
  return [
    ev("quarter_start", { quarter: 1 }),
    ev("try", { quarter: 1 }, "p1"),
    ev("conversion_attempt", { quarter: 1, made: true }, "p2"),
    ev("penalty_goal", { quarter: 1 }, "p2"),
    ev("quarter_start", { quarter: 2 }),
    ev("field_goal", { quarter: 2 }, "p3"),
    ev("opponent_try", { quarter: 2 }),
    ev("opponent_conversion", { quarter: 2 }),
    ev("opponent_penalty_goal", { quarter: 2 }),
    ev("opponent_field_goal", { quarter: 2 }),
  ];
}

describe("rugby points come from the sport's score types", () => {
  it("league's table is its score types: try 4, conversion 2, penalty goal 2, field goal 1", () => {
    expect(rugbyPoints("rugby_league")).toEqual({ try: 4, conversion: 2, penaltyGoal: 2, fieldGoal: 1 });
  });

  it("builds the table from score types, and a missing one is an error", () => {
    expect(
      rugbyPointsFromScoreTypes([
        { id: "try", label: "Try", shortLabel: "T", points: 5 },
        { id: "conversion", label: "Conversion", shortLabel: "C", points: 2 },
        { id: "penalty_goal", label: "Penalty goal", shortLabel: "PG", points: 3 },
        { id: "field_goal", label: "Drop goal", shortLabel: "DG", points: 3 },
      ]),
    ).toEqual({ try: 5, conversion: 2, penaltyGoal: 3, fieldGoal: 3 });
    expect(() =>
      rugbyPointsFromScoreTypes([{ id: "try", label: "Try", shortLabel: "T", points: 5 }]),
    ).toThrow(/conversion/);
  });

  it("every rugby sport scores the opposition as it scores us", () => {
    for (const sport of RUGBY_SPORT_IDS) {
      const types = getSportConfig(sport).scoreTypes;
      for (const opp of types.filter((t) => t.opponent)) {
        const ours = types.find((t) => !t.opponent && `opponent_${t.id}` === opp.id);
        expect(ours?.points, `${sport} ${opp.id}`).toBe(opp.points);
      }
    }
  });

  it("a points table drives the replay's totals", () => {
    const state = replayRugbyGame(everyScore(), OTHER);
    expect(state.teamScore).toEqual({ tries: 1, conversions: 1, penaltyGoals: 1, fieldGoals: 1, points: 5 + 3 + 7 + 11 });
    expect(state.opponentScore).toEqual({ tries: 1, conversions: 1, penaltyGoals: 1, fieldGoals: 1, points: 5 + 3 + 7 + 11 });
  });

  it("undo takes back the table's points, score by score", () => {
    const events = everyScore();
    const undos = (n: number) => Array.from({ length: n }, () => ev("score_undo", { quarter: 2 }));
    // Opponent FG, PG, conversion, try, then our FG.
    const state = replayRugbyGame([...events, ...undos(5)], OTHER);
    expect(state.opponentScore.points).toBe(0);
    expect(state.teamScore.points).toBe(5 + 3 + 7);
    // Then our penalty goal, conversion and try.
    expect(replayRugbyGame([...everyScore(), ...undos(8)], OTHER).teamScore.points).toBe(0);
  });

  it("the per-period table uses the same points", () => {
    const byPeriod = rugbyScoreByPeriod(everyScore(), 2, OTHER);
    expect(byPeriod[1].team.points).toBe(5 + 3 + 7);
    expect(byPeriod[2].team.points).toBe(11);
    expect(byPeriod[2].opponent.points).toBe(5 + 3 + 7 + 11);
    const undone = rugbyScoreByPeriod([...everyScore(), ev("score_undo"), ev("score_undo")], 2, OTHER);
    expect(undone[2].opponent.points).toBe(5 + 3);
  });

  it("league's replay keeps league's points", () => {
    expect(replayLeagueGame(everyScore()).teamScore.points).toBe(4 + 2 + 2 + 1);
    expect(replayRugbyGame(everyScore(), rugbyPoints("rugby_league"))).toEqual(replayLeagueGame(everyScore()));
  });
});
