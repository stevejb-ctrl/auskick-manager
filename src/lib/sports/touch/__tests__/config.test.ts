// Touch football's own rules (.planning/FOUR-SPORTS-PLAN.md, the plan's
// recommended defaults taken 22 Oct 2026): 5 a side on a half field to
// U10, 6 a side from U11, lanes, and TFA's mixed rule.

import { describe, expect, it } from "vitest";
import { getAgeGroupConfig, getSportConfig, isSoccer, isTouch } from "@/lib/sports";
import { TOUCH_AGE_GROUPS, TOUCH_MIXED_RULE } from "@/lib/sports/touch";
import type { TouchAgeGroupConfig } from "@/lib/sports/touch/types";

const age = (id: string) => getAgeGroupConfig("touch", id) as TouchAgeGroupConfig;

describe("touch football", () => {
  it("runs on the touch family's engine", () => {
    expect(isTouch("touch")).toBe(true);
    expect(isSoccer("touch")).toBe(false);
    expect(getSportConfig("touch")).toMatchObject({
      id: "touch",
      family: "touch",
      name: "Touch football",
      shortName: "Touch",
      teamSong: false,
    });
  });

  it("scores a try as 1, for both sides, and has no girl's try", () => {
    expect(getSportConfig("touch").scoreTypes.map((t) => [t.id, t.points])).toEqual([
      ["try", 1],
      ["opponent_try", 1],
    ]);
    for (const ag of TOUCH_AGE_GROUPS) expect(ag.girlsTryDouble, ag.id).toBe(false);
  });

  it("plays 5 a side to U10 and 6 a side from U11, down to 4, squads of 14", () => {
    expect(age("U10")).toMatchObject({ defaultOnFieldSize: 5, periodSeconds: 900 });
    expect(age("U11")).toMatchObject({ defaultOnFieldSize: 6, periodSeconds: 1200 });
    for (const ag of TOUCH_AGE_GROUPS) {
      expect(ag.minOnFieldSize, ag.id).toBe(4);
      expect(ag.maxSquadSize, ag.id).toBe(14);
    }
  });

  it("has lanes that fill every size each age plays", () => {
    for (const ag of TOUCH_AGE_GROUPS) {
      for (let n = ag.minOnFieldSize; n <= ag.maxOnFieldSize; n++) {
        const shapes = ag.shapes[n];
        expect(shapes?.length, `${ag.id} at ${n}`).toBeGreaterThan(0);
        for (const s of shapes) {
          const { middle, link, wing, field } = s.lines;
          expect(middle + link + wing + field, `${ag.id} ${s.id}`).toBe(n);
        }
      }
    }
    expect(age("U11").shapes[6][0].lines).toEqual({ middle: 2, link: 2, wing: 2, field: 0 });
  });

  it("plays minutes only to U9 and rotates positions from U10", () => {
    expect(age("U9").suggestedStrategy).toBe("minutes");
    expect(age("U10").suggestedStrategy).toBe("rotate-positions");
  });

  it("keeps TFA's mixed rule: at most 3 boys, at least 1 boy and 1 girl", () => {
    expect(TOUCH_MIXED_RULE).toEqual({ maxBoys: 3, minGirls: 1, minBoys: 1 });
    for (const ag of TOUCH_AGE_GROUPS) expect(ag.mixedPreset, ag.id).toEqual(TOUCH_MIXED_RULE);
  });

  it("keeps no score to U9 and keeps it from U10", () => {
    expect(age("U9").tracksScoreDefault).toBe(false);
    expect(age("U10").tracksScoreDefault).toBe(true);
  });
});
