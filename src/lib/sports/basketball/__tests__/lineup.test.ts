// Basketball's config and lineup validator.

import { describe, expect, it } from "vitest";
import {
  BASKETBALL_AGE_GROUPS,
  BASKETBALL_POINTS,
  basketballAgeGroup,
  basketballAgeGroupForTeam,
  basketballShapes,
} from "@/lib/sports/basketball";
import { validateBasketballLineup } from "@/lib/sports/basketball/lineup";
import { COURT, LINES, POSITIONS } from "./basketballGame";

const U12 = basketballAgeGroup("U12");

describe("basketball age groups", () => {
  it("plays 2 × 20 halves from U10 and 2 × 12 at U8, five on court", () => {
    expect(BASKETBALL_AGE_GROUPS.map((a) => a.id)).toEqual(["U8", "U10", "U12", "U14", "U16", "U18"]);
    expect(basketballAgeGroup("U8").periodSeconds).toBe(12 * 60);
    for (const a of BASKETBALL_AGE_GROUPS) {
      expect(a.periodCount).toBe(2);
      expect(a.periodLabel).toBe("half");
      expect(a.defaultOnFieldSize).toBe(5);
      expect(a.foulOutAt).toBe(5);
      if (a.id !== "U8") expect(a.periodSeconds).toBe(20 * 60);
    }
  });

  it("keeps score from U10, 3-pointers and the foul tally from U12", () => {
    const by = Object.fromEntries(BASKETBALL_AGE_GROUPS.map((a) => [a.id, a]));
    expect(by.U8.tracksScoreDefault).toBe(false);
    expect(by.U10.tracksScoreDefault).toBe(true);
    expect(by.U10.threePointers).toBe(false);
    expect(by.U12.threePointers).toBe(true);
    expect(by.U10.tracksFoulsDefault).toBe(false);
    expect(by.U12.tracksFoulsDefault).toBe(true);
  });

  it("suggests Equal minutes to U10, Guards and forwards to U14, Home line after", () => {
    expect(BASKETBALL_AGE_GROUPS.map((a) => a.suggestedStrategy)).toEqual([
      "minutes",
      "minutes",
      "both-lines",
      "both-lines",
      "preferred-line",
      "preferred-line",
    ]);
  });

  it("plays quarters of half the length when the team plays quarters", () => {
    const q = basketballAgeGroupForTeam("U12", 4);
    expect(q.periodCount).toBe(4);
    expect(q.periodSeconds).toBe(10 * 60);
    expect(q.periodLabel).toBe("quarter");
    expect(q.periodLabelPlural).toBe("quarters");
    expect(basketballAgeGroupForTeam("U12", null)).toBe(U12);
    expect(basketballAgeGroupForTeam("U12", 2)).toBe(U12);
  });

  it("scores 1, 2 and 3 for both sides", () => {
    expect(BASKETBALL_POINTS).toEqual({
      free_throw: 1,
      two_pointer: 2,
      three_pointer: 3,
      opponent_free_throw: 1,
      opponent_two_pointer: 2,
      opponent_three_pointer: 3,
    });
  });

  it("has a 2–3 default and a 3–2 option at five", () => {
    expect(basketballShapes(5).map((s) => s.id)).toEqual(["2-3", "3-2"]);
    expect(basketballShapes(9)[0].id).toBe("2-3");
  });

  it("refuses an unknown age group", () => {
    expect(() => basketballAgeGroup("U11")).toThrow(/Unknown basketball age group/);
  });
});

describe("validateBasketballLineup", () => {
  it("takes each strategy's lineup", () => {
    for (const lu of [COURT, LINES, POSITIONS]) expect(validateBasketballLineup(lu, U12).ok).toBe(true);
  });

  it("refuses kids on the court and in lines at once", () => {
    const r = validateBasketballLineup({ lines: { guard: ["a"], forward: [], court: ["b", "c", "d", "e"] }, bench: [] }, U12);
    expect(r.ok).toBe(false);
  });

  it("refuses six on court, and warns at four", () => {
    const six = validateBasketballLineup({ ...COURT, lines: { ...COURT.lines, court: ["a", "b", "c", "d", "e", "f"] } }, U12);
    expect(six.ok).toBe(false);
    const four = validateBasketballLineup({ ...COURT, lines: { ...COURT.lines, court: ["a", "b", "c", "d"] } }, U12);
    expect(four.ok).toBe(true);
    expect(four.issues.some((i) => i.kind === "warn")).toBe(true);
  });

  it("refuses a kid in two places", () => {
    expect(validateBasketballLineup({ ...COURT, bench: ["a"] }, U12).ok).toBe(false);
  });

  it("refuses a position held twice, or out of its line", () => {
    expect(validateBasketballLineup({ ...POSITIONS, slots: { ...POSITIONS.slots, b: "pg" } }, U12).ok).toBe(false);
    expect(validateBasketballLineup({ ...POSITIONS, slots: { ...POSITIONS.slots, c: "pg", a: "sf" } }, U12).ok).toBe(false);
  });

  it("is basketball's own: another sport's age group is an error", async () => {
    const { getAgeGroupConfig } = await import("@/lib/sports");
    expect(() => validateBasketballLineup(COURT, getAgeGroupConfig("afl", "U10"))).toThrow(/isn't a basketball age group/);
  });
});
