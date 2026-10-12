import { describe, expect, it } from "vitest";
import { effectivePolicy, effectiveStrategy, getSportPlaybook } from "@/lib/playbook";
import { defaultAflPositions } from "@/lib/sports/afl/playbook";
import { leagueCatalogue } from "@/lib/sports/rugby_league/playbook";

describe("AFL age policy (Steve, 12 Oct: zones end at U10, 50 % floor)", () => {
  it("zones U8–U10, open from U11", () => {
    expect(effectivePolicy("afl", "U8").zonesEnforced).toBe(true);
    expect(effectivePolicy("afl", "U10").zonesEnforced).toBe(true);
    expect(effectivePolicy("afl", "U11").zonesEnforced).toBe(false);
    expect(effectivePolicy("afl", "U16 Girls").zonesEnforced).toBe(false);
  });

  it("lets a league zone longer or shorter, and records the override", () => {
    const zonedU11 = effectivePolicy("afl", "U11", { zonesEnforced: true });
    expect(zonedU11.zonesEnforced).toBe(true);
    expect(zonedU11.overridden).toEqual(["zonesEnforced"]);
    expect(effectivePolicy("afl", "U10", { zonesEnforced: false }).zonesEnforced).toBe(false);
  });

  it("defaults the game-time floor to 50 % and clamps a league figure to 50–75 %", () => {
    expect(effectivePolicy("afl", "U12").minGameTimePct).toBe(50);
    expect(effectivePolicy("afl", "U12", { minGameTimePct: 60 }).minGameTimePct).toBe(60);
    expect(effectivePolicy("afl", "U12", { minGameTimePct: 90 }).minGameTimePct).toBe(75);
    expect(effectivePolicy("afl", "U12", { minGameTimePct: 20 }).minGameTimePct).toBe(50);
    expect(getSportPlaybook("afl").agePolicy("U12").minGameTimePct.locked).toBe(true);
  });

  it("shows positions only once zones stop", () => {
    const afl = getSportPlaybook("afl");
    expect(afl.positionModel(effectivePolicy("afl", "U9"), 9).kind).toBe("none");
    const open = afl.positionModel(effectivePolicy("afl", "U14"), 15);
    expect(open.kind).toBe("custom");
    expect(open.canRename).toBe(true);
    expect(open.defaults).toHaveLength(15);
  });

  it("offers zone strategies at zoned ages and position strategies after", () => {
    const afl = getSportPlaybook("afl");
    expect(afl.strategies(effectivePolicy("afl", "U9")).map((s) => s.id)).toEqual([
      "suggested",
      "rotate",
      "keep",
      "manual",
    ]);
    expect(afl.strategies(effectivePolicy("afl", "U12")).map((s) => s.id)).toEqual([
      "free",
      "preferred-lines",
      "set-positions",
    ]);
    expect(afl.recommendedStrategy(effectivePolicy("afl", "U12"))).toBe("preferred-lines");
    expect(afl.recommendedStrategy(effectivePolicy("afl", "U14"))).toBe("set-positions");
  });
});

describe("AFL default formations (UX plan §7.3)", () => {
  const labelsByLine = (n: number) => {
    const out: Record<string, string[]> = { forward: [], centre: [], back: [] };
    for (const p of defaultAflPositions(n)) out[p.line].push(p.label);
    return out;
  };

  it("matches the confirmed 18, 16, 15 and 12 formations", () => {
    expect(labelsByLine(18)).toEqual({
      forward: ["FP", "FF", "FP", "HFF", "CHF", "HFF"],
      centre: ["W", "C", "W", "R", "RR", "ROV"],
      back: ["HBF", "CHB", "HBF", "BP", "FB", "BP"],
    });
    expect(labelsByLine(16).centre).toEqual(["C", "R", "RR", "ROV"]);
    expect(labelsByLine(15).back).toEqual(["CHB", "HBF", "BP", "FB", "BP"]);
    expect(labelsByLine(12)).toEqual({
      forward: ["FP", "FF", "FP", "CHF"],
      centre: ["W", "C", "R", "RR"],
      back: ["CHB", "BP", "FB", "BP"],
    });
  });

  it("gives every position a unique key and places lines attacking up", () => {
    for (const n of [9, 12, 13, 15, 16, 17, 18]) {
      const ps = defaultAflPositions(n);
      expect(ps).toHaveLength(n);
      expect(new Set(ps.map((p) => p.key)).size).toBe(n);
    }
    const ps = defaultAflPositions(18);
    const avgY = (line: string) =>
      ps.filter((p) => p.line === line).reduce((a, p) => a + p.y, 0) / 6;
    expect(avgY("forward")).toBeLessThan(avgY("centre"));
    expect(avgY("centre")).toBeLessThan(avgY("back"));
  });
});

