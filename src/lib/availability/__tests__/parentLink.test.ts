// The parent availability link (round 2 usability, 24 Oct 2026): the
// wizard promised "Share availability with parents", but nothing could be
// shared and parents had no way in. Each game now has its own link that
// only marks a kid In or Out, without an account.

import { describe, expect, it } from "vitest";
import {
  availabilityAskText,
  availabilityPath,
  kidLabel,
  parentAnswerError,
} from "@/lib/availability/parentLink";

const ok = {
  gameStatus: "upcoming" as const,
  gameTeamId: "t1",
  player: { team_id: "t1", is_active: true },
  status: "unavailable",
};

describe("parentAnswerError", () => {
  it("takes In or Out for a kid on this game's team before kickoff", () => {
    expect(parentAnswerError(ok)).toBeNull();
    expect(parentAnswerError({ ...ok, status: "available" })).toBeNull();
  });

  it("closes once the game has started or finished", () => {
    expect(parentAnswerError({ ...ok, gameStatus: "in_progress" })).toMatch(/started/i);
    expect(parentAnswerError({ ...ok, gameStatus: "completed" })).toMatch(/started/i);
  });

  it("refuses a kid from another team, an inactive kid or no kid", () => {
    expect(parentAnswerError({ ...ok, player: { team_id: "t2", is_active: true } })).not.toBeNull();
    expect(parentAnswerError({ ...ok, player: { team_id: "t1", is_active: false } })).not.toBeNull();
    expect(parentAnswerError({ ...ok, player: null })).not.toBeNull();
  });

  it("takes In, Out or a clear, nothing else", () => {
    // Clearing a wrong answer (Stagehand round 8, #12).
    expect(parentAnswerError({ ...ok, status: "unknown" })).toBeNull();
    expect(parentAnswerError({ ...ok, status: "maybe" })).not.toBeNull();
  });
});

describe("kidLabel", () => {
  it("shows a first name and surname initial", () => {
    expect(kidLabel("Tyler Hassan")).toBe("Tyler H.");
    expect(kidLabel("  Mia   van der Berg ")).toBe("Mia v.");
    expect(kidLabel("Zara")).toBe("Zara");
  });
});

describe("availabilityAskText", () => {
  it("asks the group chat one question with the game and the link", () => {
    const text = availabilityAskText({
      teamName: "Hawthorn Hornets",
      opponent: "Kew Kestrels",
      dayLabel: "Sat 25 Oct",
      url: "https://example.test/availability/abc",
    });
    expect(text).toContain("Hawthorn Hornets v Kew Kestrels");
    expect(text).toContain("Sat 25 Oct");
    expect(text).toMatch(/In or Out/);
    expect(text).toMatch(/no account/i);
    expect(text.trim().endsWith("https://example.test/availability/abc")).toBe(true);
  });

  it("says when and where the game is, when it has them", () => {
    const text = availabilityAskText({
      teamName: "Hawthorn Hornets",
      opponent: "Kew Kestrels",
      dayLabel: "Sat 25 Oct",
      timeLabel: "7:30 pm",
      location: " Brunswick Park ",
      url: "https://example.test/availability/abc",
    });
    expect(text.split("\n")[0]).toBe("Hawthorn Hornets v Kew Kestrels, Sat 25 Oct 7:30 pm at Brunswick Park");
    const bare = availabilityAskText({ teamName: "A", opponent: "B", dayLabel: "Sat 25 Oct", location: "", url: "u" });
    expect(bare.split("\n")[0]).toBe("A v B, Sat 25 Oct");
  });

  it("builds the link's path from the token", () => {
    expect(availabilityPath("abc")).toBe("/availability/abc");
  });
});
