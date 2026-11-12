import { describe, expect, it } from "vitest";
import { settingsSummary, subEveryText, subIntervalDuration } from "@/lib/live/subIntervalText";

describe("the sub interval, in one phrase (Stagehand round 11, #5)", () => {
  it("says whole minutes as minutes", () => {
    expect(subEveryText(240)).toBe("Sub every 4 min");
    expect(subEveryText(600)).toBe("Sub every 10 min");
  });

  it("says a part minute in minutes and seconds, never a decimal", () => {
    expect(subEveryText(255)).toBe("Sub every 4 min 15 s");
    expect(subEveryText(252)).toBe("Sub every 4 min 12 s");
    expect(subEveryText(270)).toBe("Sub every 4 min 30 s");
    expect(subEveryText(270)).not.toMatch(/\d\.\d|\dm\b/);
  });

  it("says under a minute in seconds (league and union set seconds)", () => {
    expect(subEveryText(45)).toBe("Sub every 45 s");
    expect(subIntervalDuration(30)).toBe("30 s");
  });

  it("rounds stray fractions of a second", () => {
    expect(subIntervalDuration(239.6)).toBe("4 min");
  });

  it("is the phrase under the live menu's Game settings", () => {
    expect(settingsSummary(180, 12)).toBe("Sub every 3 min · 12 on the field");
    expect(settingsSummary(255, 5, "court")).toBe("Sub every 4 min 15 s · 5 on the court");
  });
});
