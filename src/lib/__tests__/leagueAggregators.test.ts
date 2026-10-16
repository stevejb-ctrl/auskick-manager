import { describe, expect, it } from "vitest";
import {
  aggregateLeagueSeason,
  aggregateLeagueSeasonFromGames,
  snapshotLeagueGame,
} from "@/lib/dashboard/leagueAggregators";
import type { Game, GameEvent, GameEventType } from "@/lib/types";

let _ts = 0;
function ev(
  gameId: string,
  type: GameEventType,
  metadata: Record<string, unknown> = {},
  playerId: string | null = null,
): GameEvent {
  _ts++;
  return {
    id: `e${_ts}`,
    game_id: gameId,
    type,
    player_id: playerId,
    metadata,
    created_by: null,
    created_at: new Date(2026, 0, 1, 9, 0, _ts).toISOString(),
  };
}

const lineup = { forwards: ["p1", "p2"], backs: ["p3"], bench: ["p4"] };

describe("league season stats — penalty and field goals (U13+)", () => {
  it("credits each kicker's goals and sums them per player and per team", () => {
    const g1 = snapshotLeagueGame(
      "g1",
      [
        ev("g1", "lineup_set", { lineup }),
        ev("g1", "quarter_start", { quarter: 1 }),
        ev("g1", "try", { quarter: 1 }, "p1"),
        ev("g1", "penalty_goal", { quarter: 1 }, "p2"),
        ev("g1", "field_goal", { quarter: 1 }, "p2"),
        ev("g1", "opponent_penalty_goal", { quarter: 1 }),
        ev("g1", "quarter_end", { quarter: 1, elapsed_ms: 1_500_000 }),
      ],
      0,
    );
    expect(g1.playerGoals).toEqual({ p2: { penalty: 1, field: 1 } });

    const g2 = snapshotLeagueGame(
      "g2",
      [
        ev("g2", "lineup_set", { lineup }),
        ev("g2", "quarter_start", { quarter: 1 }),
        ev("g2", "penalty_goal", { quarter: 1 }, "p2"),
        ev("g2", "penalty_goal", { quarter: 1 }, "p3"),
        // An undone goal doesn't count.
        ev("g2", "field_goal", { quarter: 1 }, "p3"),
        ev("g2", "score_undo", { quarter: 1 }),
        ev("g2", "quarter_end", { quarter: 1, elapsed_ms: 1_500_000 }),
      ],
      0,
    );

    const agg = aggregateLeagueSeason([g1, g2]);
    expect(agg.perPlayer.p2).toMatchObject({ penaltyGoals: 2, fieldGoals: 1 });
    expect(agg.perPlayer.p3).toMatchObject({ penaltyGoals: 1, fieldGoals: 0 });
    expect(agg.perPlayer.p1).toMatchObject({ tries: 1, penaltyGoals: 0, fieldGoals: 0 });
    expect(agg.totals).toMatchObject({
      tries: 1,
      penaltyGoals: 3,
      fieldGoals: 1,
      // 4 (try) + 2 + 1 in g1, 2 + 2 in g2.
      points: 11,
      opponentPoints: 2,
    });
  });

  it("gives a kicker a row even when no lineup event names them", () => {
    const snap = snapshotLeagueGame(
      "g1",
      [
        ev("g1", "lineup_set", { lineup }),
        ev("g1", "quarter_start", { quarter: 1 }),
        ev("g1", "field_goal", { quarter: 1 }, "p9"),
      ],
      0,
    );
    expect(snap.playerIds).toContain("p9");
    expect(aggregateLeagueSeason([snap]).perPlayer.p9).toMatchObject({
      gamesPlayed: 1,
      fieldGoals: 1,
    });
  });
});

describe("league season stats — §6 unbroken periods", () => {
  // p1 is swapped off mid-period in both halves: a §6 shortfall on
  // junior laws, nothing at all on international laws.
  const events = [
    ev("g1", "lineup_set", { lineup }),
    ev("g1", "quarter_start", { quarter: 1 }),
    ev("g1", "swap", { off_player_id: "p1", on_player_id: "p4" }),
    ev("g1", "quarter_end", { quarter: 1, elapsed_ms: 1_500_000 }),
    ev("g1", "lineup_set", { lineup }),
    ev("g1", "quarter_start", { quarter: 2 }),
    ev("g1", "swap", { off_player_id: "p1", on_player_id: "p4" }),
    ev("g1", "quarter_end", { quarter: 2, elapsed_ms: 1_500_000 }),
  ];
  const games = [{ id: "g1" } as Game];

  it("flags a shortfall on junior laws (U10)", () => {
    const agg = aggregateLeagueSeasonFromGames(games, { g1: events }, "rugby_league", "U10");
    expect(agg.perPlayer.p1.unbrokenShortfallGames).toBe(1);
  });

  it("never flags one on international laws (U13)", () => {
    const agg = aggregateLeagueSeasonFromGames(games, { g1: events }, "rugby_league", "U13");
    for (const row of Object.values(agg.perPlayer)) {
      expect(row.unbrokenShortfallGames).toBe(0);
    }
  });
});
