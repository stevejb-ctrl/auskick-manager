// ─── League: a kid back from loan at the break ───────────────
// Round 3 edge cases, 24 Oct 2026 (league P2): Sienna came back from
// loan at the break. The check said she "can't reach 50%" and "can't
// get 1 unbroken half", but Fix fixed it: she could, by playing the
// half. A kid who'd make it by playing the next period reads "must play
// the next half"; "can't" is for a kid who can't either way. (The
// break also re-plans when she's back: lib/live/break/useBreakReplan.)

import { describe, expect, it } from "vitest";
import { getAgeGroupConfig } from "@/lib/sports";
import { rugbyBreakCheck } from "@/lib/sports/rugby/breakCheck";

const MIN = 60_000;

describe("the break check for a kid back from loan", () => {
  // U10, 2 × 20 min. Sienna played 4:36 of H1, then was lent for the rest
  // of it; she's back, on the bench in the staged H2.
  const ageGroup = getAgeGroupConfig("rugby_league", "U10");
  const others = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];
  const check = (bench: string[], played: Record<string, number>) =>
    rugbyBreakCheck({
      lineup: { forwards: others.slice(0, 5), backs: others.slice(5, 11), bench },
      ageGroup,
      names: { sienna: "Sienna", zed: "Zed" },
      playedThisGame: Object.fromEntries([...others, ...bench].map((pid) => [pid, { forwards: played[pid] ?? 20 * MIN }])),
      benchedLastPeriod: [],
      period: 2,
      periodMs: 20 * MIN,
      periodWord: "half",
      unbroken: { required: 1, done: Object.fromEntries(others.map((pid) => [pid, 1])) },
      awayMs: { sienna: 15 * MIN + 24_000 },
    });

  it("says she must play the half, not that she can't", () => {
    const items = check(["sienna"], { sienna: 4 * MIN + 36_000 });
    expect(items.find((i) => i.id === "min-game-time")).toMatchObject({ status: "fail", text: "Sienna must play the next half to reach 50%" });
    expect(items.find((i) => i.id === "unbroken-periods")).toMatchObject({ status: "fail", text: "Sienna must play the next half for 1 unbroken half" });
  });

  it("a kid who can't make it even playing the half still reads can't", () => {
    // Zed played none of H1 and wasn't away: at 60 % he'd need 24 of 40,
    // and the half alone is 20.
    const items = rugbyBreakCheck({
      lineup: { forwards: others.slice(0, 5), backs: others.slice(5, 11), bench: ["zed"] },
      ageGroup,
      names: { zed: "Zed" },
      playedThisGame: Object.fromEntries([...others, "zed"].map((pid) => [pid, { forwards: pid === "zed" ? 0 : 20 * MIN }])),
      benchedLastPeriod: [],
      period: 2,
      periodMs: 20 * MIN,
      periodWord: "half",
      minGameTimePct: 60,
    });
    expect(items.find((i) => i.id === "min-game-time")).toMatchObject({ status: "fail", text: "Zed can't reach 60% now" });
  });
});
