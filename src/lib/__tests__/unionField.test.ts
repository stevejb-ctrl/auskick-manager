// Union's field (rugby union plan, phase 3). League's hand-made
// formations top out at 13, so a 15-a-side union side (U12 and up)
// would hide two kids. Union states its forwards / backs at each size
// (Hunter's by-laws from 10 a side) and its field is drawn for any size
// it plays, 5 to 15.

import { describe, expect, it } from "vitest";
import { rugbyForwards } from "@/lib/sports/rugby/lines";
import { getFieldSlots, unionFieldSlots } from "@/lib/sports/rugby_league/fieldFormation";
import { getAgeGroupConfig, rugbyUnionSport } from "@/lib/sports";

describe("forwards at each size", () => {
  it("union: Hunter's split from 10 a side, and its small sides", () => {
    const u10 = getAgeGroupConfig("rugby_union", "U10");
    const u12 = getAgeGroupConfig("rugby_union", "U12");
    expect([10, 11, 12, 13, 14, 15].map((n) => rugbyForwards(n <= 12 ? u10 : u12, n))).toEqual([5, 5, 6, 6, 8, 8]);
    const u6 = getAgeGroupConfig("rugby_union", "U6");
    expect([5, 6, 7].map((n) => rugbyForwards(u6, n))).toEqual([2, 3, 3]);
    const u9 = getAgeGroupConfig("rugby_union", "U9");
    expect([7, 8, 9, 10].map((n) => rugbyForwards(u9, n))).toEqual([3, 4, 4, 5]);
  });

  it("states a split for every size each union age plays", () => {
    for (const ag of rugbyUnionSport.ageGroups) {
      for (let n = ag.minOnFieldSize; n <= ag.maxOnFieldSize; n++) {
        expect(ag.forwardsBySize?.[n], `${ag.id} at ${n}`).toBeGreaterThan(0);
      }
      expect(rugbyForwards(ag, ag.defaultOnFieldSize), ag.id).toBe(ag.forwardCount);
    }
  });

  it("league keeps its one forward count at every size", () => {
    const u10 = getAgeGroupConfig("rugby_league", "U10");
    for (const n of [8, 9, 10, 11]) expect(rugbyForwards(u10, n)).toBe(5);
  });
});

describe("union's field", () => {
  const sizes = Array.from({ length: 11 }, (_, i) => i + 5);

  it("draws one spot per kid at every size from 5 to 15, a fullback last", () => {
    for (const n of sizes) {
      const forwards = rugbyForwards(getAgeGroupConfig("rugby_union", n <= 7 ? "U6" : n <= 10 ? "U9" : n <= 12 ? "U10" : "U12"), n);
      const slots = unionFieldSlots(n, forwards);
      expect(slots, String(n)).toHaveLength(n);
      expect(slots.filter((s) => s.role === "forward"), String(n)).toHaveLength(forwards);
      expect(slots.filter((s) => s.role === "fullback"), String(n)).toHaveLength(1);
      expect(slots.some((s) => s.role === "fr" || s.role === "dh"), String(n)).toBe(false);
      expect(new Set(slots.map((s) => s.id)).size, String(n)).toBe(n);
    }
  });

  it("with six backs, stands the fullback between the last two (12 a side: left wing, fullback, right wing)", () => {
    const slots = unionFieldSlots(12, 6);
    const backs = slots.filter((s) => s.role === "back");
    const fullback = slots.find((s) => s.role === "fullback")!;
    const rows = Array.from(new Set(backs.map((s) => s.y)));
    expect(rows).toHaveLength(2);
    expect(backs.filter((s) => s.y === rows[0]).map((s) => s.x)).toEqual([22, 50, 78]);
    expect(backs.filter((s) => s.y === rows[1]).map((s) => s.x)).toEqual([22, 78]);
    expect(fullback).toMatchObject({ x: 50, y: rows[1] });
  });

  it("keeps tiles apart and on the pitch", () => {
    for (const n of sizes) {
      const slots = unionFieldSlots(n, Math.floor(n / 2));
      for (const s of slots) {
        expect(s.x, `${n} ${s.id}`).toBeGreaterThanOrEqual(15);
        expect(s.x, `${n} ${s.id}`).toBeLessThanOrEqual(85);
        expect(s.y, `${n} ${s.id}`).toBeGreaterThanOrEqual(10);
        expect(s.y, `${n} ${s.id}`).toBeLessThanOrEqual(92);
      }
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const a = slots[i];
          const b = slots[j];
          // Tiles are 26% wide: side by side they need 26 apart, or a
          // row between them.
          const apart = Math.abs(a.x - b.x) >= 26 || Math.abs(a.y - b.y) >= 12;
          expect(apart, `${n}: ${a.id} / ${b.id}`).toBe(true);
        }
      }
    }
  });

  it("puts all fifteen on a 15-a-side field (league's tops out at 13)", () => {
    expect(getFieldSlots(15)).toHaveLength(13);
    expect(unionFieldSlots(15, 8)).toHaveLength(15);
  });
});
