import { describe, expect, it } from "vitest";
import { kidsMoved, marginWords, replannedText } from "@/lib/live/break/breakWords";

describe("the break's score margin, said (Stagehand round 11, #3)", () => {
  it("says up, down or level", () => {
    expect(marginWords(1)).toBe("Up by 1");
    expect(marginWords(12)).toBe("Up by 12");
    expect(marginWords(-4)).toBe("Down by 4");
    expect(marginWords(0)).toBe("Level");
  });
});

describe("the break's re-plan line (Stagehand round 11, #2)", () => {
  const before = { a: "att", b: "mid", c: "bench", d: "def" };

  it("counts kids whose group changed", () => {
    expect(kidsMoved(before, { a: "mid", b: "att", c: "bench", d: "def" }, "bench")).toBe(2);
    expect(kidsMoved(before, before, "bench")).toBe(0);
  });

  it("counts a kid back who starts on the field, not one back on the bench", () => {
    expect(kidsMoved(before, { ...before, e: "att" }, "bench")).toBe(1);
    expect(kidsMoved(before, { ...before, e: "bench" }, "bench")).toBe(0);
  });

  it("leaves out kids who can't play now", () => {
    expect(kidsMoved(before, { ...before, a: "bench" }, "bench", new Set(["a"]))).toBe(0);
  });

  it("says how many moved, in a plain line", () => {
    expect(replannedText(1)).toBe("Lineup re-planned: 1 kid moved.");
    expect(replannedText(5)).toBe("Lineup re-planned: 5 kids moved.");
  });
});
