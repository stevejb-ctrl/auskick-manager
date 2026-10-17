// The soccer replay: events → lineup, score, holds, and each kid's time
// in each line and in goal.

import { describe, expect, it } from "vitest";
import type { GameEvent } from "@/lib/types";
import type { SoccerLineup } from "@/lib/sports/soccer/lineup";
import { replaySoccerGame, soccerGameMs } from "@/lib/sports/soccer/replay";

const MIN = 60_000;

/** A game's events, written in order a second apart. */
function game() {
  const events: GameEvent[] = [];
  const add = (type: string, metadata: Record<string, unknown> = {}, player_id: string | null = null) => {
    const n = events.length + 1;
    events.push({
      id: `e${n}`,
      game_id: "g1",
      type: type as GameEvent["type"],
      player_id,
      metadata,
      created_by: "u1",
      created_at: new Date(Date.UTC(2026, 9, 17, 9, 0, n)).toISOString(),
    });
    return events[events.length - 1];
  };
  return {
    events,
    add,
    lineup: (lineup: SoccerLineup) => add("lineup_set", { lineup }),
    start: (quarter: number) => add("quarter_start", { quarter }),
    end: (quarter: number, minutes: number) => add("quarter_end", { quarter, elapsed_ms: minutes * MIN }),
    swap: (off: string, on: string, minutes: number, line?: string) =>
      add("swap", { off_player_id: off, on_player_id: on, elapsed_ms: minutes * MIN, ...(line ? { line } : {}) }),
    move: (a: string, zoneA: string, b: string | null, zoneB: string, minutes: number) =>
      add("field_zone_swap", { player_a_id: a, zone_a: zoneA, ...(b ? { player_b_id: b } : {}), zone_b: zoneB, elapsed_ms: minutes * MIN }),
  };
}

const SEVEN: SoccerLineup = {
  keeper: "k",
  lines: { def: ["d1", "d2"], mid: ["m1", "m2", "m3"], att: ["a1"], field: [] },
  bench: ["b1", "b2"],
};

const minutes = (ms: number | undefined) => (ms ?? 0) / MIN;

