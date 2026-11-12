import { describe, expect, it } from "vitest";
import { AFL_SEASON_SHORT, aflSeasonLines, seasonLeastWords } from "@/lib/live/seasonWords";
import { ZONE_LABELS, ZONE_SHORT_LABELS } from "@/lib/ageGroups";

const lines = (fwd: number, mid: number, back: number) =>
  aflSeasonLines({ fwd, mid, back }, ["fwd", "mid", "back"], ZONE_SHORT_LABELS, ZONE_LABELS);

describe("seasonLeastWords", () => {
  it("names the line a kid has had least of", () => {
    expect(seasonLeastWords(lines(10, 30, 60))).toEqual({
      text: "Least Fwd",
      spoken: "Least season time at Forward: Forward 10%, Centre 30%, Back 60%",
    });
    expect(seasonLeastWords(lines(40, 40, 20))?.text).toBe("Least Back");
  });

  it("says nothing before any season time", () => {
    expect(seasonLeastWords(lines(0, 0, 0))).toBeNull();
    expect(seasonLeastWords(aflSeasonLines(undefined, ["fwd", "mid", "back"], ZONE_SHORT_LABELS, ZONE_LABELS))).toBeNull();
  });

  it("says nothing when the time is already even", () => {
    expect(seasonLeastWords(lines(33, 34, 33))).toBeNull();
  });

  it("fits a quarter-width tile for every AFL line, as \"Least Back\" does", () => {
    const zones = ["back", "hback", "mid", "hfwd", "fwd"] as const;
    for (const least of zones) {
      const minutes = Object.fromEntries(zones.map((z) => [z, z === least ? 0 : 30]));
      const words = seasonLeastWords(aflSeasonLines(minutes, zones, AFL_SEASON_SHORT, ZONE_LABELS));
      expect(words?.text.length, words?.text).toBeLessThanOrEqual("Least Back".length);
    }
  });

  it("needs two lines to compare", () => {
    expect(seasonLeastWords([{ key: "court", short: "Court", label: "Court", minutes: 30 }])).toBeNull();
  });
});
