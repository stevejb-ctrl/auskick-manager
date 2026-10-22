// Hockey's own rules (.planning/FOUR-SPORTS-PLAN.md, the plan's
// recommended defaults taken 22 Oct 2026): minis with no keeper, half
// fields with keeper turns, 11 a side in quarters from U13.

import { describe, expect, it } from "vitest";
import { getAgeGroupConfig, getSportConfig, isSoccer, periodLabels } from "@/lib/sports";
import { HOCKEY_AGE_GROUPS } from "@/lib/sports/hockey";
import type { SoccerAgeGroupConfig } from "@/lib/sports/soccer/types";

const age = (id: string) => getAgeGroupConfig("hockey", id) as SoccerAgeGroupConfig;

describe("hockey", () => {
  it("runs on the soccer family's engine as a sport of its own", () => {
    expect(isSoccer("hockey")).toBe(true);
    expect(getSportConfig("hockey")).toMatchObject({ id: "hockey", family: "soccer", name: "Hockey", teamSong: false });
  });

  it("plays U7 to U17", () => {
    expect(HOCKEY_AGE_GROUPS.map((a) => a.id)).toEqual([
      "U7", "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17",
    ]);
  });

  it("has a shape at every size each age plays, keeper included", () => {
    for (const ag of HOCKEY_AGE_GROUPS) {
      for (let n = ag.minOnFieldSize; n <= ag.maxOnFieldSize; n++) {
        const shapes = ag.formations[n];
        expect(shapes?.length, `${ag.id} at ${n}`).toBeGreaterThan(0);
        for (const f of shapes) {
          const { def, mid, att, field } = f.lines;
          expect(def + mid + att + field + (f.keeper ? 1 : 0), `${ag.id} ${f.id}`).toBe(n);
          expect(f.keeper, `${ag.id} ${f.id}`).toBe(ag.keeper !== "none");
        }
      }
    }
  });

  it("plays its minis 6 a side with no keeper and no lines", () => {
    for (const id of ["U7", "U8"]) {
      expect(age(id)).toMatchObject({ defaultOnFieldSize: 6, keeper: "none", periodCount: 2, periodSeconds: 900 });
      expect(age(id).formations[6].map((f) => f.id)).toEqual(["no-lines"]);
    }
  });

  it("has keeper turns from U9 to U12 and named keepers from U13", () => {
    expect(age("U9").keeper).toBe("turns");
    expect(age("U12").keeper).toBe("turns");
    expect(age("U13").keeper).toBe("keepers");
    expect(age("U17").keeper).toBe("keepers");
  });

  it("plays halves to U12 and 4 × 15 quarters from U13", () => {
    expect(age("U12")).toMatchObject({ periodCount: 2, periodSeconds: 1500 });
    expect(periodLabels("hockey", age("U12"))).toEqual({ label: "half", plural: "halves" });
    expect(age("U13")).toMatchObject({ periodCount: 4, periodSeconds: 900, defaultOnFieldSize: 11 });
    expect(periodLabels("hockey", age("U13"))).toEqual({ label: "quarter", plural: "quarters" });
  });

  it("keeps no score to U10 and keeps it from U11", () => {
    expect(age("U10").tracksScoreDefault).toBe(false);
    expect(age("U11").tracksScoreDefault).toBe(true);
  });
});