describe("netball", () => {
  it("keeps the bibs fixed and offers every rotation style", () => {
    const netball = getSportPlaybook("netball");
    const model = netball.positionModel(effectivePolicy("netball", "go"), 7);
    expect(model.kind).toBe("fixed");
    expect(model.canRename).toBe(false);
    expect(model.defaults.map((p) => p.label)).toEqual(["GS", "GA", "WA", "C", "WD", "GD", "GK"]);
    expect(netball.positionModel(effectivePolicy("netball", "set"), 5).defaults).toHaveLength(5);
    expect(netball.strategies(effectivePolicy("netball", "go")).map((s) => s.id)).toEqual([
      "by-thirds",
      "position-by-position",
      "position-cycle",
      "partners",
      "set-positions",
    ]);
  });

  it("has no zones to override", () => {
    expect(effectivePolicy("netball", "go", { zonesEnforced: true }).zonesEnforced).toBe(false);
  });
});

describe("rugby league", () => {
  it("adds named positions from the catalogue in Mod League only", () => {
    const league = getSportPlaybook("rugby_league");
    expect(league.positionModel(effectivePolicy("rugby_league", "U8"), 8).kind).toBe("none");
    expect(league.strategies(effectivePolicy("rugby_league", "U8")).map((s) => s.id)).toEqual([
      "both-lines",
      "preferred-line",
    ]);
    const u12 = league.positionModel(effectivePolicy("rugby_league", "U12"), 13);
    expect(u12.kind).toBe("catalogue");
    expect(u12.canRename).toBe(false);
    expect(u12.defaults.map((p) => p.label)).toEqual([
      "PR", "HK", "PR", "2R", "2R", "LK", "FB", "HB", "5/8", "CE", "CE", "WG", "WG",
    ]);
  });

  it("carries vests and §6 unbroken periods from the age config", () => {
    const u9 = effectivePolicy("rugby_league", "U9");
    expect(u9.vests).toEqual({ fr: true, dh: true });
    expect(u9.minUnbrokenPeriods).toBe(2);
    expect(effectivePolicy("rugby_league", "U11").minUnbrokenPeriods).toBe(1);
  });

  it("builds an 11-a-side catalogue with unique keys", () => {
    const ps = leagueCatalogue(11, 5);
    expect(ps).toHaveLength(11);
    expect(new Set(ps.map((p) => p.key)).size).toBe(11);
  });
});

describe("effectiveStrategy", () => {
  it("keeps today's behaviour for a team that hasn't chosen", () => {
    expect(effectiveStrategy("afl", effectivePolicy("afl", "U9"), null).id).toBe("suggested");
    expect(effectiveStrategy("afl", effectivePolicy("afl", "U14"), null).id).toBe("free");
    expect(effectiveStrategy("netball", effectivePolicy("netball", "go"), null).id).toBe("by-thirds");
    expect(effectiveStrategy("rugby_league", effectivePolicy("rugby_league", "U9"), null).id).toBe(
      "preferred-line",
    );
  });

  it("drops a saved strategy the policy no longer allows", () => {
    const zoned = effectivePolicy("afl", "U12", { zonesEnforced: true });
    expect(effectiveStrategy("afl", zoned, "set-positions").id).toBe("suggested");
    expect(effectiveStrategy("afl", effectivePolicy("afl", "U12"), "set-positions").id).toBe(
      "set-positions",
    );
  });
});
