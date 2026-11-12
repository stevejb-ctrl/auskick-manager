import { describe, expect, it } from "vitest";
import { strategyLabelOf } from "@/lib/playbook/strategyLabel";

describe("the Game plan's rotation name (Stagehand round 11, #12)", () => {
  it("names the team's strategy in How we play's words", () => {
    expect(strategyLabelOf("afl", "U10", "rotate")).toBe("Rotate lines");
    expect(strategyLabelOf("netball", "11u", "position-cycle")).toBe("Position cycle");
  });

  it("finds an AFL open-age strategy on a zoned age too (zones turned off)", () => {
    expect(strategyLabelOf("afl", "U10", "preferred-lines")).toBe("Preferred lines");
    expect(strategyLabelOf("afl", "U14", "suggested")).toBe("Suggested");
  });

  it("names the default a team with no choice plays", () => {
    expect(strategyLabelOf("afl", "U10", null)).toBe("Suggested");
    expect(strategyLabelOf("netball", "11u", undefined)).toBe("By thirds");
    expect(strategyLabelOf("rugby_league", "U10", null)).toBeTruthy();
  });
});
