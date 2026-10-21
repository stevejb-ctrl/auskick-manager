// Sports that share an engine belong to one family (rugby union plan,
// phase 1). Rugby league and, later, rugby union share the rugby engine
// (live game, replay, fairness), each with its own rules, so the code
// asks "is this rugby?" once, through isRugby(), instead of naming
// league. Football (soccer) is a family of its own (soccer plan, 17 Oct
// 2026), asked through isSoccer(); futsal and hockey join it, and touch
// football and Oztag share the touch family, asked through isTouch()
// (four-sports plan, 22 Oct 2026).

import { describe, expect, it } from "vitest";
import {
  ALL_SPORTS,
  ALL_SPORT_IDS,
  RUGBY_SPORT_IDS,
  SOCCER_SPORT_IDS,
  TOUCH_SPORT_IDS,
  getSportConfig,
  isRugby,
  isSoccer,
  isTouch,
} from "@/lib/sports";

// A sport Siren doesn't know.
const UNKNOWN = "quidditch" as never;

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
    expect(() => isRugby(UNKNOWN)).toThrow(/quidditch/);
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
    expect(() => isSoccer(UNKNOWN)).toThrow(/quidditch/);
  });

  it("futsal and hockey join soccer's family, each a sport of its own", () => {
    for (const id of ["futsal", "hockey"] as const) {
      expect(getSportConfig(id).family, id).toBe("soccer");
      expect(isSoccer(id), id).toBe(true);
      expect(isTouch(id), id).toBe(false);
    }
  });

  it("touch and Oztag are the touch family: not soccer, not rugby", () => {
    for (const id of ["touch", "oztag"] as const) {
      expect(getSportConfig(id).family, id).toBe("touch");
      expect(isTouch(id), id).toBe(true);
      expect(isSoccer(id), id).toBe(false);
      expect(isRugby(id), id).toBe(false);
    }
  });

  it("TOUCH_SPORT_IDS lists exactly the sports whose config says touch", () => {
    const touch = ALL_SPORTS.filter((c) => c.family === "touch").map((c) => c.id);
    expect([...TOUCH_SPORT_IDS].sort()).toEqual(touch.sort());
    for (const id of ALL_SPORT_IDS) {
      expect(isTouch(id), id).toBe((TOUCH_SPORT_IDS as readonly string[]).includes(id));
    }
  });

  it("an unknown sport is an error, not 'not touch'", () => {
    expect(() => isTouch(UNKNOWN)).toThrow(/quidditch/);
  });
});
