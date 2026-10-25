// The mixed rule: the team's rule from its columns, how many boys and
// girls it fields, and the field shrinking when it runs short of girls.

import { describe, expect, it } from "vitest";
import {
  girlsTryCountsDouble,
  mixedFieldBreach,
  mixedFieldMessage,
  mixedFieldPlan,
  mixedRuleColumns,
  mixedRuleSummary,
  teamMixedRule,
} from "@/lib/sports/touch/mixed";
import { TOUCH_MIXED_RULE } from "@/lib/sports/touch";
import { OZTAG_MIXED_RULE } from "@/lib/sports/oztag";
import { touchAgeGroup } from "@/lib/sports/touch/family";

describe("teamMixedRule", () => {
  it("reads all three numbers, or none", () => {
    expect(teamMixedRule({ mixed_max_boys: 3, mixed_min_girls: 1, mixed_min_boys: 1 })).toEqual(TOUCH_MIXED_RULE);
    expect(teamMixedRule({ mixed_max_boys: 3, mixed_min_girls: null, mixed_min_boys: 1 })).toBeNull();
    expect(teamMixedRule(null)).toBeNull();
    expect(mixedRuleColumns(OZTAG_MIXED_RULE)).toEqual({ mixed_max_boys: 4, mixed_min_girls: 1, mixed_min_boys: 0 });
    expect(mixedRuleColumns(null)).toEqual({ mixed_max_boys: null, mixed_min_girls: null, mixed_min_boys: null });
  });

  it("counts a girl's try double on an Oztag mixed team unless the team turns it off", () => {
    const oztag = touchAgeGroup("oztag", "U10");
    expect(girlsTryCountsDouble(oztag, OZTAG_MIXED_RULE, null)).toBe(true);
    expect(girlsTryCountsDouble(oztag, OZTAG_MIXED_RULE, false)).toBe(false);
    expect(girlsTryCountsDouble(oztag, null, true)).toBe(false);
    expect(girlsTryCountsDouble(touchAgeGroup("touch", "U11"), TOUCH_MIXED_RULE, null)).toBe(false);
  });

  it("says the rule in words", () => {
    expect(mixedRuleSummary(TOUCH_MIXED_RULE)).toBe("At most 3 boys on the field, at least 1 girl and 1 boy.");
    expect(mixedRuleSummary(OZTAG_MIXED_RULE)).toBe("At most 4 boys on the field, at least 1 girl.");
  });
});

describe("mixedFieldPlan", () => {
  it("fields the cap of boys when that evens each group's share best (8 boys, 4 girls)", () => {
    expect(mixedFieldPlan(TOUCH_MIXED_RULE, 6, { boys: 8, girls: 4, unknown: 0 })).toEqual({
      size: 6,
      boys: 3,
      girls: 3,
      unknown: 0,
      short: false,
      belowMinimum: false,
    });
  });

  it("shrinks the field when it runs short of girls: one girl fields 4", () => {
    const plan = mixedFieldPlan(TOUCH_MIXED_RULE, 6, { boys: 8, girls: 1, unknown: 0 });
    expect(plan).toMatchObject({ size: 4, boys: 3, girls: 1, short: true, belowMinimum: false });
    expect(mixedFieldMessage(plan)).toBe("You can field 4: 3 boys and 1 girl");
  });

  it("flags a side with no girl at all", () => {
    expect(mixedFieldPlan(TOUCH_MIXED_RULE, 6, { boys: 8, girls: 0, unknown: 0 })).toMatchObject({
      size: 3,
      boys: 3,
      girls: 0,
      belowMinimum: true,
    });
  });

  it("splits an Oztag eight as evenly as the cap allows", () => {
    expect(mixedFieldPlan(OZTAG_MIXED_RULE, 8, { boys: 6, girls: 6, unknown: 0 })).toMatchObject({ boys: 4, girls: 4 });
    // Few boys: they don't all play every minute while girls sit.
    expect(mixedFieldPlan(OZTAG_MIXED_RULE, 8, { boys: 2, girls: 10, unknown: 0 })).toMatchObject({ boys: 1, girls: 7 });
    expect(mixedFieldPlan(OZTAG_MIXED_RULE, 8, { boys: 0, girls: 9, unknown: 0 })).toMatchObject({ boys: 0, girls: 8, short: false });
  });

  it("puts kids with no group in the places left over", () => {
    const plan = mixedFieldPlan(TOUCH_MIXED_RULE, 6, { boys: 3, girls: 1, unknown: 3 });
    expect(plan).toMatchObject({ size: 6, boys: 3, girls: 1, unknown: 2 });
    expect(mixedFieldMessage({ ...plan, size: 5, unknown: 1 })).toBe("You can field 5: 3 boys, 1 girl and 1 kid with no group");
  });
});

describe("mixedFieldBreach", () => {
  const groups: Record<string, "girl" | "boy"> = { g1: "girl", g2: "girl", b1: "boy", b2: "boy", b3: "boy", b4: "boy", b5: "boy" };
  const groupOf = (id: string) => groups[id] ?? null;

  it("says how the field breaks the rule, the boys' cap first", () => {
    expect(mixedFieldBreach(["b1", "b2", "b3", "b4", "g1"], TOUCH_MIXED_RULE, groupOf)).toEqual({
      text: "4 boys on: the mixed rule allows 3",
      short: "4 boys on · rule 3",
    });
    expect(mixedFieldBreach(["b1", "b2", "b3", "b4", "b5"], OZTAG_MIXED_RULE, groupOf)?.text).toBe(
      "5 boys on: the mixed rule allows 4",
    );
    expect(mixedFieldBreach(["b1", "b2", "b3"], TOUCH_MIXED_RULE, groupOf)).toEqual({
      text: "No girl on: the mixed rule needs 1",
      short: "No girl on · rule 1",
    });
    expect(mixedFieldBreach(["g1", "g2"], TOUCH_MIXED_RULE, groupOf)).toEqual({
      text: "No boy on: the mixed rule needs 1",
      short: "No boy on · rule 1",
    });
  });

  it("is null when the field keeps the rule", () => {
    expect(mixedFieldBreach(["b1", "b2", "b3", "g1", "g2"], TOUCH_MIXED_RULE, groupOf)).toBeNull();
    expect(mixedFieldBreach(["b1", "b2", "b3", "b4", "g1"], OZTAG_MIXED_RULE, groupOf)).toBeNull();
  });
});
