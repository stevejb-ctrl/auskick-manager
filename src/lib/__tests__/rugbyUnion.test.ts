// Junior rugby union (rugby union plan, phase 2). Union runs on the
// rugby engine with its own rules: Rugby Australia's national pathway
// sizes and halves by default, its own points, none of league's junior
// laws (no vests, kick rotations or unbroken-period rule), and the
// main Siren brand rather than a site of its own.

import { describe, expect, it } from "vitest";
import {
  ALL_SPORT_IDS,
  aflSport,
  getBrandForHost,
  getSportByBrand,
  getSportConfig,
  isRugby,
  periodLabels,
  rugbyUnionSport,
} from "@/lib/sports";
import { rugbyPoints } from "@/lib/sports/rugby_league/fairness";
import type { RugbyAgeGroupConfig } from "@/lib/sports/types";

const ages = rugbyUnionSport.ageGroups as RugbyAgeGroupConfig[];
const byId = (id: string) => ages.find((a) => a.id === id)!;
const ALL = ["U6", "U7", "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18"];

// Age: [default players, min, max, minutes a half] — the national
// pathway's sizes by default, the range other states play.
const PATHWAY: Record<string, [number, number, number, number]> = {
  U6: [7, 5, 7, 10],
  U7: [7, 6, 7, 15],
  U8: [7, 6, 7, 15],
  U9: [10, 7, 10, 20],
  U10: [12, 10, 15, 20],
  U11: [12, 10, 15, 20],
  U12: [15, 12, 15, 25],
  U13: [15, 12, 15, 25],
  U14: [15, 12, 15, 25],
  U15: [15, 12, 15, 30],
  U16: [15, 12, 15, 30],
  U17: [15, 12, 15, 35],
  U18: [15, 12, 15, 35],
};

