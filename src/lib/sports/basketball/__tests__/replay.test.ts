// The basketball replay: events → lineup, score, fouls, sit-outs, and
// each kid's time in each line and each position.

import { describe, expect, it } from "vitest";
import { basketballCanPlay, basketballGameMs, replayBasketballGame } from "@/lib/sports/basketball/replay";
import { COURT, LINES, MIN, POSITIONS, game } from "./basketballGame";

const minutes = (ms: number | undefined) => (ms ?? 0) / MIN;

describe("replayBasketballGame: time on court", () => {
  it("credits a half to everyone on, and a sub's time to each side of it", () => {
    const g = game();
    g.lineup(COURT);
    g.start(1);
    g.swap("c", "f", 5);
    g.end(1, 20);
    const s = replayBasketballGame(g.events);

    expect(minutes(s.ms.a.court)).toBe(20);
    expect(minutes(s.ms.c.court)).toBe(5);
    expect(minutes(s.ms.f.court)).toBe(15);
    expect(s.ms.g).toBeUndefined();
    // The kid coming on takes the same spot.
    expect(s.lineup?.lines.court).toEqual(["a", "b", "f", "d", "e"]);
    expect(s.lineup?.bench).toEqual(["g", "h", "i", "j", "c"]);
    expect(s.completedPeriodMs).toBe(20 * MIN);
    expect(s.lastSubbedOffMs.c).toBe(5 * MIN);
    expect(s.lastSubbedOnMs.f).toBe(5 * MIN);
  });

  it("keeps guard and forward time apart, and both count as game time", () => {
    const g = game();
    g.lineup(LINES);
    g.start(1);
    g.end(1, 20);
    // The break: a moves to the forwards, c to the guards.
    g.lineup({ ...LINES, lines: { guard: ["c", "b"], forward: ["a", "d", "e"], court: [] } });
    g.start(2);
    g.end(2, 20);
    const s = replayBasketballGame(g.events);

    expect(s.ms.a).toEqual({ guard: 20 * MIN, forward: 20 * MIN });
    expect(s.ms.c).toEqual({ forward: 20 * MIN, guard: 20 * MIN });
    expect(basketballGameMs(s, "a")).toBe(40 * MIN);
    expect(s.msByPeriod.a).toEqual({ 1: { guard: 20 * MIN }, 2: { forward: 20 * MIN } });
  });

  it("credits positions, and a sub takes the position of the kid going off", () => {
    const g = game();
    g.lineup(POSITIONS);
    g.start(1);
    g.swap("a", "f", 8);
    g.end(1, 20);
    const s = replayBasketballGame(g.events);

    expect(s.posMs.a).toEqual({ pg: 8 * MIN });
    expect(s.posMs.f).toEqual({ pg: 12 * MIN });
    expect(s.posMs.e).toEqual({ c: 20 * MIN });
    expect(s.lineup?.slots?.f).toBe("pg");
    expect(s.lineup?.slots?.a).toBeUndefined();
    expect(s.ms.f).toEqual({ guard: 12 * MIN });
  });

  it("moves a kid between lines, and swaps two kids' positions", () => {
    const g = game();
    g.lineup(POSITIONS);
    g.start(1);
    // a (PG) and e (C) swap: lines and positions both.
    g.move("a", "e", "forward", 10);
    g.end(1, 20);
    const s = replayBasketballGame(g.events);

    expect(s.lineup?.lines.guard).toEqual(["e", "b"]);
    expect(s.lineup?.lines.forward).toEqual(["c", "d", "a"]);
    expect(s.lineup?.slots).toMatchObject({ a: "c", e: "pg" });
    expect(s.posMs.a).toEqual({ pg: 10 * MIN, c: 10 * MIN });
    expect(s.ms.a).toEqual({ guard: 10 * MIN, forward: 10 * MIN });

    const h = game();
    h.lineup(LINES);
    h.start(1);
    // "Move to guards": c alone, no partner.
    h.move("c", null, "guard", 5);
    h.end(1, 20);
    const t = replayBasketballGame(h.events);
    expect(t.lineup?.lines.guard).toEqual(["a", "b", "c"]);
    expect(t.ms.c).toEqual({ forward: 5 * MIN, guard: 15 * MIN });
  });

  it("credits time so far when given nowMs", () => {
    const g = game();
    g.lineup(COURT);
    g.start(1);
    g.swap("c", "f", 5);
    const s = replayBasketballGame(g.events, { nowMs: 12 * MIN });
    expect(minutes(s.ms.a.court)).toBe(12);
    expect(minutes(s.ms.f.court)).toBe(7);
  });
});

