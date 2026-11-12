import { describe, expect, it } from "vitest";
import { lostScoreText, markLostScore, takeLostScore } from "@/lib/live/lostScore";

describe("lostScore", () => {
  it("hands the break the score cut off, once", () => {
    markLostScore("goal", 1000);
    expect(takeLostScore(30_000, 5000)).toBe("goal");
    expect(takeLostScore(30_000, 5000)).toBeNull();
  });

  it("forgets one from long ago", () => {
    markLostScore("try", 0);
    expect(takeLostScore(30_000, 60_000)).toBeNull();
  });

  it("says what wasn't saved and how to add it", () => {
    expect(lostScoreText("goal")).toMatch(/adding a goal, so it wasn't saved\. Add it with Fix scores/);
  });
});
