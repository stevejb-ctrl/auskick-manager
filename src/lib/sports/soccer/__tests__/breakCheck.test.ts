// The soccer family's break check: the 50% floor with flying subs.
// Futsal's audit (23 Oct 2026): the suggested 2nd half failed its own
// "can't reach 50% now" rule and forced "Start anyway", though rolling
// subs bring a bench kid on during the half.

import { describe, expect, it } from "vitest";
import { soccerFamilyAgeGroup, soccerFamilyRules } from "@/lib/sports/soccer/family";
import { replaySoccerGame } from "@/lib/sports/soccer/replay";
import { soccerBreakCheck } from "@/lib/sports/soccer/breakCheck";
import { SOCCER_WINDOWS_PRESET } from "@/lib/sports/soccer";
import type { SoccerLineup } from "@/lib/sports/soccer/lineup";
import { MIN, SEVEN, game } from "./soccerGame";

const U9 = soccerFamilyAgeGroup("soccer", "U9");
const HALF = 20 * MIN;

/** The first half played SEVEN all the way: b1 and b2 sat it out. */
function atHalfTime() {
  const g = game();
  g.lineup(SEVEN);
  g.start(1);
  g.end(1, 20);
  return replaySoccerGame(g.events);
}

// The second half as Repeat stages it: the same seven, b1 and b2 on the bench.
const REPEAT: SoccerLineup = { ...SEVEN, keeper: "m1", lines: { ...SEVEN.lines, mid: ["k", "m2", "m3"] } };

function floor(ageGroup = U9) {
  const items = soccerBreakCheck({
    lineup: REPEAT,
    state: atHalfTime(),
    ageGroup,
    rules: soccerFamilyRules("soccer"),
    onFieldSize: 7,
    period: 2,
    periodMs: HALF,
    names: { b1: "Ben", b2: "Bea" },
    keeperStrategy: "turns",
  });
  return items.find((i) => i.id === "min-game-time");
}

describe("soccerBreakCheck: the 50% floor", () => {
  it("counts the half still to come for a bench kid when subs roll on", () => {
    expect(U9.subMode.kind).toBe("rolling");
    expect(floor()).toMatchObject({ status: "ok" });
  });

  it("counts from the first window when subs come in windows", () => {
    // Tasmania's three windows a half: the first is a quarter of the
    // way in, so a bench kid can play 15 of the 40 minutes at most.
    expect(floor({ ...U9, subMode: SOCCER_WINDOWS_PRESET })).toMatchObject({
      status: "fail",
      text: "Ben and Bea can't reach 50% now",
    });
  });
});
