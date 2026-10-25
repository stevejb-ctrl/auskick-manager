import { describe, expect, it } from "vitest";
import { parseWholeNumber } from "@/lib/wholeNumber";

describe("parseWholeNumber", () => {
  const jersey = (raw: string) => parseWholeNumber(raw, { min: 1, max: 99, what: "Jersey" });

  it("reads a whole number in range", () => {
    expect(jersey("7")).toEqual({ value: 7 });
    expect(jersey(" 12 ")).toEqual({ value: 12 });
    expect(jersey("")).toEqual({ value: null });
  });

  // Round 3 (24 Oct 2026): jersey 1.5 saved as #1, 'e' saved no number,
  // quarter length 1.5 saved 1 minute — all without a word.
  it("refuses what isn't a whole number instead of rounding it", () => {
    expect(jersey("1.5")).toEqual({ value: null, error: "Jersey must be a whole number from 1 to 99." });
    expect(jersey("e")).toEqual({ value: null, error: "Jersey must be a whole number from 1 to 99." });
    expect(jersey("7a")).toEqual({ value: null, error: "Jersey must be a whole number from 1 to 99." });
    expect(parseWholeNumber("1.5", { min: 1, max: 60, what: "Quarter length" }).error).toBe(
      "Quarter length must be a whole number from 1 to 60.",
    );
  });

  it("refuses a number out of range", () => {
    expect(jersey("0").error).toBeDefined();
    expect(jersey("100").error).toBeDefined();
    expect(jersey("-1").error).toBeDefined();
  });
});
