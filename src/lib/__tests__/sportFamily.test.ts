// Sports that share an engine belong to one family (rugby union plan,
// phase 1). Rugby league and, later, rugby union share the rugby engine
// (live game, replay, fairness), each with its own rules, so the code
// asks "is this rugby?" once, through isRugby(), instead of naming
// league.

import { describe, expect, it } from "vitest";
import { ALL_SPORTS, ALL_SPORT_IDS, RUGBY_SPORT_IDS, getSportConfig, isRugby } from "@/lib/sports";

describe("sport families", () => {
  it("rugby league is rugby; AFL and netball are their own", () => {
    expect(isRugby("rugby_league")).toBe(true);
    expect(isRugby("afl")).toBe(false);
    expect(isRugby("netball")).toBe(false);
    expect(getSportConfig("afl").family).toBe("afl");
    expect(getSportConfig("netball").family).toBe("netball");
    expect(getSportConfig("rugby_league").family).toBe("rugby");
  });

  it("RUGBY_SPORT_IDS lists exactly the sports whose config says rugby", () => {
    const rugby = ALL_SPORTS.filter((c) => c.family === "rugby").map((c) => c.id);
    expect([...RUGBY_SPORT_IDS].sort()).toEqual(rugby.sort());
    for (const id of ALL_SPORT_IDS) {
      expect(isRugby(id), id).toBe((RUGBY_SPORT_IDS as readonly string[]).includes(id));
    }
  });

  it("an unknown sport is an error, not 'not rugby'", () => {
    expect(() => isRugby("rugby_union" as never)).toThrow(/rugby_union/);
  });
});
