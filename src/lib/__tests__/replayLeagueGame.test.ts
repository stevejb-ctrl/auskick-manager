import { describe, expect, it } from "vitest";
import { replayLeagueGame } from "@/lib/sports/rugby_league/fairness";
import type { GameEvent, GameEventType } from "@/lib/types";

// Tiny factory — keeps the test bodies focused on the assertions.
let _ts = 0;
function ev(
  type: GameEventType,
  metadata: Record<string, unknown> = {},
  playerId: string | null = null,
): GameEvent {
  _ts++;
  return {
    id: `e${_ts}`,
    game_id: "g1",
    type,
    player_id: playerId,
    metadata,
    created_by: null,
    // ISO timestamps with increasing millisecond stamps so sort is stable.
    created_at: new Date(2026, 0, 1, 9, 0, _ts).toISOString(),
  };
}

function reset() {
  _ts = 0;
}

describe("replayLeagueGame — empty + lineup_set", () => {
  it("returns the empty state for an empty event log", () => {
    reset();
    const state = replayLeagueGame([]);
    expect(state.lineup).toBeNull();
    expect(state.currentQuarter).toBe(0);
    expect(state.teamScore).toEqual({ tries: 0, conversions: 0, points: 0 });
    expect(state.opponentScore).toEqual({ tries: 0, conversions: 0, points: 0 });
    expect(state.finalised).toBe(false);
  });

  it("applies lineup_set", () => {
    reset();
    const state = replayLeagueGame([
      ev("lineup_set", {
        lineup: {
          forwards: ["p1", "p2"],
          backs: ["p3"],
          bench: ["p4"],
        },
      }),
    ]);
    expect(state.lineup).toEqual({
      forwards: ["p1", "p2"],
      backs: ["p3"],
      bench: ["p4"],
    });
  });
});

describe("replayLeagueGame — quarter transitions", () => {
  it("tracks quarter_start and quarter_end", () => {
    reset();
    const state = replayLeagueGame([
      ev("lineup_set", { lineup: { field: ["p1"], bench: [] } }),
      ev("quarter_start", { quarter: 1 }),
    ]);
    expect(state.currentQuarter).toBe(1);
    expect(state.quarterEnded).toBe(false);
    expect(state.quarterStartedAt).not.toBeNull();

    const state2 = replayLeagueGame([
      ev("lineup_set", { lineup: { field: ["p1"], bench: [] } }),
      ev("quarter_start", { quarter: 1 }),
      ev("quarter_end", { quarter: 1, elapsed_ms: 480_000 }),
    ]);
    expect(state2.quarterEnded).toBe(true);
    expect(state2.quarterElapsedMs).toBe(480_000);
    expect(state2.quarterStartedAt).toBeNull();
  });

  it("game_finalised flips the finalised flag", () => {
    reset();
    const state = replayLeagueGame([
      ev("lineup_set", { lineup: { field: ["p1"], bench: [] } }),
      ev("quarter_start", { quarter: 1 }),
      ev("quarter_end", { quarter: 1, elapsed_ms: 480_000 }),
      ev("game_finalised", { quarter: 1, elapsed_ms: 480_000 }),
    ]);
    expect(state.finalised).toBe(true);
  });
});

describe("replayLeagueGame — scoring", () => {
  it("try scores 4 points and credits the scorer", () => {
    reset();
    const state = replayLeagueGame([
      ev("lineup_set", { lineup: { field: ["p1", "p2"], bench: [] } }),
      ev("quarter_start", { quarter: 1 }),
      ev("try", { quarter: 1, elapsed_ms: 100_000 }, "p1"),
    ]);
    expect(state.teamScore.tries).toBe(1);
    expect(state.teamScore.points).toBe(4);
    expect(state.playerTries.p1).toBe(1);
    expect(state.playerTries.p2).toBeUndefined();
  });

  it("opponent_try scores 4 to opponent", () => {
    reset();
    const state = replayLeagueGame([
      ev("opponent_try", { quarter: 1, elapsed_ms: 100_000 }),
    ]);
    expect(state.opponentScore.tries).toBe(1);
    expect(state.opponentScore.points).toBe(4);
    expect(state.teamScore.points).toBe(0);
  });

  it("made conversion adds 2 points and credits the kicker; missed records attempt only", () => {
    reset();
    const state = replayLeagueGame([
      ev("conversion_attempt", { made: true }, "p1"),
      ev("conversion_attempt", { made: false }, "p2"),
    ]);
    expect(state.teamScore.conversions).toBe(1);
    expect(state.teamScore.points).toBe(2);
    expect(state.playerConversions.p1).toEqual({ attempts: 1, made: 1 });
    expect(state.playerConversions.p2).toEqual({ attempts: 1, made: 0 });
  });

  it("opponent_conversion adds 2 to opponent", () => {
    reset();
    const state = replayLeagueGame([ev("opponent_conversion", {})]);
    expect(state.opponentScore.conversions).toBe(1);
    expect(state.opponentScore.points).toBe(2);
  });

  it("full possession: try + made conversion = 6 points; player credits both", () => {
    reset();
    const state = replayLeagueGame([
      ev("try", { quarter: 1, elapsed_ms: 100_000 }, "p1"),
      ev("conversion_attempt", { made: true }, "p1"),
    ]);
    expect(state.teamScore.points).toBe(6);
    expect(state.playerTries.p1).toBe(1);
    expect(state.playerConversions.p1).toEqual({ attempts: 1, made: 1 });
  });
});

