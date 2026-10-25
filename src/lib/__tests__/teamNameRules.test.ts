import { describe, expect, it } from "vitest";
import { TEAM_NAME_MAX, teamNameError, teamNameMatches } from "@/lib/strings";

describe("teamNameError", () => {
  // Round 3 (24 Oct 2026): create took 98 characters; rename refused
  // any edit over 80. One rule for both now.
  it("is the same 80-character rule create and rename use", () => {
    expect(teamNameError("Kotara Koalas")).toBeNull();
    expect(teamNameError("x".repeat(TEAM_NAME_MAX))).toBeNull();
    expect(teamNameError("x".repeat(TEAM_NAME_MAX + 1))).toBe("Name is too long (80 characters max).");
    expect(teamNameError("   ")).toBe("Team name is required.");
  });
});

describe("teamNameMatches", () => {
  // Round 3: only the exact string, emoji and curly quotes included,
  // unlocked Delete team.
  it("ignores case, curly quotes, emoji and spacing", () => {
    expect(teamNameMatches("northern stars", "Northern Stars")).toBe(true);
    expect(teamNameMatches("نجوم الشمال Northern Stars", "نجوم الشمال ⚽ Northern Stars")).toBe(true);
    expect(teamNameMatches("Zoe's Roos", "Zoe’s 🦘 Roos")).toBe(true);
    expect(teamNameMatches("  kotara   koalas ", "Kotara Koalas")).toBe(true);
  });

  it("still needs the whole name", () => {
    expect(teamNameMatches("Northern Stars", "نجوم الشمال ⚽ Northern Stars")).toBe(false);
    expect(teamNameMatches("Kotara", "Kotara Koalas")).toBe(false);
    expect(teamNameMatches("", "Kotara Koalas")).toBe(false);
  });

  it("asks for an all-emoji name as it is", () => {
    expect(teamNameMatches("⚽⚽", "⚽⚽")).toBe(true);
    expect(teamNameMatches("", "⚽⚽")).toBe(false);
    expect(teamNameMatches("x", "⚽⚽")).toBe(false);
  });
});
