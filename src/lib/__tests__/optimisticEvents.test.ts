// Optimistic writes for the sports whose live screen is a replay of the
// game's events (soccer's family, basketball): a tap shows at once and
// the server's copy takes its place when a refresh brings it (UX audit
// 23 Oct 2026, package C: "score taps lag seconds"). AFL's store does the
// same with its own mutations (LiveGame.tsx handleOpponent).

import { describe, expect, it } from "vitest";
import type { GameEvent } from "@/lib/types";
import {
  mergeOptimisticEvents,
  optimisticCreatedAt,
  optimisticUndo,
  settlePendingEvents,
  toOptimisticEvent,
  type PendingEvent,
} from "@/lib/live/optimisticEvents";
import { replaySoccerGame } from "@/lib/sports/soccer/replay";
import { replayBasketballGame } from "@/lib/sports/basketball/replay";
import {
  BASKETBALL_SCORE_EVENT_TYPES,
  basketballScoreEventType,
} from "@/lib/sports/basketball/scoreEvents";

const GAME = "g1";
let n = 0;
function ev(type: string, created_at: string, extra: Partial<GameEvent> = {}): GameEvent {
  n += 1;
  return {
    id: `e${n}`,
    game_id: GAME,
    type: type as GameEvent["type"],
    player_id: null,
    metadata: {},
    created_by: null,
    created_at,
    ...extra,
  };
}

// Postgres timestamptz as PostgREST returns it (microseconds, +00:00).
const T0 = "2026-10-23T08:00:00.000000+00:00";
const soccerKickoff = (): GameEvent[] => [
  ev("lineup_set", "2026-10-23T08:00:00.100000+00:00", {
    metadata: {
      lineup: {
        keeper: "k",
        lines: { def: ["d1", "d2"], mid: ["m1", "m2", "m3"], att: ["a1"], field: [] },
        bench: ["b1"],
      },
    },
  }),
  ev("quarter_start", "2026-10-23T08:00:00.200000+00:00", { metadata: { quarter: 1 } }),
];

function pending(input: Parameters<typeof toOptimisticEvent>[0], opId: string, server: GameEvent[], prior: PendingEvent[] = []) {
  return toOptimisticEvent(input, {
    opId,
    gameId: GAME,
    createdAt: optimisticCreatedAt([...server, ...prior].map((e) => e.created_at), Date.parse("2026-10-23T07:59:00Z")),
  });
}

describe("optimisticCreatedAt", () => {
  it("sorts after every event the screen has, even when the phone's clock runs behind", () => {
    const server = soccerKickoff();
    // The phone thinks it's a minute earlier than the server's last event.
    const at = optimisticCreatedAt(server.map((e) => e.created_at), Date.parse("2026-10-23T07:59:00Z"));
    for (const e of server) expect(at.localeCompare(e.created_at)).toBeGreaterThan(0);
  });

  it("orders two quick writes in the order they were made", () => {
    const first = optimisticCreatedAt([T0], Date.parse("2026-10-23T09:00:00Z"));
    const second = optimisticCreatedAt([T0, first], Date.parse("2026-10-23T09:00:00Z"));
    expect(second.localeCompare(first)).toBeGreaterThan(0);
  });

  it("uses the phone's clock when it's ahead", () => {
    expect(optimisticCreatedAt([T0], Date.parse("2026-10-23T09:00:00.000Z"))).toBe("2026-10-23T09:00:00.000Z");
  });
});

describe("a write shows before the server has it", () => {
  it("a goal for us counts on the replay at once", () => {
    const server = soccerKickoff();
    const goal = pending({ type: "goal", player_id: "a1", metadata: { quarter: 1, elapsed_ms: 60_000 } }, "op1", server);
    const state = replaySoccerGame(mergeOptimisticEvents(server, [goal]));
    expect(state.teamScore.goals).toBe(1);
    expect(state.playerGoals.a1).toBe(1);
  });

  it("a sub swaps the kids at once", () => {
    const server = soccerKickoff();
    const swap = pending(
      { type: "swap", player_id: "b1", metadata: { off_player_id: "d1", on_player_id: "b1", quarter: 1, elapsed_ms: 90_000 } },
      "op1",
      server,
    );
    const state = replaySoccerGame(mergeOptimisticEvents(server, [swap]));
    expect(state.lineup?.lines.def).toContain("b1");
    expect(state.lineup?.bench).toContain("d1");
  });

  it("the server's copy replaces it (same idempotency key), so it never counts twice", () => {
    const server = soccerKickoff();
    const goal = pending({ type: "goal", player_id: "a1", metadata: { quarter: 1, elapsed_ms: 60_000 } }, "op1", server);
    const landed = [
      ...server,
      ev("goal", "2026-10-23T08:01:00.000000+00:00", {
        player_id: "a1",
        metadata: { quarter: 1, elapsed_ms: 60_000, sport: "soccer" },
        idempotency_key: "op1",
      }),
    ];
    const merged = mergeOptimisticEvents(landed, [goal]);
    expect(merged.filter((e) => e.type === "goal")).toHaveLength(1);
    expect(replaySoccerGame(merged).teamScore.goals).toBe(1);
  });
});

