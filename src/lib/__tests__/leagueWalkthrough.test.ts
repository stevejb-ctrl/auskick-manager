// League's walkthrough describes the age group's own vests and period
// (cross-sport audit, 14 Oct 2026): it decided whether to mention the
// Dummy Half from kicking (on at U8), so U8 — FR only — was told about
// two vests, and the vest rule said "each period".

import { describe, expect, it } from "vitest";
import { buildLeagueWalkthroughSteps } from "@/components/league/leagueWalkthroughSteps";
import { getAgeGroupConfig, periodLabels } from "@/lib/sports";

function vestStep(ageGroup: string) {
  const ag = getAgeGroupConfig("rugby_league", ageGroup);
  const steps = buildLeagueWalkthroughSteps({
    trackScoring: true,
    periodLabel: periodLabels("rugby_league", ag).label,
    vests: { fr: ag.vestRequirements?.fr ?? false, dh: ag.vestRequirements?.dh ?? false },
    kickingAllowed: ag.kickingAllowed === true,
    trackZoneTime: false,
    enforceUnbrokenPeriods: false,
  });
  return steps.find((s) => s.emoji === "🦺");
}

describe("league walkthrough", () => {
  it("tells U8 about the FR vest only, rotating each quarter", () => {
    const step = vestStep("U8")!;
    expect(step.title).toBe("FR vest");
    expect(step.body).not.toMatch(/dummy half|DH/);
    expect(step.body).toMatch(/each quarter/);
  });

  it("tells U10 about both vests, rotating each half", () => {
    const step = vestStep("U10")!;
    expect(step.title).toBe("FR & DH vests");
    expect(step.body).toMatch(/each half/);
  });

  it("has no vest step where there are no vests", () => {
    expect(vestStep("U6")).toBeUndefined();
  });
});
