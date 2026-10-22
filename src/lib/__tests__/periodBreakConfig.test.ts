// The period break screen's config (docs/handoffs/siren-footy-break-
// redesign-HANDOFF.md, section 1): every sport states its zones, words,
// score line and low-time threshold, and the counts always come from the
// game, never a constant.

import { describe, expect, it } from "vitest";
import { ALL_SPORTS, getAgeGroupConfig } from "@/lib/sports";
import { breakConfigFor, breakName, periodName } from "@/lib/sports/break";

const keys = (sport: Parameters<typeof breakConfigFor>[0], ageGroup: string, onFieldSize: number) =>
  breakConfigFor(sport, getAgeGroupConfig(sport, ageGroup), { onFieldSize }).zones.map((z) => [z.key, z.slots]);

describe("every sport's break zones", () => {
  for (const sport of ALL_SPORTS) {
    it(`${sport.id}: fill the field at every size each age group plays`, () => {
      for (const ag of sport.ageGroups) {
        for (let size = ag.minOnFieldSize; size <= ag.maxOnFieldSize; size++) {
          const { zones } = breakConfigFor(sport.id, ag, { onFieldSize: size });
          const slots = zones.reduce((n, z) => n + z.slots, 0);
          const where = `${sport.id} ${ag.id} at ${size}`;
          // Netball's slots are bibs: a short side leaves a bib empty
          // rather than dropping it.
          expect(slots, where).toBe(sport.id === "netball" ? ag.positions.length : size);
          expect(new Set(zones.map((z) => z.key)).size, where).toBe(zones.length);
          for (const z of zones) {
            expect(z.slots, where).toBeGreaterThan(0);
            expect(z.label, where).toBe(z.label.toUpperCase());
            expect(["zone1", "zone2", "zone3", "zone4"], where).toContain(z.color);
            if (z.slotIds) expect(z.slotIds.length, where).toBe(z.slots);
            if (z.slotLabels) expect(z.slotLabels.length, where).toBe(z.slots);
          }
        }
      }
    });

    it(`${sport.id}: turns time orange 4 min under the average`, () => {
      expect(sport.periodBreak.lowTimeMs).toBe(4 * 60_000);
    });
  }

  it("AFL: forward, centre, back from the game's size", () => {
    expect(keys("afl", "U10", 12)).toEqual([["fwd", 4], ["mid", 4], ["back", 4]]);
    expect(keys("afl", "U10", 10)).toEqual([["fwd", 3], ["mid", 4], ["back", 3]]);
    const { zones } = breakConfigFor("afl", getAgeGroupConfig("afl", "U10"), { onFieldSize: 12 });
    expect(zones.map((z) => [z.label, z.short, z.color])).toEqual([
      ["FORWARD", "Fwd", "zone1"],
      ["CENTRE", "Centre", "zone2"],
      ["BACK", "Back", "zone3"],
    ]);
  });

  it("AFL: the staged lineup's shape wins over the even split", () => {
    const { zones } = breakConfigFor("afl", getAgeGroupConfig("afl", "U10"), {
      onFieldSize: 12,
      shape: { fwd: 3, mid: 5, back: 4 },
    });
    expect(zones.map((z) => z.slots)).toEqual([3, 5, 4]);
  });

  it("soccer: 9 a side is attack 2, midfield 3, defence 3, keeper 1", () => {
    expect(keys("soccer", "U10", 9)).toEqual([["att", 2], ["mid", 3], ["def", 3], ["gk", 1]]);
  });

  it("soccer: 4 a side has no lines and no keeper", () => {
    expect(keys("soccer", "U6", 4)).toEqual([["field", 4]]);
  });

  it("netball: thirds of bibs, the bib on the slot", () => {
    const { zones } = breakConfigFor("netball", getAgeGroupConfig("netball", "11u"), { onFieldSize: 7 });
    expect(zones.map((z) => [z.key, z.slotLabels])).toEqual([
      ["attack", ["GS", "GA"]],
      ["centre", ["WA", "C", "WD"]],
      ["defence", ["GD", "GK"]],
    ]);
    expect(zones[0].slotIds).toEqual(["gs", "ga"]);
  });

  it("netball: Set shows only the bibs it plays", () => {
    const { zones } = breakConfigFor("netball", getAgeGroupConfig("netball", "set"), { onFieldSize: 5 });
    expect(zones.map((z) => z.slotLabels)).toEqual([["GS", "GA"], ["C"], ["GD", "GK"]]);
  });

  it("rugby: forwards over backs", () => {
    expect(keys("rugby_league", "U10", 11).map(([k]) => k)).toEqual(["forwards", "backs"]);
  });

  it("only netball hides jumper numbers", () => {
    for (const sport of ALL_SPORTS) {
      const cfg = breakConfigFor(sport.id, sport.ageGroups[0], { onFieldSize: sport.ageGroups[0].defaultOnFieldSize });
      expect(cfg.showJumperNumbers, sport.id).toBe(sport.id !== "netball");
    }
  });
});

