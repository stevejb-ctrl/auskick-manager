import { describe, expect, it } from "vitest";
import {
  atRiskCount,
  minBarText,
  minTimeState,
  minutesNeeded,
  pctOfGame,
  underMinText,
  type MinTimeInput,
} from "@/lib/live/minGameTime";

const MIN = 60_000;
// Four 12-minute quarters, a 50 % minimum, subs every 5 minutes.
const base: MinTimeInput = { playedMs: 0, gameMs: 48 * MIN, elapsedMs: 0, minPct: 50, soonMs: 5 * MIN };
const state = (over: Partial<MinTimeInput>) => minTimeState({ ...base, ...over });

describe("pctOfGame", () => {
  it("is the share of the game so far, rounded", () => {
    expect(pctOfGame(10 * MIN, 16 * MIN)).toBe(63);
    expect(pctOfGame(8 * MIN, 16 * MIN)).toBe(50);
  });
  it("is 0 before any time has gone, and never over 100", () => {
    expect(pctOfGame(0, 0)).toBe(0);
    expect(pctOfGame(13 * MIN, 12 * MIN)).toBe(100);
  });
});

describe("minutesNeeded", () => {
  it("rounds up, with 1 for any time at all", () => {
    expect(minutesNeeded(0)).toBe(0);
    expect(minutesNeeded(1)).toBe(1);
    expect(minutesNeeded(5 * MIN)).toBe(5);
    expect(minutesNeeded(5 * MIN + 1)).toBe(6);
  });
});

describe("minTimeState — at risk", () => {
  it("flags nobody at the first bounce, bench kids included", () => {
    const s = state({ elapsedMs: 0, playedMs: 0 });
    expect(s.atRisk).toBe(false);
    expect(s.neededMs).toBe(24 * MIN);
    expect(s.pct).toBe(0);
  });

  it("flags nobody at the first bounce even at a 75% minimum", () => {
    expect(state({ minPct: 75 }).atRisk).toBe(false);
  });

  it("doesn't flag a kid who sat out the first quarter: raw 0% isn't at risk", () => {
    const s = state({ elapsedMs: 12 * MIN, playedMs: 0 });
    expect(s.pct).toBe(0);
    expect(s.atRisk).toBe(false);
  });

  it("exactly at the minimum is fine", () => {
    const s = state({ elapsedMs: 40 * MIN, playedMs: 24 * MIN });
    expect(s.neededMs).toBe(0);
    expect(s.neededMin).toBe(0);
    expect(s.atRisk).toBe(false);
    expect(s.canReach).toBe(true);
  });

  it("flags a kid once the time left, less what they need, is shorter than the wait to come on", () => {
    // 20 minutes left, needs 16: 4 minutes to spare, under the 5-minute wait.
    const s = state({ elapsedMs: 28 * MIN, playedMs: 8 * MIN });
    expect(s.neededMin).toBe(16);
    expect(s.atRisk).toBe(true);
    expect(s.canReach).toBe(true);
  });

  it("the boundary: spare time equal to the wait is still fine", () => {
    // 20 left, needs 15: exactly 5 to spare.
    expect(state({ elapsedMs: 28 * MIN, playedMs: 9 * MIN }).atRisk).toBe(false);
    expect(state({ elapsedMs: 28 * MIN, playedMs: 9 * MIN - 1 }).atRisk).toBe(true);
  });

  it("the last quarter: a kid who needs 3 minutes with 4 left is at risk", () => {
    const s = state({ elapsedMs: 44 * MIN, playedMs: 21 * MIN });
    expect(s.neededMin).toBe(3);
    expect(s.atRisk).toBe(true);
    expect(s.canReach).toBe(true);
  });

  it("the last quarter: past reaching it, still flagged, and says so", () => {
    const s = state({ elapsedMs: 44 * MIN, playedMs: 18 * MIN });
    expect(s.neededMin).toBe(6);
    expect(s.canReach).toBe(false);
    expect(s.atRisk).toBe(true);
  });

  it("at full time nothing is left to play: flagged if short, not if there", () => {
    expect(state({ elapsedMs: 48 * MIN, playedMs: 20 * MIN }).atRisk).toBe(true);
    expect(state({ elapsedMs: 48 * MIN, playedMs: 30 * MIN }).atRisk).toBe(false);
  });

  it("holds a lent kid to the time they could play", () => {
    // Lent for the first half (24 min away), played 6 of the third quarter;
    // 12 minutes left. Their minimum is 12 of the 24 they could play: 6
    // more, 6 to spare. Held to the whole game they'd need 18 and be flagged.
    const lent = state({ elapsedMs: 36 * MIN, playedMs: 6 * MIN, awayMs: 24 * MIN });
    expect(lent.neededMin).toBe(6);
    expect(lent.atRisk).toBe(false);
    expect(state({ elapsedMs: 36 * MIN, playedMs: 6 * MIN }).atRisk).toBe(true);
  });

  it("doesn't flag a kid who is hurt or lent right now", () => {
    const s = state({ elapsedMs: 44 * MIN, playedMs: 18 * MIN, out: true });
    expect(s.atRisk).toBe(false);
    expect(s.neededMin).toBe(6);
  });

  it("a kid away the whole game has nothing to reach", () => {
    expect(state({ elapsedMs: 30 * MIN, awayMs: 48 * MIN }).atRisk).toBe(false);
  });

  it("no minimum, no flags", () => {
    const s = state({ minPct: 0, elapsedMs: 44 * MIN });
    expect(s.atRisk).toBe(false);
    expect(s.neededMs).toBe(0);
  });

  it("where subs wait for the break the wait is longer, so the flag comes earlier", () => {
    // Rugby halves of 30: 10 minutes into the second half, needs 18 of 20 left.
    const rugby: MinTimeInput = { playedMs: 12 * MIN, gameMs: 60 * MIN, elapsedMs: 40 * MIN, minPct: 50, soonMs: 2 * MIN };
    expect(minTimeState(rugby).atRisk).toBe(false);
    expect(minTimeState({ ...rugby, soonMs: 20 * MIN }).atRisk).toBe(true);
  });
});

describe("text", () => {
  it("counts the kids at risk for the info line", () => {
    const states = [
      state({ elapsedMs: 44 * MIN, playedMs: 21 * MIN }),
      state({ elapsedMs: 44 * MIN, playedMs: 30 * MIN }),
      state({ elapsedMs: 44 * MIN, playedMs: 18 * MIN }),
      state({ elapsedMs: 44 * MIN, playedMs: 18 * MIN, out: true }),
    ];
    expect(atRiskCount(states)).toBe(2);
    expect(underMinText(atRiskCount(states), 50)).toBe("2 under 50%");
    expect(underMinText(0, 50)).toBeNull();
  });

  it("gives the kid bar's line", () => {
    expect(minBarText(state({ elapsedMs: 16 * MIN, playedMs: 10 * MIN }))).toBe("63% of game · min 50%");
  });
});