describe("replayLeagueGame — score_undo", () => {
  it("undoes the most recent try", () => {
    reset();
    const state = replayLeagueGame([
      ev("try", { quarter: 1 }, "p1"),
      ev("try", { quarter: 1 }, "p2"),
      ev("score_undo", {}),
    ]);
    expect(state.teamScore.tries).toBe(1);
    expect(state.teamScore.points).toBe(4);
    expect(state.playerTries.p1).toBe(1);
    expect(state.playerTries.p2 ?? 0).toBe(0);
  });

  it("undoes the most recent made conversion (rolls back 2 points + made tally)", () => {
    reset();
    const state = replayLeagueGame([
      ev("conversion_attempt", { made: true }, "p1"),
      ev("score_undo", {}),
    ]);
    expect(state.teamScore.conversions).toBe(0);
    expect(state.teamScore.points).toBe(0);
    expect(state.playerConversions.p1).toEqual({ attempts: 0, made: 0 });
  });

  it("undoes a missed conversion — attempt rolled back, no points to reverse", () => {
    reset();
    const state = replayLeagueGame([
      ev("conversion_attempt", { made: false }, "p1"),
      ev("score_undo", {}),
    ]);
    expect(state.teamScore.points).toBe(0);
    expect(state.playerConversions.p1).toEqual({ attempts: 0, made: 0 });
  });

  it("score_undo with no prior score is a no-op", () => {
    reset();
    const state = replayLeagueGame([ev("score_undo", {})]);
    expect(state.teamScore.points).toBe(0);
    expect(state.opponentScore.points).toBe(0);
  });
});

// Test helper: return the on-field player ids regardless of which
// zone they sit in. Most assertions don't care about the F/B split
// (they're testing replay mechanics, not positional logic), so this
// keeps the tests legible without leaking the new shape into every
// expect().
const onField = (state: ReturnType<typeof replayLeagueGame>): string[] =>
  state.lineup
    ? [...state.lineup.forwards, ...state.lineup.backs]
    : [];

describe("replayLeagueGame — swap", () => {
  it("swap moves off→bench and on→field", () => {
    reset();
    const state = replayLeagueGame([
      ev("lineup_set", {
        lineup: { forwards: ["p1", "p2"], backs: [], bench: ["p3"] },
      }),
      ev("quarter_start", { quarter: 1 }),
      ev("swap", {
        off_player_id: "p1",
        on_player_id: "p3",
        quarter: 1,
        elapsed_ms: 100_000,
      }),
    ]);
    expect(onField(state).sort()).toEqual(["p2", "p3"]);
    expect(state.lineup?.bench).toEqual(["p1"]);
  });

  it("swap-in for a player not on bench appends them to the field (late arrival case)", () => {
    reset();
    const state = replayLeagueGame([
      ev("lineup_set", {
        lineup: { forwards: ["p1"], backs: [], bench: [] },
      }),
      ev("quarter_start", { quarter: 1 }),
      ev("swap", {
        off_player_id: "p1",
        on_player_id: "pNew",
        quarter: 1,
        elapsed_ms: 100_000,
      }),
    ]);
    expect(onField(state)).toContain("pNew");
    expect(state.lineup?.bench).toContain("p1");
  });
});