describe("replayBasketballGame: score", () => {
  it("adds 1, 2 and 3 for both sides, by kid and by period", () => {
    const g = game();
    g.lineup(COURT);
    g.start(1);
    g.basket("two_pointer", 1, "a");
    g.basket("three_pointer", 2, "b");
    g.basket("free_throw", 3, "a");
    g.basket("opponent_two_pointer", 4);
    g.basket("opponent_three_pointer", 5);
    g.end(1, 20);
    g.start(2);
    g.basket("two_pointer", 1, null);
    const s = replayBasketballGame(g.events);

    expect(s.teamScore).toEqual({ points: 8, made: { 1: 1, 2: 2, 3: 1 } });
    expect(s.opponentScore).toEqual({ points: 5, made: { 1: 0, 2: 1, 3: 1 } });
    expect(s.playerPoints).toEqual({ a: 3, b: 3 });
    expect(s.scoreByPeriod).toEqual({ 1: { ours: 6, theirs: 5 }, 2: { ours: 2, theirs: 0 } });
  });

  it("takes back the latest basket, or the one named", () => {
    const g = game();
    g.lineup(COURT);
    g.start(1);
    const three = g.basket("three_pointer", 1, "b");
    g.basket("two_pointer", 2, "a");
    g.add("score_undo", {});
    g.add("score_undo", { target_event_id: three.id });
    const s = replayBasketballGame(g.events);
    expect(s.teamScore.points).toBe(0);
    expect(s.playerPoints).toEqual({ a: 0, b: 0 });
    expect(s.scoreByPeriod[1]).toEqual({ ours: 0, theirs: 0 });
  });
});

describe("replayBasketballGame: fouls, foul-outs and sit-outs", () => {
  it("counts each kid's fouls, and an undo takes one back", () => {
    const g = game();
    g.lineup(COURT);
    g.start(1);
    g.foul("a", 1);
    g.foul("a", 2);
    g.foul("b", 3);
    g.foul("a", 4, { undo: true });
    const s = replayBasketballGame(g.events);
    expect(s.fouls).toEqual({ a: 1, b: 1 });
  });

  it("takes a fouled-out kid off for the game, and the sub takes their spot", () => {
    const g = game();
    g.lineup(POSITIONS);
    g.start(1);
    g.foulOut("c", 6);
    g.swap("c", "f", 6);
    g.end(1, 20);
    const s = replayBasketballGame(g.events);

    expect(s.fouledOutIds).toEqual(["c"]);
    expect(s.injuredIds).toEqual(["c"]);
    expect(s.lineup?.lines.forward).toEqual(["f", "d", "e"]);
    expect(s.lineup?.slots?.f).toBe("sf");
    expect(s.lineup?.bench).toContain("c");
    expect(minutes(s.ms.c.forward)).toBe(6);
    expect(basketballCanPlay(s, "c", 30 * MIN)).toBe(false);
  });

  it("sits a kid out for 5 minutes of clock time, across a break", () => {
    const g = game();
    g.lineup(COURT);
    g.start(1);
    g.sitOut("a", 18);
    g.swap("a", "f", 18);
    const during = replayBasketballGame(g.events);
    expect(during.sittingOut.a).toBe(23 * MIN);
    expect(during.lineup?.lines.court).toEqual(["f", "b", "c", "d", "e"]);
    expect(basketballCanPlay(during, "a", 20 * MIN)).toBe(false);

    g.end(1, 20);
    // Three more minutes of clock time into the second half.
    const s = replayBasketballGame(g.events);
    expect(basketballCanPlay(s, "a", 20 * MIN + 2 * MIN)).toBe(false);
    expect(basketballCanPlay(s, "a", 20 * MIN + 3 * MIN)).toBe(true);
  });

  it("ends a sit-out early with a zero duration", () => {
    const g = game();
    g.lineup(COURT);
    g.start(1);
    g.sitOut("a", 2);
    g.add("sit_out", { duration_ms: 0, elapsed_ms: 3 * MIN }, "a");
    const s = replayBasketballGame(g.events);
    expect(s.sittingOut.a).toBeUndefined();
    expect(basketballCanPlay(s, "a", 3 * MIN)).toBe(true);
  });
});
