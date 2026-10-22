// Futsal's own rules (.planning/FOUR-SPORTS-PLAN.md, the plan's
// recommended defaults taken 22 Oct 2026): 5 a side with a keeper at
// every age, halves on a running clock, keeper turns to U11.

import { describe, expect, it } from "vitest";
import { getAgeGroupConfig, getSportConfig, isSoccer } from "@/lib/sports";
import { FUTSAL_AGE_GROUPS } from "@/lib/sports/futsal";
import type { SoccerAgeGroupConfig } from "@/lib/sports/soccer/types";

const age = (id: string) => getAgeGroupConfig("futsal", id) as SoccerAgeGroupConfig;

describe("futsal", () => {
  it("runs on the soccer family's engine as a sport of its own", () => {
    expect(isSoccer("futsal")).toBe(true);
    expect(getSportConfig("futsal")).toMatchObject({ id: "futsal", family: "soccer", name: "Futsal", teamSong: false });
  });

  it("plays U6 to U17", () => {
    expect(FUTSAL_AGE_GROUPS.map((a) => a.id)).toEqual([
      "U6", "U7", "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17",
    ]);
  });

  it("plays 5 a side with a keeper at every age, and can start with 3", () => {
    for (const ag of FUTSAL_AGE_GROUPS) {
      expect(ag.defaultOnFieldSize, ag.id).toBe(5);
      expect(ag.minOnFieldSize, ag.id).toBe(3);
      expect(ag.keeper, ag.id).not.toBe("none");
      expect(ag.maxSquadSize, ag.id).toBe(12);
    }
  });

  it("has a shape with a keeper at every size it plays, the 2-2 first at 5", () => {
    for (const ag of FUTSAL_AGE_GROUPS) {
      for (let n = ag.minOnFieldSize; n <= ag.maxOnFieldSize; n++) {
        for (const f of ag.formations[n]) {
          const { def, mid, att, field } = f.lines;
          expect(f.keeper, `${ag.id} ${f.id}`).toBe(true);
          expect(def + mid + att + field + 1, `${ag.id} ${f.id}`).toBe(n);
        }
      }
    }
    expect(age("U10").formations[5].map((f) => f.id)).toEqual(["2-2", "1-2-1", "3-1"]);
  });

  it("plays 2 × 15 to U9 and 2 × 20 from U10, on rolling subs", () => {
    expect(age("U9")).toMatchObject({ periodCount: 2, periodSeconds: 900, periodLabel: "half" });
    expect(age("U10")).toMatchObject({ periodCount: 2, periodSeconds: 1200, periodLabel: "half" });
    for (const ag of FUTSAL_AGE_GROUPS) expect(ag.subMode, ag.id).toEqual({ kind: "rolling" });
  });

  it("has keeper turns to U11 and named keepers from U12", () => {
    expect(age("U6").keeper).toBe("turns");
    expect(age("U11").keeper).toBe("turns");
    expect(age("U12").keeper).toBe("keepers");
  });

  it("keeps no score to U9 and keeps it from U10", () => {
    expect(age("U9").tracksScoreDefault).toBe(false);
    expect(age("U10").tracksScoreDefault).toBe(true);
  });
});
