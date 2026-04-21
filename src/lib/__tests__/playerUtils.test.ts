import { describe, expect, it } from "vitest";
import { jerseyLabel } from "@/lib/playerUtils";

describe("jerseyLabel", () => {
  it("returns '#N' for a numeric jersey", () => {
    expect(jerseyLabel(7)).toBe("#7");
    expect(jerseyLabel(99)).toBe("#99");
    expect(jerseyLabel(1)).toBe("#1");
  });

  it("returns '' for null", () => {
    expect(jerseyLabel(null)).toBe("");
  });

  it("returns '' for undefined", () => {
    expect(jerseyLabel(undefined)).toBe("");
  });
});
