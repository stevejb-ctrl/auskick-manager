// Unit tests for the sport abstraction.
//
// Covers:
//   - registry lookup + defaulting
//   - AFL config reflects the existing AGE_GROUPS data (non-regression)
//   - Netball rules-of-play eligibility
//   - Netball validateLineup catches common mistakes

import { describe, expect, it } from "vitest";
import {
  getSportConfig,
  getBrandForHost,
  getEffectiveQuarterSeconds,
  ALL_SPORT_IDS,
  aflSport,
  netballSport,
  rugbyLeagueSport,
  isPositionAllowedInZone,
} from "@/lib/sports";
import { getBrandCopy } from "@/lib/sports/brand-copy";

describe("sport registry", () => {
  it("returns AFL by default for unknown / missing sport", () => {
    expect(getSportConfig(null)).toBe(aflSport);
    expect(getSportConfig(undefined)).toBe(aflSport);
    expect(getSportConfig("unknown")).toBe(aflSport);
  });

  it("returns the correct config for each registered sport", () => {
    expect(getSportConfig("afl")).toBe(aflSport);
    expect(getSportConfig("netball")).toBe(netballSport);
    expect(getSportConfig("rugby_league")).toBe(rugbyLeagueSport);
  });

  it("ALL_SPORT_IDS includes afl, netball, and rugby_league", () => {
    expect(ALL_SPORT_IDS).toContain("afl");
    expect(ALL_SPORT_IDS).toContain("netball");
    expect(ALL_SPORT_IDS).toContain("rugby_league");
  });

  it("resolves brand from host header", () => {
    expect(getBrandForHost("sirenfooty.com.au")).toBe(aflSport);
    expect(getBrandForHost("sirennetball.com.au")).toBe(netballSport);
    expect(getBrandForHost("www.sirennetball.com.au")).toBe(netballSport);
    // Port suffix stripped.
    expect(getBrandForHost("sirennetball.com.au:3000")).toBe(netballSport);
    // Unknown hosts fall back to AFL.
    expect(getBrandForHost("localhost:3000")).toBe(aflSport);
  });
});

describe("AFL sport config", () => {
  it("has 10 age groups (U8-U17)", () => {
    expect(aflSport.ageGroups).toHaveLength(10);
    expect(aflSport.ageGroups[0].id).toBe("U8");
    expect(aflSport.ageGroups[9].id).toBe("U17");
  });

  it("uses rolling substitution and quarters", () => {
    expect(aflSport.substitutionRule).toBe("rolling");
    expect(aflSport.periodLabel).toBe("quarter");
  });

  it("has 4 score types (goal/behind × us/them)", () => {
    expect(aflSport.scoreTypes).toHaveLength(4);
    expect(aflSport.scoreTypes.find((s) => s.id === "goal")?.points).toBe(6);
    expect(aflSport.scoreTypes.find((s) => s.id === "behind")?.points).toBe(1);
  });

  it("U10 uses 3 zones, U13 uses 5", () => {
    const u10 = aflSport.ageGroups.find((a) => a.id === "U10");
    const u13 = aflSport.ageGroups.find((a) => a.id === "U13");
    expect(u10?.positions).toEqual(["back", "mid", "fwd"]);
    expect(u13?.positions).toEqual(["back", "hback", "mid", "hfwd", "fwd"]);
  });
});