describe("replayLeagueGame — auxiliary events", () => {
  it("player_arrived appends to bench when not already in lineup", () => {
    reset();
    const state = replayLeagueGame([
      ev("lineup_set", {
        lineup: { forwards: ["p1"], backs: [], bench: [] },
      }),
      ev("player_arrived", {}, "pLate"),
    ]);
    expect(state.lineup?.bench).toEqual(["pLate"]);
  });

  it("player_arrived is a no-op when player is already in the lineup", () => {
    reset();
    const state = replayLeagueGame([
      ev("lineup_set", {
        lineup: { forwards: ["p1"], backs: [], bench: ["p2"] },
      }),
      ev("player_arrived", {}, "p2"),
    ]);
    expect(state.lineup?.bench).toEqual(["p2"]);
  });

  it("injury removes the player from field or bench", () => {
    reset();
    const state = replayLeagueGame([
      ev("lineup_set", {
        lineup: { forwards: ["p1", "p2"], backs: [], bench: ["p3"] },
      }),
      ev("injury", {}, "p1"),
    ]);
    expect(onField(state)).toEqual(["p2"]);
    expect(state.lineup?.bench).toEqual(["p3"]);
  });

  it("player_loan keeps a bench player on the bench (mirrors AFL — coach sees them with a LENT badge, rotation skips them via loanedIds)", () => {
    reset();
    const state = replayLeagueGame([
      ev("lineup_set", {
        lineup: { forwards: ["p1"], backs: [], bench: ["p2"] },
      }),
      ev("player_loan", {}, "p2"),
    ]);
    expect(onField(state)).toEqual(["p1"]);
    expect(state.lineup?.bench).toEqual(["p2"]);
  });

  it("player_loan moves a field player to the bench", () => {
    reset();
    const state = replayLeagueGame([
      ev("lineup_set", {
        lineup: { forwards: ["p1", "p2"], backs: [], bench: ["p3"] },
      }),
      ev("player_loan", {}, "p1"),
    ]);
    expect(onField(state)).toEqual(["p2"]);
    expect(state.lineup?.bench).toEqual(["p3", "p1"]);
  });
});

describe("replayLeagueGame — forward/back zones", () => {
  it("swap preserves the off-player's zone — on-player joins the vacated zone", () => {
    reset();
    const state = replayLeagueGame([
      ev("lineup_set", {
        lineup: {
          forwards: ["fwd1", "fwd2"],
          backs: ["back1", "back2"],
          bench: ["sub1"],
        },
      }),
      ev("quarter_start", { quarter: 1 }),
      // Sub off a forward → bench player joins forwards.
      ev("swap", {
        off_player_id: "fwd1",
        on_player_id: "sub1",
        quarter: 1,
        elapsed_ms: 100_000,
      }),
    ]);
    expect(state.lineup?.forwards.sort()).toEqual(["fwd2", "sub1"]);
    expect(state.lineup?.backs).toEqual(["back1", "back2"]);
    expect(state.lineup?.bench).toEqual(["fwd1"]);
  });

  it("league_position_change moves a player between forwards and backs without leaving the field", () => {
    reset();
    const state = replayLeagueGame([
      ev("lineup_set", {
        lineup: {
          forwards: ["fwd1", "fwd2"],
          backs: ["back1"],
          bench: [],
        },
      }),
      ev("quarter_start", { quarter: 1 }),
      ev(
        "league_position_change",
        { to_zone: "back", quarter: 1, elapsed_ms: 50_000 },
        "fwd2",
      ),
    ]);
    expect(state.lineup?.forwards).toEqual(["fwd1"]);
    expect(state.lineup?.backs.sort()).toEqual(["back1", "fwd2"]);
    expect(state.lineup?.bench).toEqual([]);
  });

  it("legacy {field, bench} lineup_set payloads migrate into the forwards bucket", () => {
    reset();
    // Older draft rows persisted before the zone rollout shipped
    // `{ field, bench }`. `normalizeLeagueLineup` rescues them by
    // funnelling `field` into `forwards`.
    const state = replayLeagueGame([
      ev("lineup_set", {
        lineup: { field: ["legacy1", "legacy2"], bench: ["benched"] },
      }),
    ]);
    expect(state.lineup?.forwards).toEqual(["legacy1", "legacy2"]);
    expect(state.lineup?.backs).toEqual([]);
    expect(state.lineup?.bench).toEqual(["benched"]);
  });
});