describe("rugby union sport config", () => {
  it("is a sport of its own on the rugby engine", () => {
    expect(ALL_SPORT_IDS).toContain("rugby_union");
    expect(getSportConfig("rugby_union")).toBe(rugbyUnionSport);
    expect(isRugby("rugby_union")).toBe(true);
    expect(rugbyUnionSport.family).toBe("rugby");
    expect(rugbyUnionSport.shortName).toBe("Rugby Union");
    expect(rugbyUnionSport.jerseyNumbers).toBe(true);
    expect(rugbyUnionSport.teamSong).toBe(false);
  });

  it("plays U6 to U18 in halves, at the pathway's sizes and lengths", () => {
    expect(ages.map((a) => a.id)).toEqual(ALL);
    for (const [id, [players, min, max, minutes]] of Object.entries(PATHWAY)) {
      const ag = byId(id);
      expect([ag.defaultOnFieldSize, ag.minOnFieldSize, ag.maxOnFieldSize], id).toEqual([players, min, max]);
      expect(ag.periodCount, id).toBe(2);
      expect(ag.periodSeconds, id).toBe(minutes * 60);
      expect(periodLabels("rugby_union", ag), id).toEqual({ label: "half", plural: "halves" });
      expect(ag.maxSquadSize, id).toBeGreaterThan(ag.maxOnFieldSize);
    }
  });

  it("keeps no score by default to U11, then scores from U12", () => {
    for (const id of ["U6", "U7", "U8", "U9", "U10", "U11"]) expect(byId(id).tracksScoreDefault, id).toBe(false);
    for (const id of ["U12", "U13", "U15", "U18"]) expect(byId(id).tracksScoreDefault, id).toBe(true);
  });

  it("plays none of league's junior laws: no vests, kick rotations or unbroken periods", () => {
    for (const ag of ages) {
      expect(ag.vestRequirements, ag.id).toBeUndefined();
      expect(ag.kickRotations, ag.id).toBe(false);
      expect(ag.unbrokenPeriods, ag.id).toBe(false);
      expect(ag.minUnbrokenPeriods, ag.id).toBe(0);
      expect(ag.internationalLaws, ag.id).toBeUndefined();
    }
  });

  it("is tag with no kicking at U6–U7, kicks from U8 and kicks for goal from U10", () => {
    for (const id of ["U6", "U7"]) expect(byId(id).kickingAllowed, id).toBe(false);
    for (const id of ["U8", "U9", "U10", "U18"]) expect(byId(id).kickingAllowed, id).toBe(true);
    for (const id of ["U6", "U7", "U8", "U9"]) expect(byId(id).goalsFromPlay, id).toBe(false);
    for (const id of ["U10", "U11", "U12", "U18"]) expect(byId(id).goalsFromPlay, id).toBe(true);
  });

  it("suggests both lines to U9, preferred line at U10–U11, named positions from U12", () => {
    for (const id of ["U6", "U7", "U8", "U9"]) expect(byId(id).recommendedStrategy, id).toBe("both-lines");
    for (const id of ["U10", "U11"]) expect(byId(id).recommendedStrategy, id).toBe("preferred-line");
    for (const id of ["U12", "U13", "U18"]) expect(byId(id).recommendedStrategy, id).toBe("named-positions");
  });

  it("splits its default side into forwards and backs (Hunter's by-laws from 10 a side)", () => {
    expect(byId("U8").forwardCount).toBe(3); // 7: 3 / 4
    expect(byId("U9").forwardCount).toBe(5); // 10: 5 / 5
    expect(byId("U10").forwardCount).toBe(6); // 12: 6 / 6
    expect(byId("U12").forwardCount).toBe(8); // 15: 8 / 7
  });

  it("scores try 5, conversion 2, penalty goal 3, drop goal 3", () => {
    expect(rugbyPoints("rugby_union")).toEqual({ try: 5, conversion: 2, penaltyGoal: 3, fieldGoal: 3 });
    const dropGoal = rugbyUnionSport.scoreTypes.find((t) => t.id === "field_goal")!;
    expect([dropGoal.label, dropGoal.shortLabel]).toEqual(["Drop goal", "DG"]);
    expect(rugbyUnionSport.scoreTypes.filter((t) => t.opponent).map((t) => t.id).sort()).toEqual([
      "opponent_conversion",
      "opponent_field_goal",
      "opponent_penalty_goal",
      "opponent_try",
    ]);
  });

  it("lives under the main Siren brand: no site of its own", () => {
    expect(rugbyUnionSport.brand.name).toBe("Siren");
    expect(rugbyUnionSport.brand.host).toBe(aflSport.brand.host);
    for (const host of ["sirenfooty.com.au", "www.sirenfooty.com.au", "sirennetball.com.au", "sirenleague.com.au", "localhost:3000"]) {
      expect(getBrandForHost(host).id, host).not.toBe("rugby_union");
    }
    expect(getSportByBrand("rugby_union").id).not.toBe("rugby_union");
  });
});

describe("rugby union validateLineup", () => {
  const lineup = (forwards: number, backs: number, bench = 2) => {
    const ids = Array.from({ length: forwards + backs + bench }, (_, i) => `p${i}`);
    return {
      forwards: ids.slice(0, forwards),
      backs: ids.slice(forwards, forwards + backs),
      bench: ids.slice(forwards + backs),
    };
  };

  it("takes every size in each age's range", () => {
    for (const ag of ages) {
      for (let n = ag.minOnFieldSize; n <= ag.maxOnFieldSize; n++) {
        const f = Math.floor(n / 2);
        const result = rugbyUnionSport.validateLineup!(lineup(f, n - f), ag, n);
        expect(result.ok, `${ag.id} at ${n}`).toBe(true);
        expect(result.issues, `${ag.id} at ${n}`).toEqual([]);
      }
    }
  });

  it("refuses one over the age's most, warns one under its fewest", () => {
    for (const ag of ages) {
      const over = rugbyUnionSport.validateLineup!(lineup(ag.maxOnFieldSize, 1), ag);
      expect(over.ok, ag.id).toBe(false);
      const under = rugbyUnionSport.validateLineup!(lineup(ag.minOnFieldSize - 1, 0), ag);
      expect(under.ok, ag.id).toBe(true);
      expect(under.issues.map((i) => i.kind), ag.id).toEqual(["warn"]);
    }
  });

  it("refuses a kid in two places", () => {
    const ag = byId("U12");
    const l = lineup(8, 7);
    l.bench.push(l.forwards[0]);
    expect(rugbyUnionSport.validateLineup!(l, ag).ok).toBe(false);
  });
});