describe("netball sport config", () => {
  it("has 7 positions: GS/GA/WA/C/WD/GD/GK", () => {
    expect(netballSport.allPositions.map((p) => p.id)).toEqual([
      "gs", "ga", "wa", "c", "wd", "gd", "gk",
    ]);
  });

  it("uses period-break-only subs", () => {
    expect(netballSport.substitutionRule).toBe("period-break-only");
  });

  it("is goals-only scoring (1 point)", () => {
    expect(netballSport.scoreTypes).toHaveLength(2);
    expect(netballSport.scoreTypes[0].points).toBe(1);
  });

  it("uses position-count-per-game fairness", () => {
    expect(netballSport.fairnessModel).toBe("position-count-per-game");
  });

  it("NetSetGO Set uses 5-a-side without wings", () => {
    const set = netballSport.ageGroups.find((a) => a.id === "set");
    expect(set?.defaultOnFieldSize).toBe(5);
    expect(set?.positions).toEqual(["gs", "ga", "c", "gd", "gk"]);
  });

  it("Open uses full 7 positions", () => {
    const open = netballSport.ageGroups.find((a) => a.id === "open");
    expect(open?.defaultOnFieldSize).toBe(7);
    expect(open?.positions).toHaveLength(7);
  });

  it("declares the netball palette key + sirennetball.com.au host", () => {
    // The marketing CSS-variable theming layer keys off
    // brand.palette and brand.host. If either drifts (rename, host
    // change, etc.) the netball domain's court-blue ladder won't
    // apply and the site silently falls back to AFL field-green.
    expect(netballSport.brand.palette).toBe("netball");
    expect(netballSport.brand.host).toBe("sirennetball.com.au");
    expect(netballSport.brand.id).toBe("netball");
  });
});

describe("brand-aware marketing copy", () => {
  it("returns the netball product name + hero eyebrow + trust band", () => {
    const copy = getBrandCopy("netball");
    expect(copy.productName).toBe("Siren Netball");
    expect(copy.heroEyebrow).toBe("Built for junior netball");
    // Banner is shared (Free for the entire 2026 season) but
    // structurally needs to be a {prefix, linkText} pair on
    // both brands so MarketingBanner can render it.
    expect(copy.banner.prefix.length).toBeGreaterThan(0);
    expect(copy.banner.linkText.length).toBeGreaterThan(0);
    // Trust band is a non-empty array on both brands.
    expect(copy.trustBand.length).toBeGreaterThan(0);
  });

  it("returns the AFL product name + hero eyebrow", () => {
    const copy = getBrandCopy("afl");
    expect(copy.productName).toBe("Siren Footy");
    expect(copy.heroEyebrow).toBe("Built for junior AFL");
  });
});

describe("netball rules of play — isPositionAllowedInZone", () => {
  it("GS may only enter attack third + attack goal circle", () => {
    expect(isPositionAllowedInZone("gs", "attack-third")).toBe(true);
    expect(isPositionAllowedInZone("gs", "attack-circle")).toBe(true);
    expect(isPositionAllowedInZone("gs", "centre-third")).toBe(false);
    expect(isPositionAllowedInZone("gs", "defence-third")).toBe(false);
    expect(isPositionAllowedInZone("gs", "defence-circle")).toBe(false);
  });

  it("WA enters attack + centre third but NOT the goal circle", () => {
    expect(isPositionAllowedInZone("wa", "attack-third")).toBe(true);
    expect(isPositionAllowedInZone("wa", "centre-third")).toBe(true);
    expect(isPositionAllowedInZone("wa", "attack-circle")).toBe(false);
  });

  it("Centre covers all three thirds but neither goal circle", () => {
    expect(isPositionAllowedInZone("c", "attack-third")).toBe(true);
    expect(isPositionAllowedInZone("c", "centre-third")).toBe(true);
    expect(isPositionAllowedInZone("c", "defence-third")).toBe(true);
    expect(isPositionAllowedInZone("c", "attack-circle")).toBe(false);
    expect(isPositionAllowedInZone("c", "defence-circle")).toBe(false);
  });

  it("GK mirrors GS — defence third + defence circle only", () => {
    expect(isPositionAllowedInZone("gk", "defence-third")).toBe(true);
    expect(isPositionAllowedInZone("gk", "defence-circle")).toBe(true);
    expect(isPositionAllowedInZone("gk", "centre-third")).toBe(false);
    expect(isPositionAllowedInZone("gk", "attack-third")).toBe(false);
  });
});

