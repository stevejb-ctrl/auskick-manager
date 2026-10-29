import { describe, expect, it } from "vitest";
import { repeatTapGate } from "@/lib/live/repeatTap";

describe("repeatTapGate", () => {
  it("lets one tap through and stops its double (Stagehand round 8)", () => {
    const gate = repeatTapGate(900);
    expect(gate("theirs:g", 1000)).toBe(true);
    expect(gate("theirs:g", 1150)).toBe(false);
  });

  it("lets a different chip, or the same one later, through", () => {
    const gate = repeatTapGate(900);
    expect(gate("theirs:g", 0)).toBe(true);
    expect(gate("theirs:b", 100)).toBe(true);
    expect(gate("theirs:b", 1100)).toBe(true);
  });
});
