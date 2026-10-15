// Rugby union's named positions (rugby union plan, phase 3): its own
// catalogue, numbered as on the jersey, never league's. The same words
// mean different spots in the two codes (union's locks are 4 and 5, the
// second row; league's lock is the 13 at the back of the scrum), so
// union's labels carry the number and its keys are its own.

import { describe, expect, it } from "vitest";
import { unionCatalogue, unionPlaybook } from "@/lib/sports/rugby_union/playbook";
import { leagueCatalogue } from "@/lib/sports/rugby_league/playbook";
import { effectivePolicy, getSportPlaybook } from "@/lib/playbook";
import { rugbyUnionSport } from "@/lib/sports";

const numbers = (size: number) =>
  unionCatalogue(size)
    .map((p) => Number(p.key.replace("ru-", "")))
    .sort((a, b) => a - b);
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe("union's position catalogue", () => {
  it("plays the positions Hunter's by-laws list at each size from 10 to 15", () => {
    expect(numbers(10)).toEqual([1, 2, 3, 4, 5, 9, 10, 12, 13, 15]);
    expect(numbers(11)).toEqual([1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 15]);
    expect(numbers(12)).toEqual([1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 15]);
    expect(numbers(13)).toEqual([1, 2, 3, 4, 5, 8, ...range(9, 15)]);
    expect(numbers(14)).toEqual([...range(1, 8), 9, 10, 11, 12, 13, 15]);
    expect(numbers(15)).toEqual(range(1, 15));
  });

  it("puts 1–8 in the forwards and 9–15 in the backs", () => {
    for (const p of unionCatalogue(15)) {
      const n = Number(p.key.replace("ru-", ""));
      expect(p.line, p.key).toBe(n <= 8 ? "forwards" : "backs");
    }
  });

  it("labels carry the jersey number, and union's keys are its own", () => {
    const full = unionCatalogue(15);
    const byNumber = Object.fromEntries(full.map((p) => [p.key, p]));
    expect(byNumber["ru-4"]).toMatchObject({ label: "LK4", name: "Lock" });
    expect(byNumber["ru-5"]).toMatchObject({ label: "LK5", name: "Lock" });
    expect(byNumber["ru-8"]).toMatchObject({ label: "N8", name: "Number 8" });
    expect(byNumber["ru-9"]).toMatchObject({ label: "HB9", name: "Halfback" });
    expect(byNumber["ru-10"]).toMatchObject({ label: "FE10", name: "Five-eighth" });
    expect(new Set(full.map((p) => p.label)).size).toBe(15);
    for (const p of full) expect(p.label.length, p.key).toBeLessThanOrEqual(4);
    const leagueKeys = new Set(leagueCatalogue(13, 6).map((p) => p.key));
    for (const p of full) expect(leagueKeys.has(p.key), p.key).toBe(false);
  });

  it("draws every position on the field once", () => {
    for (const size of range(10, 15)) {
      const spots = unionCatalogue(size).map((p) => `${p.x},${p.y}`);
      expect(new Set(spots).size, String(size)).toBe(size);
      for (const p of unionCatalogue(size)) {
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(1);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(1);
      }
    }
  });
});

describe("union's How we play", () => {
  it("is union's own playbook", () => {
    expect(getSportPlaybook("rugby_union")).toBe(unionPlaybook);
    expect(unionPlaybook.sport).toBe("rugby_union");
  });

  it("offers named positions from U10, from union's catalogue", () => {
    for (const id of ["U6", "U8", "U9"]) {
      const policy = effectivePolicy("rugby_union", id);
      expect(unionPlaybook.strategies(policy).map((s) => s.id), id).not.toContain("named-positions");
      expect(unionPlaybook.positionModel(policy, 10).kind, id).toBe("none");
    }
    const u12 = effectivePolicy("rugby_union", "U12");
    expect(unionPlaybook.strategies(u12).map((s) => s.id)).toContain("named-positions");
    const model = unionPlaybook.positionModel(u12, 15);
    expect(model.kind).toBe("catalogue");
    expect(model.defaults.map((p) => p.key)).toEqual(unionCatalogue(15).map((p) => p.key));
  });

  it("suggests each age's own strategy, one it offers", () => {
    for (const ag of rugbyUnionSport.ageGroups) {
      const policy = effectivePolicy("rugby_union", ag.id);
      expect(unionPlaybook.recommendedStrategy(policy), ag.id).toBe(ag.recommendedStrategy);
      expect(unionPlaybook.strategies(policy).map((s) => s.id), ag.id).toContain(ag.recommendedStrategy);
    }
  });

  it("locks no vest or unbroken-period law: just the 50% game-time floor", () => {
    for (const ag of rugbyUnionSport.ageGroups) {
      const policy = effectivePolicy("rugby_union", ag.id);
      expect(policy.vests, ag.id).toEqual({ fr: false, dh: false });
      expect(policy.minUnbrokenPeriods, ag.id).toBe(0);
      expect(policy.minGameTimePct, ag.id).toBe(50);
      expect(unionPlaybook.lawRules(policy, unionPlaybook.agePolicy(ag.id)), ag.id).toEqual([]);
    }
  });
});