describe("break words", () => {
  it("names periods and breaks by the sport's period", () => {
    expect(periodName("quarter", 3)).toBe("Q3");
    expect(breakName("quarter", 2)).toBe("Q2 break");
    expect(periodName("half", 2)).toBe("2nd half");
    expect(breakName("half", 1)).toBe("Half-time");
    expect(periodName("half", 1)).toBe("1st half");
  });

  it("follows the age group: league quarters at U8, halves at U10", () => {
    const u8 = breakConfigFor("rugby_league", getAgeGroupConfig("rugby_league", "U8"), { onFieldSize: 9 });
    const u10 = breakConfigFor("rugby_league", getAgeGroupConfig("rugby_league", "U10"), { onFieldSize: 11 });
    expect([u8.periodName(3), u8.breakName(2)]).toEqual(["Q3", "Q2 break"]);
    expect([u10.periodName(2), u10.breakName(1)]).toEqual(["2nd half", "Half-time"]);
  });

  it("soccer says 2nd half; AFL and netball say Q3", () => {
    const soccer = breakConfigFor("soccer", getAgeGroupConfig("soccer", "U10"), { onFieldSize: 9 });
    expect([soccer.periodName(2), soccer.breakName(1)]).toEqual(["2nd half", "Half-time"]);
    for (const sport of ["afl", "netball"] as const) {
      const ag = getAgeGroupConfig(sport, sport === "afl" ? "U10" : "11u");
      const cfg = breakConfigFor(sport, ag, { onFieldSize: ag.defaultOnFieldSize });
      expect([cfg.periodName(3), cfg.breakName(2)], sport).toEqual(["Q3", "Q2 break"]);
    }
  });
});

describe("break score line", () => {
  it("AFL: points, then goals.behinds each side", () => {
    const cfg = breakConfigFor("afl", getAgeGroupConfig("afl", "U10"), { onFieldSize: 12 });
    expect(cfg.formatScore({ us: { goal: 2, behind: 0 }, them: {} })).toEqual({
      main: "12 – 0",
      detail: "2.0 v 0.0",
      margin: 12,
    });
    expect(cfg.formatScore({ us: { goal: 1, behind: 2 }, them: { goal: 2, behind: 1 } }).margin).toBe(-5);
  });

  it("soccer and netball: goals", () => {
    for (const [sport, ag] of [["soccer", "U12"], ["netball", "11u"]] as const) {
      const cfg = breakConfigFor(sport, getAgeGroupConfig(sport, ag), { onFieldSize: 7 });
      expect(cfg.formatScore({ us: { goal: 2 }, them: { goal: 1 } }), sport).toEqual({
        main: "2 – 1",
        detail: "Goals",
        margin: 1,
      });
    }
  });

  it("basketball: points from every basket", () => {
    const cfg = breakConfigFor("basketball", getAgeGroupConfig("basketball", "U12"), { onFieldSize: 5 });
    const line = cfg.formatScore({
      us: { free_throw: 1, two_pointer: 3, three_pointer: 1 },
      them: { two_pointer: 2 },
    });
    expect(line).toEqual({ main: "10 – 4", detail: "Points", margin: 6 });
    // A live state that keeps points hands them over as they are.
    expect(cfg.formatScore({ us: {}, them: {}, points: { us: 23, them: 30 } })).toEqual({
      main: "23 – 30",
      detail: "Points",
      margin: -7,
    });
  });
});