describe("netball validateLineup", () => {
  const openAge = netballSport.ageGroups.find((a) => a.id === "open")!;

  it("rejects a lineup with missing positions", () => {
    const result = netballSport.validateLineup!(
      {
        positions: { gs: ["p1"], ga: ["p2"] },
        bench: [],
      },
      openAge,
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.positionId === "wa")).toBe(true);
  });

  it("rejects a lineup with two players in the same position", () => {
    const result = netballSport.validateLineup!(
      {
        positions: {
          gs: ["p1", "p2"],
          ga: ["p3"], wa: ["p4"], c: ["p5"], wd: ["p6"], gd: ["p7"], gk: ["p8"],
        },
        bench: [],
      },
      openAge,
    );
    expect(result.ok).toBe(false);
    expect(result.issues.find((i) => i.positionId === "gs")?.message).toMatch(/more than one/i);
  });

  it("accepts a valid full-7 lineup", () => {
    const result = netballSport.validateLineup!(
      {
        positions: {
          gs: ["p1"], ga: ["p2"], wa: ["p3"], c: ["p4"], wd: ["p5"], gd: ["p6"], gk: ["p7"],
        },
        bench: ["p8", "p9"],
      },
      openAge,
    );
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("rejects a player duplicated across bench and position", () => {
    const result = netballSport.validateLineup!(
      {
        positions: {
          gs: ["p1"], ga: ["p2"], wa: ["p3"], c: ["p4"], wd: ["p5"], gd: ["p6"], gk: ["p7"],
        },
        bench: ["p1"], // p1 is also GS
      },
      openAge,
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.playerId === "p1")).toBe(true);
  });
});

describe("getEffectiveQuarterSeconds", () => {
  const openAge = netballSport.ageGroups.find((a) => a.id === "open")!;

  it("returns the per-team override when set", () => {
    expect(
      getEffectiveQuarterSeconds({ quarter_length_seconds: 480 }, openAge),
    ).toBe(480);
  });

  it("falls back to the age-group default when override is null", () => {
    expect(
      getEffectiveQuarterSeconds({ quarter_length_seconds: null }, openAge),
    ).toBe(openAge.periodSeconds);
  });

  it("per-game override wins over team override and age-group default", () => {
    expect(
      getEffectiveQuarterSeconds(
        { quarter_length_seconds: 480 },
        openAge,
        { quarter_length_seconds: 360 },
      ),
    ).toBe(360);
  });

  it("game = null falls through to team override", () => {
    expect(
      getEffectiveQuarterSeconds(
        { quarter_length_seconds: 480 },
        openAge,
        { quarter_length_seconds: null },
      ),
    ).toBe(480);
  });

  it("game = null and team = null falls through to age-group default", () => {
    expect(
      getEffectiveQuarterSeconds(
        { quarter_length_seconds: null },
        openAge,
        { quarter_length_seconds: null },
      ),
    ).toBe(openAge.periodSeconds);
  });
});

