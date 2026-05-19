import { describe, expect, it } from "vitest";
import {
  replayLeagueGame,
  suggestLeagueLineup,
} from "@/lib/sports/rugby_league/fairness";
import type { GameEvent, GameEventType, Player } from "@/lib/types";

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

describe("suggestLeagueLineup — chip-aware zone distribution", () => {
  // Minimal Player factory — only the fields the suggester reads
  // (id, jersey_number, chip) matter; the rest are stub strings so
  // tests stay focused on the routing behaviour under test.
  function p(
    id: string,
    jersey: number,
    chip: "a" | "b" | null = null,
  ): Player {
    return {
      id,
      team_id: "t1",
      full_name: id,
      jersey_number: jersey,
      is_active: true,
      chip,
      created_by: "u1",
      created_at: "2026-05-19T00:00:00Z",
      updated_at: "2026-05-19T00:00:00Z",
    };
  }

  it("places forward-chipped players into the forwards bucket even when unchipped players outrank them on fairness", () => {
    // Regression for the picker bug: an 11-player squad where the
    // top-ranked players are unchipped and the chipped forwards sit
    // lower in the rank. A single-pass walk lets the unchipped
    // players consume all the forward slots, spilling the chipped
    // forwards into backs — which the formation picker then
    // renders as green dots on the back row, contradicting the
    // chip's stored position.
    const players: Player[] = [
      // Unchipped first (lower jersey → ranks first on the
      // jersey-number tiebreak when nobody has season events).
      p("u1", 1),
      p("u2", 2),
      p("u3", 3),
      p("u4", 4),
      p("u5", 5),
      p("u6", 6),
      // Chipped forwards sit further down the rank.
      p("f1", 7, "a"),
      p("f2", 8, "a"),
      p("f3", 9, "a"),
      // Chipped backs.
      p("b1", 10, "b"),
      p("b2", 11, "b"),
      // Overflow — won't make the on-field cut.
      p("u7", 12),
    ];
    const result = suggestLeagueLineup({
      players,
      defaultOnFieldSize: 11,
      forwardCount: 5,
      seasonEvents: [],
      requiredUnbrokenPeriods: 1,
    });
    // All three forward-chipped players land in forwards…
    expect(result.lineup.forwards).toContain("f1");
    expect(result.lineup.forwards).toContain("f2");
    expect(result.lineup.forwards).toContain("f3");
    // …and the back-chipped players land in backs.
    expect(result.lineup.backs).toContain("b1");
    expect(result.lineup.backs).toContain("b2");
    // No chipped player ends up in the wrong zone.
    expect(result.lineup.backs).not.toContain("f1");
    expect(result.lineup.backs).not.toContain("f2");
    expect(result.lineup.backs).not.toContain("f3");
    expect(result.lineup.forwards).not.toContain("b1");
    expect(result.lineup.forwards).not.toContain("b2");
    // Field totals respect the F/B split.
    expect(result.lineup.forwards).toHaveLength(5);
    expect(result.lineup.backs).toHaveLength(6);
    expect(result.lineup.bench).toHaveLength(1);
  });

  it("spills chip-overflow when a chipped zone is already saturated", () => {
    // Six forward-chipped players for only 4 forward slots — two
    // must spill into backs. Verifies the second pass correctly
    // catches chip-overflow rather than dropping them on the bench.
    const players: Player[] = [
      p("f1", 1, "a"),
      p("f2", 2, "a"),
      p("f3", 3, "a"),
      p("f4", 4, "a"),
      p("f5", 5, "a"),
      p("f6", 6, "a"),
      p("u1", 7),
      p("u2", 8),
    ];
    const result = suggestLeagueLineup({
      players,
      defaultOnFieldSize: 8,
      forwardCount: 4,
      seasonEvents: [],
      requiredUnbrokenPeriods: 1,
    });
    expect(result.lineup.forwards).toHaveLength(4);
    expect(result.lineup.backs).toHaveLength(4);
    // First-pass picks (by jersey-number rank) fill the forwards.
    expect(result.lineup.forwards).toEqual(
      expect.arrayContaining(["f1", "f2", "f3", "f4"]),
    );
    // Overflow forwards land in backs alongside the unchipped fill.
    const inBacks = new Set(result.lineup.backs);
    expect(inBacks.has("f5") || inBacks.has("f6")).toBe(true);
  });

  it("falls back to floor(n/2) forwards when forwardCount is omitted", () => {
    const players: Player[] = [
      p("u1", 1),
      p("u2", 2),
      p("u3", 3),
      p("u4", 4),
      p("u5", 5),
      p("u6", 6),
      p("u7", 7),
    ];
    const result = suggestLeagueLineup({
      players,
      defaultOnFieldSize: 7,
      seasonEvents: [],
      requiredUnbrokenPeriods: 1,
    });
    expect(result.lineup.forwards).toHaveLength(3); // floor(7/2)
    expect(result.lineup.backs).toHaveLength(4); // remainder
  });

  it("does NOT penalise unchipped players — top-N by fairness gets starters; chip only routes the zone (Steve 2026-05-19)", () => {
    // Mock a season where the unchipped players (u1, u2) have a
    // big shortfall — they've missed unbroken halves repeatedly
    // and rank ahead of the chipped roster on fairness. The
    // chipped players (f1, b1, b2) have a clean record. Older
    // version of the suggester ran "chipped first" passes which
    // bumped u1/u2 to the bench while still seating low-fairness
    // chipped players — bug under test.
    //
    // We construct the shortfall via a previous game's events: u1
    // and u2 are listed in lineup_set but never reach quarter_end
    // (no quarter_start), so unbrokenPeriodCompliance flags them
    // as zero unbroken periods → high shortfall.
    const players: Player[] = [
      p("u1", 1),
      p("u2", 2),
      p("f1", 3, "a"),
      p("b1", 4, "b"),
      p("b2", 5, "b"),
    ];
    // Prior game lineup_set + a finalised event so the
    // unbrokenPeriod helper has structure to tally — but no
    // quarter starts/ends so EVERY player gets 0 unbroken
    // periods, putting u1 + u2 at the top of the rank by shared
    // shortfall + jersey tiebreak. (Field-size 4 → bench 1.)
    const ts = (n: number) => new Date(2026, 0, 1, 0, 0, n).toISOString();
    const seasonEvents: GameEvent[] = [
      {
        id: "e1",
        game_id: "g0",
        type: "lineup_set",
        player_id: null,
        metadata: {
          lineup: {
            forwards: ["f1"],
            backs: ["b1", "b2"],
            bench: ["u1", "u2"],
          },
          sport: "rugby_league",
        },
        created_by: null,
        created_at: ts(1),
      },
    ];
    const result = suggestLeagueLineup({
      players,
      defaultOnFieldSize: 4,
      forwardCount: 2,
      seasonEvents,
      requiredUnbrokenPeriods: 1,
    });
    // u1 + u2 should be in the starters (they outrank everyone
    // on fairness via jersey + shared shortfall) — NOT benched.
    const starters = new Set([
      ...result.lineup.forwards,
      ...result.lineup.backs,
    ]);
    expect(starters.has("u1")).toBe(true);
    expect(starters.has("u2")).toBe(true);
    // Chipped players still go to their preferred zone WHEN they
    // start. f1 (forward chip) → forwards if it makes the cut.
    if (starters.has("f1")) {
      expect(result.lineup.forwards).toContain("f1");
    }
    if (starters.has("b1")) {
      expect(result.lineup.backs).toContain("b1");
    }
    if (starters.has("b2")) {
      expect(result.lineup.backs).toContain("b2");
    }
    // The bench player is the LOWEST fairness rank, not one of
    // u1 / u2 (the unchipped players who were being penalised).
    expect(result.lineup.bench).toHaveLength(1);
    expect(result.lineup.bench[0]).not.toBe("u1");
    expect(result.lineup.bench[0]).not.toBe("u2");
  });
});
