// An undone swap leaves no "just subbed" mark (Stagehand round 10):
// undoing one pair of a planned sub kept the kid back on the bench off
// for a rest, so the pair dropped out of the plan.

import { describe, expect, it } from "vitest";
import { createSwapRecency, isUndoSwap } from "@/lib/live/swapRecency";
import { replaySoccerGame } from "@/lib/sports/soccer/replay";
import { game, MIN, SEVEN } from "@/lib/sports/soccer/__tests__/soccerGame";

const stamps = () => ({ lastSubbedOnMs: {} as Record<string, number>, lastSubbedOffMs: {} as Record<string, number> });

describe("createSwapRecency", () => {
  it("puts both kids' stamps back for an undo of the swap just before", () => {
    const s = stamps();
    s.lastSubbedOnMs.m1 = 1 * MIN;
    const r = createSwapRecency();
    let settle = r.swap(s, "m1", "b1", false);
    s.lastSubbedOffMs.m1 = 5 * MIN;
    s.lastSubbedOnMs.b1 = 5 * MIN;
    settle();
    settle = r.swap(s, "b1", "m1", true);
    s.lastSubbedOffMs.b1 = 5 * MIN + 5_000;
    s.lastSubbedOnMs.m1 = 5 * MIN + 5_000;
    settle();
    expect(s.lastSubbedOnMs).toEqual({ m1: 1 * MIN });
    expect(s.lastSubbedOffMs).toEqual({});
  });

  it("leaves a swap straight back alone when it isn't an undo", () => {
    const s = stamps();
    const r = createSwapRecency();
    r.swap(s, "m1", "b1", false)();
    s.lastSubbedOffMs.m1 = 5 * MIN;
    r.swap(s, "b1", "m1", false)();
    expect(s.lastSubbedOffMs.m1).toBe(5 * MIN);
  });

  it("ignores an undo that isn't the reverse of the swap before", () => {
    const s = stamps();
    const r = createSwapRecency();
    r.swap(s, "m1", "b1", false)();
    s.lastSubbedOffMs.m1 = 5 * MIN;
    r.swap(s, "m2", "b2", true)();
    expect(s.lastSubbedOffMs.m1).toBe(5 * MIN);
  });

  it("reads the stored flag", () => {
    expect(isUndoSwap({ undo: true })).toBe(true);
    expect(isUndoSwap({ undo: "yes" })).toBe(false);
    expect(isUndoSwap(null)).toBe(false);
  });
});

describe("soccer replay: an undone pair", () => {
  it("gives the kid back on the bench no rest, and the kid back on no 'just on'", () => {
    const g = game();
    g.lineup(SEVEN);
    g.start(1);
    g.swap("m1", "b1", 5);
    g.add("swap", { off_player_id: "b1", on_player_id: "m1", elapsed_ms: 5 * MIN + 5_000, undo: true });
    const s = replaySoccerGame(g.events);
    expect(s.lineup?.bench).toContain("b1");
    expect(s.lastSubbedOffMs.b1).toBeUndefined();
    expect(s.lastSubbedOffMs.m1).toBeUndefined();
    expect(s.lastSubbedOnMs.b1).toBeUndefined();
  });
});