describe("rugby league sport config", () => {
  it("has 7 age groups (U6-U12)", () => {
    expect(rugbyLeagueSport.ageGroups).toHaveLength(7);
    expect(rugbyLeagueSport.ageGroups.map((a) => a.id)).toEqual([
      "U6", "U7", "U8", "U9", "U10", "U11", "U12",
    ]);
  });

  it("uses rolling subs (like AFL) and the unbroken-period fairness model", () => {
    expect(rugbyLeagueSport.substitutionRule).toBe("rolling");
    expect(rugbyLeagueSport.fairnessModel).toBe("unbroken-period");
  });

  it("scoring: try=4, conversion=2 (us + opponent)", () => {
    expect(rugbyLeagueSport.scoreTypes).toHaveLength(4);
    expect(rugbyLeagueSport.scoreTypes.find((s) => s.id === "try")?.points).toBe(4);
    expect(rugbyLeagueSport.scoreTypes.find((s) => s.id === "conversion")?.points).toBe(2);
    expect(rugbyLeagueSport.scoreTypes.find((s) => s.id === "opponent_try")?.opponent).toBe(true);
    expect(rugbyLeagueSport.scoreTypes.find((s) => s.id === "opponent_conversion")?.opponent).toBe(true);
  });

  it("is positionless — one zone, one position", () => {
    expect(rugbyLeagueSport.zones).toHaveLength(1);
    expect(rugbyLeagueSport.zones[0].id).toBe("field");
    expect(rugbyLeagueSport.allPositions).toHaveLength(1);
    expect(rugbyLeagueSport.allPositions[0].id).toBe("player");
  });

  it("U6 + U7 disable scoring and kicking; U8+ enable both", () => {
    const u6 = rugbyLeagueSport.ageGroups.find((a) => a.id === "U6")!;
    const u7 = rugbyLeagueSport.ageGroups.find((a) => a.id === "U7")!;
    const u8 = rugbyLeagueSport.ageGroups.find((a) => a.id === "U8")!;
    expect(u6.tracksScoreDefault).toBe(false);
    expect(u6.kickingAllowed).toBe(false);
    expect(u7.tracksScoreDefault).toBe(false);
    expect(u7.kickingAllowed).toBe(false);
    expect(u8.tracksScoreDefault).toBe(true);
    expect(u8.kickingAllowed).toBe(true);
  });

  it("vest requirements step up across ages (none → FR → FR+DH)", () => {
    const u6 = rugbyLeagueSport.ageGroups.find((a) => a.id === "U6")!;
    const u8 = rugbyLeagueSport.ageGroups.find((a) => a.id === "U8")!;
    const u9 = rugbyLeagueSport.ageGroups.find((a) => a.id === "U9")!;
    const u12 = rugbyLeagueSport.ageGroups.find((a) => a.id === "U12")!;
    expect(u6.vestRequirements).toBeUndefined();
    expect(u8.vestRequirements).toEqual({ fr: true, dh: false });
    expect(u9.vestRequirements).toEqual({ fr: true, dh: true });
    expect(u12.vestRequirements).toEqual({ fr: true, dh: true });
  });

  it("U6-U9 use quarters; U10-U12 use halves", () => {
    const u6 = rugbyLeagueSport.ageGroups.find((a) => a.id === "U6")!;
    const u9 = rugbyLeagueSport.ageGroups.find((a) => a.id === "U9")!;
    const u10 = rugbyLeagueSport.ageGroups.find((a) => a.id === "U10")!;
    const u12 = rugbyLeagueSport.ageGroups.find((a) => a.id === "U12")!;
    expect(u6.periodCount).toBe(4);
    expect(u6.periodLabel).toBe("quarter");
    expect(u6.periodSeconds).toBe(8 * 60);
    expect(u9.periodCount).toBe(4);
    expect(u9.periodLabel).toBe("quarter");
    expect(u10.periodCount).toBe(2);
    expect(u10.periodLabel).toBe("half");
    expect(u10.periodSeconds).toBe(20 * 60);
    expect(u12.periodCount).toBe(2);
    expect(u12.periodLabel).toBe("half");
  });

  it("min unbroken periods: 2 for U6-U9, 1 for U10-U12", () => {
    const u6 = rugbyLeagueSport.ageGroups.find((a) => a.id === "U6")!;
    const u9 = rugbyLeagueSport.ageGroups.find((a) => a.id === "U9")!;
    const u10 = rugbyLeagueSport.ageGroups.find((a) => a.id === "U10")!;
    const u12 = rugbyLeagueSport.ageGroups.find((a) => a.id === "U12")!;
    expect(u6.minUnbrokenPeriods).toBe(2);
    expect(u9.minUnbrokenPeriods).toBe(2);
    expect(u10.minUnbrokenPeriods).toBe(1);
    expect(u12.minUnbrokenPeriods).toBe(1);
  });

  it("on-field bounds: 6 at U6/U7, 8 at U8/U9, 11 at U10/U11, 13 at U12", () => {
    expect(rugbyLeagueSport.ageGroups.find((a) => a.id === "U6")?.defaultOnFieldSize).toBe(6);
    expect(rugbyLeagueSport.ageGroups.find((a) => a.id === "U7")?.defaultOnFieldSize).toBe(6);
    expect(rugbyLeagueSport.ageGroups.find((a) => a.id === "U8")?.defaultOnFieldSize).toBe(8);
    expect(rugbyLeagueSport.ageGroups.find((a) => a.id === "U9")?.defaultOnFieldSize).toBe(8);
    expect(rugbyLeagueSport.ageGroups.find((a) => a.id === "U10")?.defaultOnFieldSize).toBe(11);
    expect(rugbyLeagueSport.ageGroups.find((a) => a.id === "U11")?.defaultOnFieldSize).toBe(11);
    expect(rugbyLeagueSport.ageGroups.find((a) => a.id === "U12")?.defaultOnFieldSize).toBe(13);
  });

  it("brand reuses the AFL palette in v1 (no separate domain yet)", () => {
    expect(rugbyLeagueSport.brand.id).toBe("rugby_league");
    expect(rugbyLeagueSport.brand.palette).toBe("brand");
    expect(rugbyLeagueSport.brand.defaultSport).toBe("rugby_league");
  });
});

