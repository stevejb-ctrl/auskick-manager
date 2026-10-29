// Who goes in goal: "Everyone has a turn" (U8–U11) and "Keepers" (U12
// up), decided 17 Oct 2026.

import { describe, expect, it } from "vitest";
import { pickSoccerKeeper } from "@/lib/sports/soccer/keeper";

const KIDS = ["ava", "ben", "cal", "dee", "eli"];
const MIN = 60_000;

describe("pickSoccerKeeper: everyone has a turn", () => {
  const turns = (over: Partial<Parameters<typeof pickSoccerKeeper>[0]> = {}) =>
    pickSoccerKeeper({ strategy: "turns", candidates: KIDS, ...over });

  it("puts the kid with the fewest keeper minutes in goal", () => {
    expect(turns({ keeperMs: { ava: 40 * MIN, ben: 20 * MIN, cal: 10 * MIN, dee: 20 * MIN, eli: 30 * MIN } })).toBe("cal");
  });

  it("skips kids marked 'not in goal', however few their minutes", () => {
    expect(turns({ keeperMs: { ava: 40 * MIN, ben: 20 * MIN, dee: 20 * MIN, eli: 30 * MIN }, prefs: { notInGoal: ["cal"] } })).toBe("ben");
  });

  it("among equals: a keen keeper, then the least time this game, then squad order", () => {
    expect(turns()).toBe("ava");
    expect(turns({ prefs: { keenKeepers: ["dee"] } })).toBe("dee");
    // Keen is a tie-break, not a pass: fewer minutes still go first.
    expect(turns({ prefs: { keenKeepers: ["dee"] }, keeperMs: { dee: 20 * MIN } })).toBe("ava");
    // The keeper plays the whole half: the kid who sat out goes in.
    expect(turns({ gameMs: { ava: 20 * MIN, ben: 20 * MIN, cal: 10 * MIN, dee: 20 * MIN, eli: 20 * MIN } })).toBe("cal");
    expect(turns({ gameMs: { cal: 10 * MIN }, prefs: { keenKeepers: ["eli"] } })).toBe("eli");
  });

  it("sends last half's keeper to the field when anyone else can go in", () => {
    expect(turns({ lastKeeper: "ava" })).toBe("ben");
    // Only last half's keeper is willing: they stay in.
    expect(turns({ lastKeeper: "ava", prefs: { notInGoal: ["ben", "cal", "dee", "eli"] } })).toBe("ava");
  });

  it("suggests nobody when every kid here is 'not in goal' (the coach picks)", () => {
    expect(turns({ prefs: { notInGoal: KIDS } })).toBeNull();
    expect(turns({ candidates: [] })).toBeNull();
  });

  it("has no keeper at 4 a side", () => {
    expect(pickSoccerKeeper({ strategy: "none", candidates: KIDS })).toBeNull();
  });
});

describe("pickSoccerKeeper: named keepers", () => {
  const keepers = (over: Partial<Parameters<typeof pickSoccerKeeper>[0]> = {}) =>
    pickSoccerKeeper({ strategy: "keepers", candidates: KIDS, prefs: { namedKeepers: ["dee", "ben"] }, ...over });

  it("rotates among the named keepers only, the fewest keeper minutes first", () => {
    expect(keepers()).toBe("dee");
    expect(keepers({ keeperMs: { dee: 60 * MIN, ben: 30 * MIN, ava: 0 } })).toBe("ben");
  });

  it("moves on from last half's keeper to the next named one", () => {
    expect(keepers({ lastKeeper: "dee" })).toBe("ben");
    expect(keepers({ lastKeeper: "ben", keeperMs: { dee: 90 * MIN } })).toBe("dee");
  });

  it("keeps one named keeper in goal", () => {
    expect(keepers({ prefs: { namedKeepers: ["cal"] }, lastKeeper: "cal" })).toBe("cal");
  });

  it("keeps the kid in goal there when nobody is named yet (Stagehand round 7)", () => {
    // A new U13 hockey team: "Keepers", nobody marked. It moved on from
    // last quarter's keeper at every break.
    const none = (over: Partial<Parameters<typeof pickSoccerKeeper>[0]> = {}) =>
      pickSoccerKeeper({ strategy: "keepers", candidates: KIDS, prefs: {}, ...over });
    expect(none({ lastKeeper: "cal", keeperMs: { cal: 15 * MIN } })).toBe("cal");
    // Not one marked "not in goal", nor one who's gone.
    expect(none({ lastKeeper: "cal", prefs: { notInGoal: ["cal"] } })).not.toBe("cal");
    expect(none({ lastKeeper: "zed" })).toBe("ava");
  });

  it("skips a named keeper who isn't here, and gives everyone a turn when none is", () => {
    expect(keepers({ candidates: ["ava", "ben", "cal"] })).toBe("ben");
    expect(
      keepers({ candidates: ["ava", "cal", "eli"], keeperMs: { ava: 30 * MIN }, prefs: { namedKeepers: ["dee"], notInGoal: ["cal"] } }),
    ).toBe("eli");
  });
});
