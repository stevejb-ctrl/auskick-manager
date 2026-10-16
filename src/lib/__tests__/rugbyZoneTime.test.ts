// Rugby's zone-time bar has a centre only where a vest is worn
// (Stagehand sideline-chaos-union, 16 Oct 2026: union's settings said
// "Centre = time wearing the FR or DH vest").

import { describe, expect, it } from "vitest";
import { centreVest } from "@/lib/sports/rugby/zoneTime";
import { getAgeGroupConfig, rugbyUnionSport } from "@/lib/sports";

describe("centreVest", () => {
  it("is no vest in any union grade", () => {
    for (const ag of rugbyUnionSport.ageGroups) expect(centreVest(ag.vestRequirements), ag.id).toBeNull();
  });

  it("names the vests each league grade wears", () => {
    expect(centreVest(getAgeGroupConfig("rugby_league", "U6").vestRequirements)).toBeNull();
    expect(centreVest(getAgeGroupConfig("rugby_league", "U8").vestRequirements)).toBe("the FR vest");
    expect(centreVest(getAgeGroupConfig("rugby_league", "U10").vestRequirements)).toBe("the FR or DH vest");
  });
});
