// Each rugby sport's own score words and points on the live screens
// (rugby union plan, phase 4). Union records a drop goal as the
// field_goal event, so every surface names it from union's score types
// ("Drop goal", "DG"), and copy quotes union's points (try 5, penalty
// and drop goals 3), never league's.

import { describe, expect, it } from "vitest";
import { leagueScoreLine, rugbyScoreWords } from "@/lib/sports/rugby_league/fairness";
import { buildLeagueWalkthroughSteps } from "@/components/league/leagueWalkthroughSteps";

const score = { tries: 2, conversions: 1, penaltyGoals: 1, fieldGoals: 1, points: 0 };

describe("rugby score words", () => {
  it("names union's field goal a drop goal, league's a field goal", () => {
    expect(rugbyScoreWords("rugby_union")).toEqual({
      penaltyGoal: { label: "Penalty goal", short: "PG" },
      fieldGoal: { label: "Drop goal", short: "DG" },
    });
    expect(rugbyScoreWords("rugby_league").fieldGoal).toEqual({ label: "Field goal", short: "FG" });
  });

  it("writes the score line in the sport's own words", () => {
    expect(leagueScoreLine(score, rugbyScoreWords("rugby_union"))).toBe("2T · 1C · 1PG · 1DG");
    expect(leagueScoreLine(score, rugbyScoreWords("rugby_league"))).toBe("2T · 1C · 1PG · 1FG");
  });
});

describe("the walkthrough quotes the sport's own points", () => {
  const base = {
    trackScoring: true,
    periodLabel: "half" as const,
    vests: { fr: false, dh: false },
    kickingAllowed: true,
    trackZoneTime: false,
  };
  const scoring = (opts: Parameters<typeof buildLeagueWalkthroughSteps>[0]) =>
    buildLeagueWalkthroughSteps(opts).find((s) => s.title.startsWith("Recording"))!;

  it("union with goals from play: try, penalty goal (3) and drop goal (3), no kick rotation", () => {
    const step = scoring({ ...base, sport: "rugby_union", goalsFromPlay: true, kickRotations: false, unbrokenPeriods: false });
    expect(step.body).toContain("Penalty goal (3) or Drop goal (3)");
    expect(step.body).toContain("+PG and +DG");
    expect(step.body).not.toMatch(/Field goal|\+FG/);
    // Union never rotates kickers, so it isn't told there's none "at this age".
    expect(step.body).not.toMatch(/rotation/);
  });

  it("union without goals from play: a try is 5 points", () => {
    const step = scoring({ ...base, sport: "rugby_union", goalsFromPlay: false, kickRotations: false, unbrokenPeriods: false });
    expect(step.body).toContain("credit them with 5 points");
  });

  it("league keeps its 4-point try and 2 / 1 goals", () => {
    expect(
      scoring({ ...base, sport: "rugby_league", goalsFromPlay: false, kickRotations: true, unbrokenPeriods: true }).body,
    ).toContain("credit them with 4 points");
    expect(
      scoring({ ...base, sport: "rugby_league", goalsFromPlay: true, kickRotations: false, unbrokenPeriods: false }).body,
    ).toContain("Penalty goal (2) or Field goal (1)");
  });
});
