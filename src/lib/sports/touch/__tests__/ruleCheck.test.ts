// The touch family's rule check: each line names the rule it breaks (the
// lanes or the mixed rule), with ids that stay put as the lineup changes,
// and a lineup that keeps them says so (the pre-game RuleCheckBar).

import { describe, expect, it } from "vitest";
import { summariseCheck } from "@/lib/playbook/ruleCheck";
import { touchLineupRuleItems } from "@/lib/sports/touch/ruleCheck";
import { touchAgeGroup } from "@/lib/sports/touch/family";
import { TOUCH_MIXED_RULE } from "@/lib/sports/touch";
import { mixedRuleSummary } from "@/lib/sports/touch/mixed";
import type { TouchMixed } from "@/lib/sports/touch/suggest";
import type { TouchLineup } from "@/lib/sports/touch/lineup";
import { FIELD, LANES, groupOf } from "./touchGame";

const U11 = touchAgeGroup("touch", "U11");
const mixed: TouchMixed = { rule: TOUCH_MIXED_RULE, groupOf };
const LANES_RULE = "One place each, in the lanes the side plays";

const field = (on: string[], bench: string[] = []): TouchLineup => ({
  lines: { middle: [], link: [], wing: [], field: on },
  bench,
});

describe("touchLineupRuleItems", () => {
  it("labels 'needs at least 1 girl' with the mixed rule, not the lanes (audit 23 Oct, touch P2)", () => {
    // d e f h i j are all boys: too many boys, and no girl.
    const items = touchLineupRuleItems({ lineup: field(["d", "e", "f", "h", "i", "j"]), ageGroup: U11, size: 6, mixed });
    const noGirl = items.find((i) => /at least 1 girl/.test(i.text));
    expect(noGirl).toMatchObject({ status: "fail", rule: mixedRuleSummary(TOUCH_MIXED_RULE) });
    const tooMany = items.find((i) => /Too many boys/.test(i.text));
    expect(tooMany).toMatchObject({ status: "fail", rule: mixedRuleSummary(TOUCH_MIXED_RULE) });
  });

  it("labels 'needs at least 1 boy' with the mixed rule too", () => {
    const girlsOnly = field(["a", "b", "c", "g"]);
    const item = touchLineupRuleItems({ lineup: girlsOnly, ageGroup: U11, size: 4, mixed }).find((i) => /at least 1 boy/.test(i.text));
    expect(item?.rule).toBe(mixedRuleSummary(TOUCH_MIXED_RULE));
  });

  it("labels a lane shape the age doesn't play with the lanes rule", () => {
    const lopsided: TouchLineup = { lines: { middle: ["a", "b", "d"], link: ["c", "e"], wing: ["f"], field: [] }, bench: [] };
    const items = touchLineupRuleItems({ lineup: lopsided, ageGroup: U11, size: 6, mixed });
    expect(items.find((i) => /a side plays/.test(i.text))).toMatchObject({ status: "fail", rule: LANES_RULE });
  });

  it("gives each rule the same id whatever else breaks, so the break's Fix finds it again", () => {
    const one = touchLineupRuleItems({ lineup: field(["d", "e", "f", "h", "i", "j"]), ageGroup: U11, size: 6, mixed });
    const two = touchLineupRuleItems({ lineup: field(["d", "e", "f", "h", "i", "j", "k"]), ageGroup: U11, size: 6, mixed });
    const idOf = (items: typeof one, re: RegExp) => items.find((i) => re.test(i.text))?.id;
    expect(idOf(one, /at least 1 girl/)).toBe(idOf(two, /at least 1 girl/));
    expect(idOf(one, /Too many boys/)).toBe(idOf(two, /Too many boys/));
  });

  it("says a legal mixed side keeps every rule, with the boys and girls on", () => {
    const items = touchLineupRuleItems({ lineup: LANES, ageGroup: U11, size: 6, mixed });
    expect(items.every((i) => i.status === "ok")).toBe(true);
    expect(items.map((i) => i.text)).toContain("Mixed rule kept: 3 of 3 boys, 3 girls");
    expect(summariseCheck(items)).toEqual({ status: "ok", text: "All rules kept" });
  });

  it("checks just the places on a team that isn't mixed", () => {
    const items = touchLineupRuleItems({ lineup: FIELD, ageGroup: U11, size: 6 });
    expect(items).toEqual([{ id: "lineup-places", status: "ok", text: "6 on the field, one place each" }]);
  });
});
