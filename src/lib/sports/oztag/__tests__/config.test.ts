// Oztag's own rules (.planning/FOUR-SPORTS-PLAN.md, the plan's
// recommended defaults taken 22 Oct 2026): 6 a side to U8, 8 a side from
// U9, 2 × 15, minutes only, and ITF's mixed rule with a girl's try of 2.

import { describe, expect, it } from "vitest";
import { getAgeGroupConfig, getSportConfig, isTouch } from "@/lib/sports";
import { OZTAG_AGE_GROUPS, OZTAG_MIXED_RULE } from "@/lib/sports/oztag";
import type { TouchAgeGroupConfig } from "@/lib/sports/touch/types";

const age = (id: string) => getAgeGroupConfig("oztag", id) as TouchAgeGroupConfig;

describe("Oztag", () => {
  it("shares the touch family's engine as a sport of its own", () => {
    expect(isTouch("oztag")).toBe(true);
    expect(getSportConfig("oztag")).toMatchObject({ id: "oztag", family: "touch", name: "Oztag", teamSong: false });
  });

  it("scores a try as 1 and a girl's try as 2, for both sides", () => {
    expect(getSportConfig("oztag").scoreTypes.map((t) => [t.id, t.points, t.opponent ?? false])).toEqual([
      ["try", 1, false],
      ["girls_try", 2, false],
      ["opponent_try", 1, true],
      ["opponent_girls_try", 2, true],
    ]);
  });

  it("plays 6 a side to U8 and 8 a side from U9, from 5, in 2 × 15 halves", () => {
    expect(age("U8")).toMatchObject({ defaultOnFieldSize: 6, maxSquadSize: 14 });
    expect(age("U9")).toMatchObject({ defaultOnFieldSize: 8, maxSquadSize: 16 });
    for (const ag of OZTAG_AGE_GROUPS) {
      expect(ag.minOnFieldSize, ag.id).toBe(5);
      expect(ag).toMatchObject({ periodCount: 2, periodSeconds: 900, periodLabel: "half" });
    }
  });

  it("has lanes that fill every size each age plays", () => {
    for (const ag of OZTAG_AGE_GROUPS) {
      for (let n = ag.minOnFieldSize; n <= ag.maxOnFieldSize; n++) {
        const shapes = ag.shapes[n];
        expect(shapes?.length, `${ag.id} at ${n}`).toBeGreaterThan(0);
        for (const s of shapes) {
          const { middle, link, wing, field } = s.lines;
          expect(middle + link + wing + field, `${ag.id} ${s.id}`).toBe(n);
        }
      }
    }
  });

  it("plays minutes only at every age", () => {
    for (const ag of OZTAG_AGE_GROUPS) expect(ag.suggestedStrategy, ag.id).toBe("minutes");
  });

  it("keeps ITF's mixed rule (at most 4 boys, at least 1 girl), girl's try on", () => {
    expect(OZTAG_MIXED_RULE).toEqual({ maxBoys: 4, minGirls: 1, minBoys: 0 });
    for (const ag of OZTAG_AGE_GROUPS) {
      expect(ag.mixedPreset, ag.id).toEqual(OZTAG_MIXED_RULE);
      expect(ag.girlsTryDouble, ag.id).toBe(true);
    }
  });

  it("keeps no score to U9 and keeps it from U10", () => {
    expect(age("U9").tracksScoreDefault).toBe(false);
    expect(age("U10").tracksScoreDefault).toBe(true);
  });
});
