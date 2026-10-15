// One age-group knob per rugby law (rugby union plan, phase 1).
// `internationalLaws` used to switch on goals from play AND switch off
// the kick rotations and the unbroken-period rule AND pick the
// recommended strategy. Union needs goals from play at junior ages
// without the rest, so each now has its own knob, with league's values
// unchanged, and each switches only its own feature.

import { describe, expect, it } from "vitest";
import { rugbyLeagueSport } from "@/lib/sports";
import { leaguePlaybook } from "@/lib/sports/rugby_league/playbook";
import { effectivePolicy } from "@/lib/playbook";
import { buildLeagueWalkthroughSteps } from "@/components/league/leagueWalkthroughSteps";

const byId = (id: string) => rugbyLeagueSport.ageGroups.find((a) => a.id === id)!;
const JUNIOR = ["U6", "U7", "U8", "U9", "U10", "U11", "U12"];
const INTERNATIONAL = ["U13", "U14", "U15", "U16", "U17"];

describe("league's laws, one knob each", () => {
  it("junior laws (U6–U12): kick rotations and unbroken periods, no goals from play", () => {
    for (const id of JUNIOR) {
      expect(byId(id).kickRotations, id).toBe(true);
      expect(byId(id).unbrokenPeriods, id).toBe(true);
      expect(byId(id).goalsFromPlay, id).toBe(false);
    }
  });

  it("international laws (U13+): goals from play, no kick rotations or unbroken periods", () => {
    for (const id of INTERNATIONAL) {
      expect(byId(id).goalsFromPlay, id).toBe(true);
      expect(byId(id).kickRotations, id).toBe(false);
      expect(byId(id).unbrokenPeriods, id).toBe(false);
    }
  });

  it("the unbroken-period law is on exactly where it asks for a minimum", () => {
    for (const ag of rugbyLeagueSport.ageGroups) {
      expect(ag.unbrokenPeriods, ag.id).toBe((ag.minUnbrokenPeriods ?? 0) > 0);
    }
  });

  it("recommends both lines to U9, preferred line at U10–U12, named positions from U13", () => {
    for (const id of ["U6", "U7", "U8", "U9"]) expect(byId(id).recommendedStrategy, id).toBe("both-lines");
    for (const id of ["U10", "U11", "U12"]) expect(byId(id).recommendedStrategy, id).toBe("preferred-line");
    for (const id of INTERNATIONAL) expect(byId(id).recommendedStrategy, id).toBe("named-positions");
  });
});

describe("How we play suggests the age group's recommended strategy", () => {
  it("reads the knob, and offers the strategy it suggests", () => {
    for (const ag of rugbyLeagueSport.ageGroups) {
      const policy = effectivePolicy("rugby_league", ag.id);
      expect(leaguePlaybook.recommendedStrategy(policy), ag.id).toBe(ag.recommendedStrategy);
      expect(leaguePlaybook.strategies(policy).map((s) => s.id), ag.id).toContain(ag.recommendedStrategy);
    }
  });
});

describe("each law knob switches only its own walkthrough copy", () => {
  const BASE = {
    sport: "rugby_league" as const,
    trackScoring: true,
    periodLabel: "half" as const,
    vests: { fr: true, dh: true },
    kickingAllowed: true,
    trackZoneTime: true,
    enforceUnbrokenPeriods: true,
    goalsFromPlay: false,
    kickRotations: true,
    unbrokenPeriods: true,
  };
  const steps = (o: Partial<typeof BASE> = {}) => buildLeagueWalkthroughSteps({ ...BASE, ...o });
  const isScoring = (s: { title: string }) => s.title.startsWith("Recording");
  const scoring = (o: Partial<typeof BASE> = {}) => steps(o).find(isScoring)!;
  const rest = (o: Partial<typeof BASE> = {}) => steps(o).filter((s) => !isScoring(s));

  it("goalsFromPlay: the scoring step adds penalty and field goals, and nothing else changes", () => {
    expect(scoring().title).toBe("Recording tries & conversions");
    expect(scoring().body).not.toMatch(/Penalty goal/);
    expect(scoring({ goalsFromPlay: true }).title).toBe("Recording tries & goals");
    expect(scoring({ goalsFromPlay: true }).body).toMatch(/Penalty goal/);
    // The kick rotation is still its own knob's call.
    expect(scoring({ goalsFromPlay: true }).body).toMatch(/goal-kick rotation/);
    expect(rest({ goalsFromPlay: true })).toEqual(rest());
  });

  it("kickRotations: only the goal-kick rotation sentence", () => {
    expect(scoring().body).toMatch(/goal-kick rotation/);
    expect(scoring({ kickRotations: false }).body).not.toMatch(/goal-kick rotation/);
    expect(scoring({ kickRotations: false }).title).toBe(scoring().title);
    expect(scoring({ goalsFromPlay: true, kickRotations: false }).body).toMatch(/no kicking rotation/);
    expect(rest({ kickRotations: false })).toEqual(rest());
  });

  it("unbrokenPeriods: only the unbroken-period step", () => {
    const on = steps();
    expect(on.map((s) => s.title)).toContain("Unbroken-period rule");
    expect(steps({ unbrokenPeriods: false })).toEqual(on.filter((s) => s.title !== "Unbroken-period rule"));
  });
});
