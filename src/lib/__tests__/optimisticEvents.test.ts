// Optimistic writes for the sports whose live screen is a replay of the
// game's events (soccer's family, basketball): a tap shows at once and
// the server's copy takes its place when a refresh brings it (UX audit
// 23 Oct 2026, package C: "score taps lag seconds"). AFL's store does the
// same with its own mutations (LiveGame.tsx handleOpponent).

import { describe, expect, it } from "vitest";
import type { GameEvent } from "@/lib/types";
import {
  isOptimisticEventId,
  liveEvents,
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
import { replayTouchGame } from "@/lib/sports/touch/replay";
import { TOUCH_SCORE_EVENT_TYPES, isGirlsTry, touchTryEventType } from "@/lib/sports/touch/scoreEvents";
import { replayLeagueGame } from "@/lib/sports/rugby_league/fairness";
import { RUGBY_SCORE_EVENT_TYPES, conversionTryEventId } from "@/lib/sports/rugby_league/kicks";

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

// ─── Touch and Oztag (23 Oct 2026: every write but tries waited) ───

describe("touch's tries", () => {
  const start = (): GameEvent[] => [
    ev("lineup_set", "2026-10-23T08:00:00.100000+00:00", {
      metadata: {
        lineup: { lines: { middle: ["m1", "m2"], link: ["l1", "l2"], wing: ["w1", "w2"], field: [] }, bench: ["b1", "b2"] },
      },
    }),
    ev("quarter_start", "2026-10-23T08:00:00.200000+00:00", { metadata: { quarter: 1 } }),
  ];
  const groupOf = (id: string) => (id.startsWith("m") ? ("girl" as const) : ("boy" as const));

  it("names each try's event type as the server writes it", () => {
    expect(touchTryEventType("ours", false)).toBe("try");
    expect(touchTryEventType("ours", true)).toBe("girls_try");
    expect(touchTryEventType("theirs", false)).toBe("opponent_try");
    expect(touchTryEventType("theirs", true)).toBe("opponent_girls_try");
    expect(Array.from(TOUCH_SCORE_EVENT_TYPES).sort()).toEqual(["girls_try", "opponent_girls_try", "opponent_try", "try"]);
  });

  it("a girl's try is the scorer's group where girls' tries count double, and the coach's word without a scorer", () => {
    const base = { girlsTryDouble: true, groupOf };
    expect(isGirlsTry({ ...base, side: "ours", playerId: "m1" })).toBe(true);
    expect(isGirlsTry({ ...base, side: "ours", playerId: "l1", girl: true })).toBe(false);
    expect(isGirlsTry({ ...base, side: "ours", playerId: null, girl: true })).toBe(true);
    expect(isGirlsTry({ ...base, side: "theirs", playerId: null, girl: true })).toBe(true);
    expect(isGirlsTry({ ...base, girlsTryDouble: false, side: "ours", playerId: "m1" })).toBe(false);
  });

  it("a girl's try counts 2 at once, a sub swaps at once, and an undo takes the try back", () => {
    const server = start();
    const girls = pending(liveEvents.score(touchTryEventType("ours", true), "m1", { quarter: 1, elapsed_ms: 1000 }), "op1", server);
    const swap = pending(
      liveEvents.swap({ off_player_id: "w1", on_player_id: "b1", quarter: 1, elapsed_ms: 2000 }),
      "op2",
      server,
      [girls],
    );
    const shown = mergeOptimisticEvents(server, [girls, swap]);
    const state = replayTouchGame(shown);
    expect(state.teamScore.points).toBe(2);
    expect(state.lineup?.lines.wing).toContain("b1");
    expect(state.lineup?.bench).toContain("w1");
    const undo = optimisticUndo(shown, TOUCH_SCORE_EVENT_TYPES);
    expect(undo?.metadata).toMatchObject({ original_type: "girls_try" });
    const after = replayTouchGame(mergeOptimisticEvents(server, [girls, swap, pending(undo!, "op3", server, [girls, swap])]));
    expect(after.teamScore.points).toBe(0);
  });

  it("a field the mixed rule shrinks shows at once", () => {
    const server = start();
    const shrink = pending(liveEvents.fieldSize({ on_field_size: 5, quarter: 1, elapsed_ms: 3000 }), "op1", server);
    expect(replayTouchGame(mergeOptimisticEvents(server, [shrink])).fieldSize).toBe(5);
  });
});

// ─── Rugby league and union (23 Oct 2026: every write waited) ──────

describe("rugby's writes", () => {
  const kickoff = (): GameEvent[] => [
    ev("lineup_set", "2026-10-23T08:00:00.100000+00:00", {
      metadata: { lineup: { forwards: ["f1", "f2"], backs: ["b1", "b2"], bench: ["x1", "x2"] } },
    }),
    ev("quarter_start", "2026-10-23T08:00:00.200000+00:00", { metadata: { quarter: 1 } }),
  ];
  const at = { quarter: 1, elapsed_ms: 1000 };

  it("a try and its conversion count at once; undo takes back the conversion, then the try", () => {
    const server = kickoff();
    const tryEv = pending(liveEvents.score("try", "f1", at), "op1", server);
    const conv = pending(
      liveEvents.conversion({ kicker_id: "f2", made: true, force: false, ...at }),
      "op2",
      server,
      [tryEv],
    );
    const shown = mergeOptimisticEvents(server, [tryEv, conv]);
    expect(replayLeagueGame(shown).teamScore.points).toBe(6);
    expect(replayLeagueGame(shown).playerConversions.f2).toEqual({ attempts: 1, made: 1 });
    const undo = optimisticUndo(shown, RUGBY_SCORE_EVENT_TYPES);
    expect(undo?.metadata).toMatchObject({ original_type: "conversion_attempt" });
    const after = mergeOptimisticEvents(server, [tryEv, conv, pending(undo!, "op3", server, [tryEv, conv])]);
    expect(replayLeagueGame(after).teamScore.points).toBe(4);
  });

  it("every score type the server's undo can take back", () => {
    expect(Array.from(RUGBY_SCORE_EVENT_TYPES).sort()).toEqual(
      [
        "conversion_attempt",
        "field_goal",
        "opponent_conversion",
        "opponent_field_goal",
        "opponent_penalty_goal",
        "opponent_try",
        "penalty_goal",
        "try",
      ].sort(),
    );
  });

  it("a sub, a move to the backs and a lineup change show at once", () => {
    const server = kickoff();
    const swap = pending(liveEvents.swap({ off_player_id: "f1", on_player_id: "x1", ...at }), "op1", server);
    const move = pending(liveEvents.leaguePositionChange({ player_id: "f2", to_zone: "back", ...at }), "op2", server, [swap]);
    let state = replayLeagueGame(mergeOptimisticEvents(server, [swap, move]));
    expect(state.lineup).toEqual({ forwards: ["x1"], backs: ["b1", "b2", "f2"], bench: ["x2", "f1"] });
    const set = pending(
      liveEvents.lineupSet({ lineup: { forwards: ["x1", "x2"], backs: ["b1", "b2", "f2"], bench: ["f1"] }, ...at }),
      "op3",
      server,
      [swap, move],
    );
    state = replayLeagueGame(mergeOptimisticEvents(server, [swap, move, set]));
    expect(state.lineup?.forwards).toEqual(["x1", "x2"]);
  });

  it("a conversion names a try the server has, never one still on its way", () => {
    const server = [...kickoff(), ev("try", "2026-10-23T08:01:00+00:00", { player_id: "f1", metadata: at })];
    const savedTry = server[server.length - 1];
    expect(conversionTryEventId(server)).toBe(savedTry.id);
    const second = pending(liveEvents.score("try", "f2", at), "op1", server);
    const converted = [...server, ev("conversion_attempt", "2026-10-23T08:01:30+00:00", { player_id: "f2", metadata: { made: true } })];
    // The saved try is converted; the only one waiting hasn't saved yet.
    expect(conversionTryEventId(mergeOptimisticEvents(converted, [second]))).toBeUndefined();
    expect(isOptimisticEventId(second.id)).toBe(true);
    expect(isOptimisticEventId(savedTry.id)).toBe(false);
  });
});
