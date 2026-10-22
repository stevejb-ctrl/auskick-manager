// The touch family's replay: minutes in total and per lane, per mixed
// group, tries (a girl's try counts 2), undo, and the field shrinking.

import { describe, expect, it } from "vitest";
import { replayTouchGame, touchCanPlay, touchGameMs, touchMsByGroup } from "@/lib/sports/touch/replay";
import { FIELD, LANES, MIN, SQUAD, game, groupOf } from "./touchGame";

describe("replayTouchGame", () => {
  it("credits each kid's time in their lane, by period", () => {
    const g = game();
    g.lineup(LANES);
    g.start(1);
    g.swap("a", "g", 8);
    g.move("c", "e", "wing", 10);
    g.end(1, 20);
    const s = replayTouchGame(g.events);
    expect(s.ms.a).toEqual({ middle: 8 * MIN });
    expect(s.ms.g).toEqual({ middle: 12 * MIN });
    expect(s.ms.c).toEqual({ link: 10 * MIN, wing: 10 * MIN });
    expect(s.ms.e).toEqual({ wing: 10 * MIN, link: 10 * MIN });
    expect(s.msByPeriod.g[1]).toEqual({ middle: 12 * MIN });
    expect(s.lineup?.lines.middle).toEqual(["g", "b"]);
    expect(s.lineup?.bench).toContain("a");
    expect(s.completedPeriodMs).toBe(20 * MIN);
    expect(touchGameMs(s, "c")).toBe(20 * MIN);
  });

  it("credits the period in play up to now when asked", () => {
    const g = game();
    g.lineup(FIELD);
    g.start(1);
    expect(replayTouchGame(g.events, { nowMs: 5 * MIN }).ms.a).toEqual({ field: 5 * MIN });
    expect(replayTouchGame(g.events).ms.a).toBeUndefined();
  });

  it("scores tries at 1 and girls' tries at 2, and undoes the named one", () => {
    const g = game();
    g.lineup(FIELD);
    g.start(1);
    g.score("try", 2, "d");
    const girls = g.score("girls_try", 4, "a");
    g.score("opponent_try", 5);
    g.score("opponent_girls_try", 6);
    g.end(1, 15);
    g.start(2);
    g.score("try", 1, "a");
    let s = replayTouchGame(g.events);
    expect(s.teamScore).toEqual({ points: 4, tries: 3, girlsTries: 1 });
    expect(s.opponentScore).toEqual({ points: 3, tries: 2, girlsTries: 1 });
    expect(s.playerPoints).toEqual({ d: 1, a: 3 });
    expect(s.playerTries).toEqual({ d: 1, a: 2 });
    expect(s.scoreByPeriod).toEqual({ 1: { ours: 3, theirs: 3 }, 2: { ours: 1, theirs: 0 } });

    g.add("score_undo", { target_event_id: girls.id });
    s = replayTouchGame(g.events);
    expect(s.teamScore).toEqual({ points: 2, tries: 2, girlsTries: 0 });
    expect(s.playerPoints.a).toBe(1);
    expect(s.scoreByPeriod[1]).toEqual({ ours: 1, theirs: 3 });
  });

  it("sends a hurt kid to the bench, and their replacement takes their spot", () => {
    const g = game();
    g.lineup(LANES);
    g.start(1);
    g.injure("c", 6);
    g.swap("c", "h", 6);
    g.end(1, 20);
    const s = replayTouchGame(g.events);
    expect(s.injuredIds).toEqual(["c"]);
    expect(s.lineup?.lines.link).toEqual(["h", "d"]);
    expect(s.ms.c).toEqual({ link: 6 * MIN });
    expect(s.ms.h).toEqual({ link: 14 * MIN });
    expect(touchCanPlay(s, "c")).toBe(false);
  });

  it("follows the field's size as it shrinks and grows back", () => {
    const g = game();
    g.lineup(FIELD);
    g.start(1);
    g.injure("a", 5);
    g.shrink(5, 5);
    g.end(1, 20);
    g.injure("a", 0, false);
    g.shrink(6, 0);
    const s = replayTouchGame(g.events);
    expect(s.fieldSize).toBe(6);
    expect(s.sizeChanges).toEqual([
      { period: 1, elapsedMs: 5 * MIN, size: 5 },
      { period: 1, elapsedMs: 0, size: 6 },
    ]);
    expect(s.injuredIds).toEqual([]);
  });

  it("totals field time per mixed group", () => {
    const g = game();
    g.lineup(FIELD); // a b c girls, d e f boys
    g.start(1);
    g.end(1, 20);
    const s = replayTouchGame(g.events);
    expect(touchMsByGroup(s, SQUAD, groupOf)).toEqual({
      girl: { ms: 60 * MIN, kids: 4 },
      boy: { ms: 60 * MIN, kids: 8 },
    });
  });
});