describe("rugby league validateLineup", () => {
  const u10 = rugbyLeagueSport.ageGroups.find((a) => a.id === "U10")!;

  it("accepts a valid 11-on-field lineup (5F + 6B)", () => {
    const result = rugbyLeagueSport.validateLineup!(
      {
        forwards: ["p1", "p2", "p3", "p4", "p5"],
        backs: ["p6", "p7", "p8", "p9", "p10", "p11"],
        bench: ["p12", "p13"],
      },
      u10,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects more than maxOnFieldSize on the field", () => {
    const result = rugbyLeagueSport.validateLineup!(
      {
        forwards: ["p1", "p2", "p3", "p4", "p5", "p6"],
        backs: ["p7", "p8", "p9", "p10", "p11", "p12"],
        bench: [],
      },
      u10,
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message.match(/Too many/))).toBe(true);
  });

  it("warns (does not block) below the minimum on-field count", () => {
    const result = rugbyLeagueSport.validateLineup!(
      {
        forwards: ["p1", "p2", "p3"],
        backs: ["p4", "p5", "p6", "p7"],
        bench: [],
      },
      u10,
    );
    expect(result.ok).toBe(true); // warnings don't fail validation
    expect(result.issues.some((i) => i.kind === "warn")).toBe(true);
  });

  it("rejects a player listed in both forwards and bench", () => {
    const result = rugbyLeagueSport.validateLineup!(
      {
        forwards: ["p1", "p2", "p3", "p4", "p5"],
        backs: ["p6", "p7", "p8", "p9", "p10", "p11"],
        bench: ["p1"],
      },
      u10,
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.playerId === "p1")).toBe(true);
  });

  it("rejects a player listed in both forwards and backs", () => {
    const result = rugbyLeagueSport.validateLineup!(
      {
        forwards: ["p1", "p2", "p3", "p4", "p5"],
        backs: ["p1", "p7", "p8", "p9", "p10", "p11"],
        bench: ["p12"],
      },
      u10,
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.playerId === "p1")).toBe(true);
  });

  it("rejects an invalid shape (missing forwards array)", () => {
    const result = rugbyLeagueSport.validateLineup!({ bench: [] }, u10);
    expect(result.ok).toBe(false);
    expect(result.issues[0].message).toMatch(/Invalid lineup shape/);
  });
});
