import { describe, expect, it } from "vitest";
import { describeScoreEvent, newOtherPhoneScores, otherPhoneScoreText } from "@/lib/live/otherPhone";

const TYPES = new Set(["goal", "opponent_goal"]);
const ev = (id: string, type: string, key: string | null, at: string) => ({ id, type, idempotency_key: key, created_at: at });

describe("newOtherPhoneScores", () => {
  it("names a score from another phone once, not this phone's own or one from before", () => {
    const seen = new Set<string>();
    const own = (k: string | null | undefined) => k === "mine";
    const events = [
      ev("e1", "goal", "old", "2026-10-29T09:00:00Z"),
      ev("e2", "goal", "mine", "2026-10-29T09:05:00Z"),
      ev("e3", "opponent_goal", "theirs", "2026-10-29T09:06:00Z"),
      ev("e4", "quarter_end", "x", "2026-10-29T09:07:00Z"),
    ];
    const first = newOtherPhoneScores(events, TYPES, seen, "2026-10-29T09:01:00Z", own);
    expect(first.map((e) => e.id)).toEqual(["e3"]);
    expect(newOtherPhoneScores(events, TYPES, seen, "2026-10-29T09:01:00Z", own)).toEqual([]);
  });
});

describe("otherPhoneScoreText", () => {
  const names = { teamName: "Coburg", opponentName: "Sharks" };
  it("says another phone did it, and whose score it was", () => {
    expect(otherPhoneScoreText("goal", names, "Isla")).toBe("Another phone added Isla's goal");
    expect(otherPhoneScoreText("try", names, null)).toBe("Another phone added a Coburg try");
    expect(otherPhoneScoreText("opponent_goal", names, "Isla")).toBe("Another phone added a Sharks goal");
  });
});

describe("describeScoreEvent", () => {
  it("says whose and what in plain words", () => {
    expect(describeScoreEvent("opponent_goal", "Roos", "Sharks")).toBe("Sharks goal");
    expect(describeScoreEvent("two_pointer", "Roos", "Sharks")).toBe("Roos 2-pointer");
    expect(describeScoreEvent("conversion_attempt", "Roos", "Sharks")).toBe("Roos conversion");
  });
});
