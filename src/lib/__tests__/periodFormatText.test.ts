import { describe, expect, it } from "vitest";
import { periodFormatText, periodLengthText } from "@/lib/games/periodFormatText";
import { getEffectiveQuarterSeconds, periodLabels } from "@/lib/sports";
import { teamAgeGroup } from "@/lib/sports/teamAgeGroup";
import type { Sport } from "@/lib/types";

function gameFormat(sport: Sport, age: string, periodCount: number | null, teamSeconds: number | null, gameSeconds: number | null = null) {
  const cfg = teamAgeGroup(sport, age, periodCount);
  const seconds = getEffectiveQuarterSeconds({ quarter_length_seconds: teamSeconds }, cfg, { quarter_length_seconds: gameSeconds });
  return periodFormatText(cfg.periodCount, seconds, periodLabels(sport, cfg));
}

describe("the game page's periods (Stagehand round 11, #11)", () => {
  it("says the count, length and the sport's word", () => {
    expect(periodFormatText(4, 600, { label: "quarter", plural: "quarters" })).toBe("4 × 10 min quarters");
    expect(periodFormatText(2, 1200, { label: "half", plural: "halves" })).toBe("2 × 20 min halves");
    expect(periodFormatText(1, 1500, { label: "period", plural: "periods" })).toBe("One 25 min period");
    expect(periodFormatText(4, 450, { label: "quarter", plural: "quarters" })).toBe("4 × 7 min 30 s quarters");
  });

  it("follows the age group, then the team's length, then the game's", () => {
    expect(gameFormat("afl", "U10", null, null)).toBe("4 × 12 min quarters");
    expect(gameFormat("afl", "U10", null, 600)).toBe("4 × 10 min quarters");
    expect(gameFormat("afl", "U10", null, 600, 900)).toBe("4 × 15 min quarters");
  });

  it("speaks each sport's periods", () => {
    expect(gameFormat("soccer", "U10", null, null)).toMatch(/^2 × \d+ min halves$/);
    expect(gameFormat("netball", "11u", null, null)).toMatch(/^4 × \d+ min quarters$/);
    expect(gameFormat("basketball", "U12", 4, null)).toMatch(/^4 × \d+ min quarters$/);
    expect(gameFormat("touch", "U11", 1, null)).toMatch(/^One \d+ min period$/);
  });
});

describe("the live top bar's periods (Steve, 12 Nov 2026)", () => {
  it("says the count and length, short", () => {
    expect(periodLengthText(4, 600)).toBe("4 × 10 min");
    expect(periodLengthText(2, 1500)).toBe("2 × 25 min");
    expect(periodLengthText(1, 1500)).toBe("One 25 min period");
    expect(periodLengthText(4, 450)).toBe("4 × 7 min 30 s");
  });
});
