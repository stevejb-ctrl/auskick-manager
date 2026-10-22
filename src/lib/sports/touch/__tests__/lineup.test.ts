// The touch family's lineup: lanes from the age group's shapes, no kid
// twice, and a mixed team's rule as errors.

import { describe, expect, it } from "vitest";
import { getAgeGroupConfig } from "@/lib/sports";
import { normalizeTouchLineup, touchLineOf, touchOnField, validateTouchLineup } from "@/lib/sports/touch/lineup";
import { touchAgeGroup, touchAgeGroupForTeam } from "@/lib/sports/touch/family";
import { TOUCH_MIXED_RULE } from "@/lib/sports/touch";
import { OZTAG_MIXED_RULE } from "@/lib/sports/oztag";
import { FIELD, LANES, groupOf } from "./touchGame";

const U11 = getAgeGroupConfig("touch", "U11");
const errors = (r: ReturnType<typeof validateTouchLineup>) => r.issues.filter((i) => i.kind === "error").map((i) => i.message);

describe("normalizeTouchLineup", () => {
  it("fills in every lane and drops what isn't a player id", () => {
    expect(normalizeTouchLineup({ lines: { middle: ["a", 3, ""] }, bench: ["b"] })).toEqual({
      lines: { middle: ["a"], link: [], wing: [], field: [] },
      bench: ["b"],
    });
    expect(touchOnField(LANES)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(touchLineOf(LANES, "e")).toBe("wing");
    expect(touchLineOf(LANES, "g")).toBeNull();
  });
});

describe("validateTouchLineup", () => {
  it("passes Minutes only and a 2-2-2 at six a side", () => {
    expect(validateTouchLineup(FIELD, U11, 6).ok).toBe(true);
    expect(validateTouchLineup(LANES, U11, 6).ok).toBe(true);
  });

  it("refuses lanes that aren't a shape the age plays, and lanes mixed with the field", () => {
    const lopsided = { ...LANES, lines: { middle: ["a", "b", "c"], link: ["d"], wing: ["e", "f"], field: [] } };
    expect(errors(validateTouchLineup(lopsided, U11, 6))).toEqual(["6 a side plays 2 middles, 2 links and 2 wings."]);
    const both = { ...LANES, lines: { ...LANES.lines, field: ["g"] }, bench: ["h"] };
    expect(errors(validateTouchLineup(both, U11, 6))).toContain("Kids play either in lanes or on the field, not both.");
  });

  it("refuses too many on the field and anyone twice; fewer is a warning", () => {
    const seven = { ...FIELD, lines: { ...FIELD.lines, field: [...FIELD.lines.field, "g"] }, bench: ["h"] };
    expect(errors(validateTouchLineup(seven, U11, 6))).toEqual(["Too many players on the field (7); this game plays 6."]);
    const twice = { ...FIELD, bench: ["a"] };
    expect(errors(validateTouchLineup(twice, U11, 6))).toEqual(["Player is in both the field and the bench."]);
    const five = { ...FIELD, lines: { ...FIELD.lines, field: ["a", "b", "c", "d", "e"] } };
    const r = validateTouchLineup(five, U11, 6);
    expect(r.ok).toBe(true);
    expect(r.issues[0]).toMatchObject({ kind: "warn" });
  });

  it("keeps a mixed team's rule: no more boys than the cap, the girls and boys it needs", () => {
    const mixed = { rule: TOUCH_MIXED_RULE, groupOf };
    // a b c are girls, d e f boys: 3 and 3.
    expect(validateTouchLineup(FIELD, U11, 6, mixed).ok).toBe(true);
    const fourBoys = { lines: { ...FIELD.lines, field: ["a", "b", "d", "e", "f", "h"] }, bench: ["c"] };
    expect(errors(validateTouchLineup(fourBoys, U11, 6, mixed))).toEqual([
      "Too many boys on the field (4); the mixed rule allows 3.",
    ]);
    const allGirls = { lines: { ...FIELD.lines, field: ["a", "b", "c", "g"] }, bench: [] };
    expect(errors(validateTouchLineup(allGirls, U11, 6, mixed))).toEqual([
      "The mixed rule needs at least 1 boy on the field.",
    ]);
    // Oztag needs no boy, but a girl.
    const oztag = touchAgeGroup("oztag", "U10");
    const eightBoys = {
      lines: { middle: [], link: [], wing: [], field: ["d", "e", "f", "h", "i"] },
      bench: [],
    };
    expect(errors(validateTouchLineup(eightBoys, oztag, 8, { rule: OZTAG_MIXED_RULE, groupOf }))).toEqual([
      "Too many boys on the field (5); the mixed rule allows 4.",
      "The mixed rule needs at least 1 girl on the field.",
    ]);
  });

  it("asks for a group for every kid on the field of a mixed team", () => {
    const r = validateTouchLineup(FIELD, U11, 6, { rule: TOUCH_MIXED_RULE, groupOf: (id) => (id === "a" ? null : groupOf(id)) });
    expect(r.ok).toBe(false);
    expect(r.issues.find((i) => i.playerId === "a")?.message).toBe("Mark Girl or Boy for every player on a mixed team.");
  });

  it("refuses another sport's age group", () => {
    expect(() => validateTouchLineup(FIELD, getAgeGroupConfig("basketball", "U10"), 5)).toThrow(/isn't a touch or Oztag/);
  });
});

describe("touchAgeGroupForTeam", () => {
  it("plays halves, or one continuous period of both halves' length", () => {
    expect(touchAgeGroupForTeam("touch", "U11", null)).toMatchObject({ periodCount: 2, periodSeconds: 1200 });
    expect(touchAgeGroupForTeam("touch", "U11", 1)).toMatchObject({ periodCount: 1, periodSeconds: 2400, periodLabel: "period" });
    // Each sport's own table: an Oztag U10 plays 8, a touch U10 5.
    expect(touchAgeGroup("oztag", "U10").defaultOnFieldSize).toBe(8);
    expect(touchAgeGroup("touch", "U10").defaultOnFieldSize).toBe(5);
    expect(() => touchAgeGroup("touch", "U19")).toThrow(/Unknown touch age group/);
  });
});