describe("settlePendingEvents (after a refresh)", () => {
  it("drops a write the server has returned", () => {
    const server = soccerKickoff();
    const goal = { ...pending({ type: "goal", player_id: "a1", metadata: { quarter: 1 } }, "op1", server), flushed: true };
    const landed = [...server, ev("goal", "2026-10-23T08:01:00+00:00", { idempotency_key: "op1" })];
    expect(settlePendingEvents([goal], landed)).toEqual([]);
  });

  it("keeps a write the server hasn't saved yet", () => {
    const server = soccerKickoff();
    const goal = pending({ type: "goal", player_id: "a1", metadata: { quarter: 1 } }, "op1", server);
    expect(settlePendingEvents([goal], server)).toEqual([goal]);
  });

  it("keeps a saved write through one refresh that raced it, then lets it go", () => {
    // An undo with nothing left to take back saves no row: once saved and
    // two refreshes on, it mustn't haunt the screen.
    const server = soccerKickoff();
    const undo = { ...pending({ type: "score_undo", metadata: {} }, "op1", server), flushed: true };
    const once = settlePendingEvents([undo], server);
    expect(once).toHaveLength(1);
    expect(settlePendingEvents(once, server)).toEqual([]);
  });
});

describe("optimisticUndo", () => {
  const scoreTypes = new Set(["goal", "opponent_goal"]);

  it("names the latest goal still standing, as the server's undo does", () => {
    const server = [
      ...soccerKickoff(),
      ev("goal", "2026-10-23T08:01:00+00:00", { player_id: "a1", metadata: { quarter: 1 } }),
      ev("opponent_goal", "2026-10-23T08:02:00+00:00", { metadata: { quarter: 1 } }),
    ];
    const undo = optimisticUndo(server, scoreTypes);
    expect(undo?.metadata).toMatchObject({ original_type: "opponent_goal", quarter: 1 });
    const merged = mergeOptimisticEvents(server, [pending(undo!, "op9", server)]);
    const state = replaySoccerGame(merged);
    expect(state.opponentScore.goals).toBe(0);
    expect(state.teamScore.goals).toBe(1);
  });

  it("can take back a goal the server hasn't saved yet", () => {
    const server = soccerKickoff();
    const goal = pending({ type: "goal", player_id: "a1", metadata: { quarter: 1 } }, "op1", server);
    const withGoal = mergeOptimisticEvents(server, [goal]);
    const undo = optimisticUndo(withGoal, scoreTypes);
    expect(undo).not.toBeNull();
    const state = replaySoccerGame(mergeOptimisticEvents(server, [goal, pending(undo!, "op2", server, [goal])]));
    expect(state.teamScore.goals).toBe(0);
  });

  it("is nothing when no score stands", () => {
    expect(optimisticUndo(soccerKickoff(), scoreTypes)).toBeNull();
  });
});

describe("basketball's baskets", () => {
  const tipoff = (): GameEvent[] => [
    ev("lineup_set", "2026-10-23T08:00:00.100000+00:00", {
      metadata: { lineup: { lines: { guard: ["g1", "g2"], forward: ["f1", "f2", "f3"], court: [] }, bench: ["b1"] } },
    }),
    ev("quarter_start", "2026-10-23T08:00:00.200000+00:00", { metadata: { quarter: 1 } }),
  ];

  it("names each basket's event type as the server writes it", () => {
    expect(basketballScoreEventType("ours", 1)).toBe("free_throw");
    expect(basketballScoreEventType("ours", 3)).toBe("three_pointer");
    expect(basketballScoreEventType("theirs", 2)).toBe("opponent_two_pointer");
    expect(BASKETBALL_SCORE_EVENT_TYPES.size).toBe(6);
  });

  it("a three counts at once, and an undo takes it back", () => {
    const server = tipoff();
    const three = pending(
      { type: basketballScoreEventType("ours", 3), player_id: "g1", metadata: { quarter: 1, elapsed_ms: 1000 } },
      "op1",
      server,
    );
    const shown = mergeOptimisticEvents(server, [three]);
    expect(replayBasketballGame(shown).teamScore.points).toBe(3);
    const undo = optimisticUndo(shown, BASKETBALL_SCORE_EVENT_TYPES);
    const after = mergeOptimisticEvents(server, [three, pending(undo!, "op2", server, [three])]);
    expect(replayBasketballGame(after).teamScore.points).toBe(0);
  });
});
