// Sports that share an engine belong to one family (rugby union plan,
// phase 1). Rugby league and, later, rugby union share the rugby engine
// (live game, replay, fairness), each with its own rules, so the code
// asks "is this rugby?" once, through isRugby(), instead of naming
// league. Football (soccer) is a family of its own (soccer plan, 17 Oct
// 2026), asked through isSoccer().

import { describe, expect, it } from "vitest";
import {
  ALL_SPORTS,
  ALL_SPORT_IDS,
  RUGBY_SPORT_IDS,
  SOCCER_SPORT_IDS,
  getSportConfig,
  isRugby,
  isSoccer,
} from "@/lib/sports";

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
    expect(() => isRugby("touch_football" as never)).toThrow(/touch_football/);
  });

  it("soccer is its own family: not rugby, not AFL", () => {
    expect(getSportConfig("soccer").family).toBe("soccer");
    expect(isSoccer("soccer")).toBe(true);
    expect(isRugby("soccer")).toBe(false);
    for (const id of ["afl", "netball", "rugby_league", "rugby_union"] as const) {
      expect(isSoccer(id), id).toBe(false);
    }
  });

  it("SOCCER_SPORT_IDS lists exactly the sports whose config says soccer", () => {
    const soccer = ALL_SPORTS.filter((c) => c.family === "soccer").map((c) => c.id);
    expect([...SOCCER_SPORT_IDS].sort()).toEqual(soccer.sort());
    for (const id of ALL_SPORT_IDS) {
      expect(isSoccer(id), id).toBe((SOCCER_SPORT_IDS as readonly string[]).includes(id));
    }
  });

  it("an unknown sport is an error, not 'not soccer'", () => {
    expect(() => isSoccer("touch_football" as never)).toThrow(/touch_football/);
  });
});
