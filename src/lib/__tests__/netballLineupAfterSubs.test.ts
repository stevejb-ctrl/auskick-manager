// Netball's live court is the quarter's starting lineup with its
// mid-quarter subs applied: one source of truth, so it can be rebuilt
// after a reload and a cancelled replacement can't leave a ghost.

import { describe, expect, it } from "vitest";
import { lineupAfterSubs } from "@/lib/sports/netball/fairness";

const start = { positions: { gs: ["a"], ga: ["b"], gk: ["c"] }, bench: ["x", "y"] };

describe("lineupAfterSubs", () => {
  it("no subs: the starting lineup", () => {
    expect(lineupAfterSubs(start, [])).toEqual(start);
  });

  it("an injured GS is vacated to the bench, then the replacement fills GS", () => {
    const vacated = lineupAfterSubs(start, [{ positionId: "gs", outPlayerId: "a", inPlayerId: null, atMs: 60_000 }]);
    expect(vacated.positions.gs).toEqual([]);
    expect(vacated.bench).toEqual(["x", "y", "a"]);
    const filled = lineupAfterSubs(start, [
      { positionId: "gs", outPlayerId: "a", inPlayerId: null, atMs: 60_000 },
      { positionId: "gs", outPlayerId: null, inPlayerId: "x", atMs: 65_000 },
    ]);
    expect(filled.positions.gs).toEqual(["x"]);
    expect(filled.bench).toEqual(["y", "a"]);
  });

  it("a move to an empty position (vacate + fill at once)", () => {
    const moved = lineupAfterSubs(start, [
      { positionId: "gs", outPlayerId: "a", inPlayerId: null, atMs: 0 },
      { positionId: "gk", outPlayerId: "c", inPlayerId: null, atMs: 10 },
      { positionId: "gk", outPlayerId: null, inPlayerId: "a", atMs: 10 },
    ]);
    expect(moved.positions).toEqual({ gs: [], ga: ["b"], gk: ["a"] });
    expect(moved.bench).toEqual(["x", "y", "c"]);
  });
});