describe("replaySoccerGame: time in each line and in goal", () => {
  it("credits a half to everyone on, and a sub's time to each side of it", () => {
    const g = game();
    g.lineup(SEVEN);
    g.start(1);
    g.swap("m1", "b1", 5);
    g.end(1, 20);
    const s = replaySoccerGame(g.events);

    expect(minutes(s.ms.k.gk)).toBe(20);
    expect(minutes(s.ms.d1.def)).toBe(20);
    expect(minutes(s.ms.m1.mid)).toBe(5);
    expect(minutes(s.ms.b1.mid)).toBe(15);
    expect(s.ms.b2).toBeUndefined();
    // The kid coming on takes the same spot in the line.
    expect(s.lineup?.lines.mid).toEqual(["b1", "m2", "m3"]);
    expect(s.lineup?.bench).toEqual(["b2", "m1"]);
    expect(s.periodEnded).toBe(true);
    expect(s.completedPeriodMs).toBe(20 * MIN);
    expect(s.lastSubbedOffMs.m1).toBe(5 * MIN);
    expect(s.lastSubbedOnMs.b1).toBe(5 * MIN);
  });

  it("keeps keeper minutes apart, and they still count as game time", () => {
    const g = game();
    g.lineup(SEVEN);
    g.start(1);
    g.end(1, 20);
    // Half-time: d1 takes the keeper top, k plays defence.
    g.lineup({ ...SEVEN, keeper: "d1", lines: { ...SEVEN.lines, def: ["k", "d2"] } });
    g.start(2);
    g.end(2, 20);
    const s = replaySoccerGame(g.events);

    expect(s.ms.k).toEqual({ gk: 20 * MIN, def: 20 * MIN });
    expect(s.ms.d1).toEqual({ def: 20 * MIN, gk: 20 * MIN });
    expect(soccerGameMs(s, "k")).toBe(40 * MIN);
    expect(s.keeperAtEnd).toEqual({ 1: "k", 2: "d1" });
    expect(s.msByPeriod.k).toEqual({ 1: { gk: 20 * MIN }, 2: { def: 20 * MIN } });
    expect(s.completedPeriodMs).toBe(40 * MIN);
    expect(soccerGameMs(s, "nobody")).toBe(0);
  });

  it("swaps an outfield kid into goal mid-half", () => {
    const g = game();
    g.lineup(SEVEN);
    g.start(1);
    g.move("a1", "att", "k", "gk", 10);
    g.end(1, 20);
    const s = replaySoccerGame(g.events);

    expect(s.lineup?.keeper).toBe("a1");
    expect(s.lineup?.lines.att).toEqual(["k"]);
    expect(s.ms.a1).toEqual({ att: 10 * MIN, gk: 10 * MIN });
    expect(s.ms.k).toEqual({ gk: 10 * MIN, att: 10 * MIN });
    expect(s.keeperAtEnd[1]).toBe("a1");
  });

  it("moves a kid between lines, swapping or into a gap", () => {
    const g = game();
    g.lineup(SEVEN);
    g.start(1);
    g.move("d1", "def", "m1", "mid", 4);
    g.move("a1", "att", null, "def", 8);
    g.end(1, 20);
    const s = replaySoccerGame(g.events);

    expect(s.lineup?.lines).toEqual({ def: ["m1", "d2", "a1"], mid: ["d1", "m2", "m3"], att: [], field: [] });
    expect(s.ms.d1).toEqual({ def: 4 * MIN, mid: 16 * MIN });
    expect(s.ms.a1).toEqual({ att: 8 * MIN, def: 12 * MIN });
  });

  it("reorders two kids in one line without moving their time", () => {
    const g = game();
    g.lineup(SEVEN);
    g.start(1);
    g.move("m1", "mid", "m3", "mid", 6);
    g.end(1, 20);
    const s = replaySoccerGame(g.events);
    expect(s.lineup?.lines.mid).toEqual(["m3", "m2", "m1"]);
    expect(s.ms.m1).toEqual({ mid: 20 * MIN });
  });

  it("empties the goal for an injured keeper, then fills it from the field or the bench", () => {
    const g = game();
    g.lineup(SEVEN);
    g.start(1);
    g.add("injury", { injured: true, elapsed_ms: 12 * MIN }, "k");
    // Who goes in goal? a1, from attack; b1 comes on in attack.
    g.move("a1", "att", null, "gk", 12);
    g.swap("k", "b1", 12, "att");
    g.end(1, 20);
    const s = replaySoccerGame(g.events);

    expect(s.injuredIds).toEqual(["k"]);
    expect(s.lineup?.keeper).toBe("a1");
    expect(s.lineup?.lines.att).toEqual(["b1"]);
    expect(s.lineup?.bench).toEqual(["b2", "k"]);
    expect(s.ms.k).toEqual({ gk: 12 * MIN });
    expect(s.ms.a1).toEqual({ att: 12 * MIN, gk: 8 * MIN });
    expect(s.ms.b1).toEqual({ att: 8 * MIN });
  });

  it("puts a bench kid straight in an empty goal", () => {
    const g = game();
    g.lineup(SEVEN);
    g.start(1);
    g.add("injury", { injured: true, elapsed_ms: 3 * MIN }, "k");
    g.swap("k", "b2", 3, "gk");
    g.end(1, 20);
    const s = replaySoccerGame(g.events);
    expect(s.lineup?.keeper).toBe("b2");
    expect(s.ms.b2).toEqual({ gk: 17 * MIN });
    // A second injury replacement can't take a goal already filled.
    const again = game();
    again.lineup(SEVEN);
    again.start(1);
    again.swap("nobody", "b1", 2, "gk");
    expect(replaySoccerGame(again.events).lineup?.keeper).toBe("k");
  });

  it("credits time so far for the half in play, when asked", () => {
    const g = game();
    g.lineup(SEVEN);
    g.start(1);
    g.swap("m1", "b1", 5);
    expect(replaySoccerGame(g.events).ms.d1).toBeUndefined();
    const live = replaySoccerGame(g.events, { nowMs: 7 * MIN });
    expect(minutes(live.ms.d1.def)).toBe(7);
    expect(minutes(live.ms.b1.mid)).toBe(2);
    expect(minutes(live.ms.m1.mid)).toBe(5);
    expect(live.keeperAtEnd[1]).toBe("k");
    expect(live.periodEnded).toBe(false);
  });

  it("plays 4 a side in one line, with no keeper", () => {
    const g = game();
    g.lineup({ keeper: null, lines: { def: [], mid: [], att: [], field: ["p1", "p2", "p3", "p4"] }, bench: ["p5"] });
    g.start(1);
    g.swap("p2", "p5", 10);
    g.end(1, 20);
    const s = replaySoccerGame(g.events);
    expect(s.ms.p1).toEqual({ field: 20 * MIN });
    expect(s.ms.p5).toEqual({ field: 10 * MIN });
    expect(s.keeperAtEnd[1]).toBeNull();
  });

  it("never credits a stint twice (a late off, a repeated hooter, a replayed swap)", () => {
    const g = game();
    g.lineup(SEVEN);
    g.start(1);
    g.add("injury", { injured: true, elapsed_ms: 6 * MIN }, "d1");
    g.swap("d1", "b1", 6, "def");
    g.swap("d1", "b1", 6, "def");
    g.end(1, 20);
    g.end(1, 20);
    const s = replaySoccerGame(g.events);
    expect(s.ms.d1).toEqual({ def: 6 * MIN });
    expect(s.ms.b1).toEqual({ def: 14 * MIN });
    expect(s.ms.k).toEqual({ gk: 20 * MIN });
    expect(s.lineup?.lines.def).toEqual(["b1", "d2"]);
  });

  it("gives an injured kid's replacement their spot in the line", () => {
    const g = game();
    g.lineup(SEVEN);
    g.start(1);
    g.add("injury", { injured: true, elapsed_ms: 6 * MIN }, "m2");
    expect(replaySoccerGame(g.events).lineup?.lines.mid).toEqual(["m1", "m3"]);
    g.swap("m2", "b1", 6);
    g.end(1, 20);
    const s = replaySoccerGame(g.events);
    expect(s.lineup?.lines.mid).toEqual(["m1", "b1", "m3"]);
    expect(s.ms.b1).toEqual({ mid: 14 * MIN });
  });

  it("sorts events by time, whatever order they arrive in", () => {
    const g = game();
    g.lineup(SEVEN);
    g.start(1);
    g.swap("m1", "b1", 5);
    g.end(1, 20);
    const shuffled = [g.events[3], g.events[1], g.events[2], g.events[0]];
    expect(replaySoccerGame(shuffled)).toEqual(replaySoccerGame(g.events));
  });
});

