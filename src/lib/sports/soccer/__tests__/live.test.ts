import { describe, expect, it } from "vitest";
import {
  benchInSoccerLineup,
  benchOutInSoccerLineup,
  placeInSoccerLineup,
  soccerSubDue,
  swapInSoccerLineup,
} from "@/lib/sports/soccer/live";
import type { SoccerLineup } from "@/lib/sports/soccer/lineup";

const MIN = 60_000;

describe("soccerSubDue — rolling", () => {
  const base = { mode: { kind: "rolling" } as const, subIntervalMs: 5 * MIN, periodMs: 20 * MIN };

  it("has no timer before the half starts", () => {
    expect(soccerSubDue({ ...base, anchorMs: null, elapsedMs: 0 }).msUntilDue).toBeNull();
  });

  it("counts down from the last planned sub and falls due at the interval", () => {
    const early = soccerSubDue({ ...base, anchorMs: 2 * MIN, elapsedMs: 4 * MIN });
    expect(early).toMatchObject({ due: false, msUntilDue: 3 * MIN, spanMs: 5 * MIN, key: 2 * MIN });
    expect(soccerSubDue({ ...base, anchorMs: 2 * MIN, elapsedMs: 7 * MIN }).due).toBe(true);
  });

  it("has no timer without an interval", () => {
    expect(soccerSubDue({ ...base, subIntervalMs: null, anchorMs: 0, elapsedMs: 9 * MIN }).due).toBe(false);
  });
});

describe("soccerSubDue — windows", () => {
  // Football Tasmania: three windows a half, none in the last 2 minutes.
  // A 20-minute half spreads them at 5, 10 and 15 minutes.
  const base = {
    mode: { kind: "windows", perHalf: 3, cutoffSeconds: 120 } as const,
    subIntervalMs: null,
    periodMs: 20 * MIN,
  };

  it("counts down to the first window and isn't due before it", () => {
    const s = soccerSubDue({ ...base, anchorMs: 0, elapsedMs: 3 * MIN });
    expect(s).toMatchObject({ due: false, msUntilDue: 2 * MIN, spanMs: 5 * MIN, key: null });
  });

  it("is due once a window opens and no sub has been made since", () => {
    expect(soccerSubDue({ ...base, anchorMs: 0, elapsedMs: 6 * MIN })).toMatchObject({ due: true, key: 5 * MIN });
  });

  it("isn't due again after the window's subs, until the next window", () => {
    const s = soccerSubDue({ ...base, anchorMs: 6 * MIN, elapsedMs: 8 * MIN });
    expect(s).toMatchObject({ due: false, msUntilDue: 2 * MIN });
    expect(soccerSubDue({ ...base, anchorMs: 6 * MIN, elapsedMs: 10 * MIN }).due).toBe(true);
  });

  it("has nothing left after the last window's subs", () => {
    expect(soccerSubDue({ ...base, anchorMs: 15.5 * MIN, elapsedMs: 19 * MIN })).toMatchObject({
      due: false,
      msUntilDue: null,
    });
  });
});

const lineup = (): SoccerLineup => ({
  keeper: "gk",
  lines: { def: ["d1", "d2"], mid: ["m1", "m2", "m3"], att: ["a1"], field: [] },
  bench: ["b1", "b2"],
});

describe("swapInSoccerLineup", () => {
  it("subs a bench kid on in the field kid's place", () => {
    const lu = swapInSoccerLineup(lineup(), "b1", "m2");
    expect(lu.lines.mid).toEqual(["m1", "b1", "m3"]);
    expect(lu.bench).toEqual(["m2", "b2"]);
  });

  it("swaps two field kids' spots, the keeper included", () => {
    const lu = swapInSoccerLineup(lineup(), "gk", "a1");
    expect(lu.keeper).toBe("a1");
    expect(lu.lines.att).toEqual(["gk"]);
  });

  it("leaves two bench kids, or a kid with themselves, alone", () => {
    const before = lineup();
    expect(swapInSoccerLineup(before, "b1", "b2")).toBe(before);
    expect(swapInSoccerLineup(before, "d1", "d1")).toBe(before);
  });

  it("doesn't change the lineup it was given", () => {
    const before = lineup();
    swapInSoccerLineup(before, "b1", "d1");
    expect(before).toEqual(lineup());
  });
});

describe("placeInSoccerLineup", () => {
  it("puts a bench kid at the end of a line", () => {
    const lu = placeInSoccerLineup(lineup(), "b2", "att");
    expect(lu.lines.att).toEqual(["a1", "b2"]);
    expect(lu.bench).toEqual(["b1"]);
  });

  it("moves a field kid into an empty goal", () => {
    const empty = { ...lineup(), keeper: null };
    const lu = placeInSoccerLineup(empty, "d2", "gk");
    expect(lu.keeper).toBe("d2");
    expect(lu.lines.def).toEqual(["d1"]);
  });

  it("won't put a second kid in goal", () => {
    const before = lineup();
    expect(placeInSoccerLineup(before, "b1", "gk")).toBe(before);
  });
});

describe("benching", () => {
  it("sends a field kid to the end of the bench", () => {
    const lu = benchInSoccerLineup(lineup(), "gk");
    expect(lu.keeper).toBeNull();
    expect(lu.bench).toEqual(["b1", "b2", "gk"]);
  });

  it("benches everyone who can't play, leaving their places empty", () => {
    const lu = benchOutInSoccerLineup(lineup(), new Set(["m1", "a1", "b1"]));
    expect(lu.lines.mid).toEqual(["m2", "m3"]);
    expect(lu.lines.att).toEqual([]);
    expect(lu.bench).toEqual(["b1", "b2", "m1", "a1"]);
  });
});