describe("replaySoccerGame: the rest of the sideline", () => {
  it("benches a lent kid and stops their time; back from the loan, they're on the bench", () => {
    const g = game();
    g.lineup(SEVEN);
    g.start(1);
    g.add("player_loan", { loaned: true, elapsed_ms: 9 * MIN }, "a1");
    g.swap("a1", "b1", 9, "att");
    g.add("player_loan", { loaned: false, elapsed_ms: 15 * MIN }, "a1");
    g.end(1, 20);
    const s = replaySoccerGame(g.events);
    expect(s.ms.a1).toEqual({ att: 9 * MIN });
    expect(s.loanedIds).toEqual([]);
    expect(s.lineup?.bench).toEqual(["b2", "a1"]);
  });

  it("adds a late arrival to the bench once", () => {
    const g = game();
    g.lineup(SEVEN);
    g.add("player_arrived", {}, "late");
    g.add("player_arrived", {}, "late");
    g.add("player_arrived", {}, "k");
    expect(replaySoccerGame(g.events).lineup?.bench).toEqual(["b1", "b2", "late"]);
  });

  it("clears an injury when the kid is marked recovered", () => {
    const g = game();
    g.lineup(SEVEN);
    g.add("injury", { injured: true }, "m2");
    g.add("injury", { injured: false }, "m2");
    expect(replaySoccerGame(g.events).injuredIds).toEqual([]);
  });

  it("reads the keeper's hold for the half, and its release", () => {
    const g = game();
    g.lineup(SEVEN);
    g.start(1);
    g.add("player_lock", { lock: { kind: "position", position: "gk" }, quarter: 1, elapsed_ms: 0 }, "k");
    g.add("player_lock", { lock: { kind: "field" }, quarter: 1, elapsed_ms: 0 }, "d1");
    expect(replaySoccerGame(g.events).locks).toEqual({ k: { kind: "position", position: "gk" }, d1: { kind: "field" } });
    g.add("player_lock", { lock: null, quarter: 1, elapsed_ms: 60_000 }, "k");
    expect(replaySoccerGame(g.events).locks).toEqual({ d1: { kind: "field" } });
  });

  it("counts goals for both sides, per half, and undoes the latest or the named one", () => {
    const g = game();
    g.lineup(SEVEN);
    g.start(1);
    const first = g.add("goal", {}, "a1");
    g.add("opponent_goal");
    g.end(1, 20);
    g.start(2);
    g.add("goal", {}, "m2");
    g.add("goal", {}, "a1");
    g.add("score_undo", {});
    g.add("score_undo", { target_event_id: first.id });
    g.add("goal", { intended_quarter: 1 }, "d2");
    const s = replaySoccerGame(g.events);

    expect(s.teamScore.goals).toBe(2);
    expect(s.opponentScore.goals).toBe(1);
    expect(s.playerGoals).toEqual({ a1: 0, m2: 1, d2: 1 });
    expect(s.scoreByPeriod).toEqual({ 1: { ours: 1, theirs: 1 }, 2: { ours: 1, theirs: 0 } });
  });

  it("is finalised at full time", () => {
    const g = game();
    g.lineup(SEVEN);
    g.add("game_finalised");
    expect(replaySoccerGame(g.events).finalised).toBe(true);
    expect(replaySoccerGame([]).lineup).toBeNull();
  });
});
