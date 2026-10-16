import { describe, expect, it } from "vitest";
import { effectivePolicy, effectiveStrategy, getSportPlaybook } from "@/lib/playbook";
import { AFL_LINES, defaultAflPositions } from "@/lib/sports/afl/playbook";
import { leagueCatalogue } from "@/lib/sports/rugby_league/playbook";
import { playbookSnapshot, resolveTeamPlaybook, sanitizeOverrides } from "@/lib/playbook/team";
import { resetToDefaults, sparsestLine, toDraft } from "@/lib/playbook/positions";
import {
  describeRole,
  normaliseRole,
  prefsFromRole,
  roleModelFor,
  rolesFromPrefs,
} from "@/lib/playbook/roles";

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

  it("AFL season balance says what it does: lines, even with set positions", () => {
    // The AFL engine evens out time by line; per-position time isn't
    // counted, so the control mustn't promise "each position".
    const afl = getSportPlaybook("afl");
    const units = afl.strategies(effectivePolicy("afl", "U14")).map((s) => s.balanceUnit);
    expect(units).toEqual(["line", "line", "line"]);
  });
});

describe("AFL default formations (UX plan §7.3)", () => {
  const labelsByLine = (n: number) => {
    const out: Record<string, string[]> = { fwd: [], mid: [], back: [] };
    for (const p of defaultAflPositions(n)) out[p.line].push(p.label);
    return out;
  };

  it("matches the confirmed 18, 16, 15 and 12 formations", () => {
    expect(labelsByLine(18)).toEqual({
      fwd: ["LFP", "FF", "RFP", "LHF", "CHF", "RHF"],
      mid: ["LW", "C", "RW", "R", "RR", "ROV"],
      back: ["LHB", "CHB", "RHB", "LBP", "FB", "RBP"],
    });
    expect(labelsByLine(16).mid).toEqual(["C", "R", "RR", "ROV"]);
    expect(labelsByLine(15).back).toEqual(["CHB", "HBF", "LBP", "FB", "RBP"]);
    expect(labelsByLine(12)).toEqual({
      fwd: ["LFP", "FF", "RFP", "CHF"],
      mid: ["W", "C", "R", "RR"],
      back: ["CHB", "LBP", "FB", "RBP"],
    });
  });

  it("names every position on its own: pairs become left and right as drawn", () => {
    for (const n of [9, 12, 13, 15, 16, 17, 18]) {
      const ps = defaultAflPositions(n);
      expect(new Set(ps.map((p) => p.label)).size).toBe(n);
      expect(new Set(ps.map((p) => p.name)).size).toBe(n);
      for (const p of ps) {
        if (p.label.startsWith("L") && ps.some((q) => q.label === `R${p.label.slice(1)}`)) {
          expect(p.x).toBeLessThan(ps.find((q) => q.label === `R${p.label.slice(1)}`)!.x);
        }
      }
    }
    const fp = defaultAflPositions(18).filter((p) => p.label.endsWith("FP"));
    expect(fp.map((p) => [p.key, p.label, p.name])).toEqual([
      ["fp1", "LFP", "Left forward pocket"],
      ["fp2", "RFP", "Right forward pocket"],
    ]);
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
    expect(avgY("fwd")).toBeLessThan(avgY("mid"));
    expect(avgY("mid")).toBeLessThan(avgY("back"));
  });

  it("lays rows out like the field: short rows sit nearest the centre", () => {
    const rows = (line: string) => {
      const byY = new Map<number, string[]>();
      for (const p of defaultAflPositions(12).filter((q) => q.line === line)) {
        byY.set(p.y, [...(byY.get(p.y) ?? []), p.label]);
      }
      return Array.from(byY.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, l]) => l);
    };
    expect(rows("fwd")).toEqual([["LFP", "FF", "RFP"], ["CHF"]]);
    expect(rows("mid")).toEqual([["W", "C"], ["R", "RR"]]);
    expect(rows("back")).toEqual([["CHB"], ["LBP", "FB", "RBP"]]);
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
    // The standard catalogue seeds the list and the coach may edit it
    // (Steve 2026-10-16: create a rugby team's preferred positions).
    expect(u12.kind).toBe("custom");
    expect(u12.canRename).toBe(true);
    expect(u12.canAddRemove).toBe(true);
    // Pairs are left and right as drawn, so every position is its own.
    expect(u12.defaults.map((p) => p.label)).toEqual([
      "LPR", "HK", "RPR", "L2R", "R2R", "LK", "FB", "HB", "5/8", "LCE", "RCE", "RWG", "LWG",
    ]);
    expect(u12.defaults.find((p) => p.label === "LPR")?.name).toBe("Left prop");
  });

  it("U13 and up (international laws) get named positions too, and lean to them", () => {
    const league = getSportPlaybook("rugby_league");
    const u15 = effectivePolicy("rugby_league", "U15");
    expect(league.positionModel(u15, 13).kind).toBe("custom");
    expect(league.positionModel(u15, 13).defaults).toHaveLength(13);
    expect(league.strategies(u15).map((s) => s.id)).toContain("named-positions");
    expect(league.recommendedStrategy(u15)).toBe("named-positions");
    // No vests and no unbroken-period law past the junior laws.
    expect(u15.vests).toEqual({ fr: false, dh: false });
    expect(u15.minUnbrokenPeriods).toBe(0);
  });

  it("carries vests and §6 unbroken periods from the age config", () => {
    const u9 = effectivePolicy("rugby_league", "U9");
    expect(u9.vests).toEqual({ fr: true, dh: true });
    expect(u9.minUnbrokenPeriods).toBe(2);
    expect(effectivePolicy("rugby_league", "U11").minUnbrokenPeriods).toBe(1);
  });

  // The engines read the age group's §6 count, and the team's on/off
  // switch is the control (cross-sport audit, 14 Oct 2026): a count
  // override would show a rule nothing enforces.
  it("keeps the §6 count the laws' own", () => {
    const u9 = effectivePolicy("rugby_league", "U9", { minUnbrokenPeriods: 0 });
    expect(u9.minUnbrokenPeriods).toBe(2);
    expect(u9.overridden).not.toContain("minUnbrokenPeriods");
  });

  it("builds an 11-a-side catalogue with unique keys", () => {
    const ps = leagueCatalogue(11, 5);
    expect(ps).toHaveLength(11);
    expect(new Set(ps.map((p) => p.key)).size).toBe(11);
  });

  // Steve 2026-10-16: a new rugby team choosing "Named positions"
  // couldn't create its own — resolve only honoured AFL's saved rows
  // and the model refused edits. The team's rows now win, laid out on
  // rugby's own lines.
  it("resolves a league team's own saved positions, laid out on the pitch", () => {
    const r = resolveTeamPlaybook({
      sport: "rugby_league",
      ageGroup: "U12",
      onFieldSize: 13,
      row: { strategy: "named-positions", policy_overrides: {}, season_balance: null, season_balance_since: null },
      positions: [
        { id: "a1", label: "PR", name: "Prop", line: "forwards", sort: 0, archived_at: null },
        { id: "a2", label: "HK", name: null, line: "forwards", sort: 1, archived_at: null },
        { id: "a3", label: "HB", name: "Halfback", line: "backs", sort: 2, archived_at: null },
        { id: "a4", label: "OLD", name: "Archived", line: "backs", sort: 3, archived_at: "2026-10-01" },
      ],
    });
    expect(r.customPositions).toBe(true);
    expect(r.positions.map((p) => p.label)).toEqual(["PR", "HK", "HB"]);
    // The sport's standard name fills a missing one.
    expect(r.positions.find((p) => p.label === "HK")?.name).toBe("Hooker");
    // Forwards sit in the top band, backs in the lower, on 0–1 coords.
    const hb = r.positions.find((p) => p.label === "HB")!;
    const pr = r.positions.find((p) => p.label === "PR")!;
    expect(pr.y).toBeLessThan(0.5);
    expect(hb.y).toBeGreaterThan(0.5);
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

describe("a team's How we play, resolved", () => {
  it("plays today's behaviour until the coach chooses", () => {
    const r = resolveTeamPlaybook({ sport: "afl", ageGroup: "U12", onFieldSize: 15, row: null });
    expect(r.strategy.id).toBe("free");
    expect(r.recommendedId).toBe("preferred-lines");
    expect(r.seasonBalance).toBe("balanced");
    expect(r.positionModel.kind).toBe("custom");
    expect(r.positions).toHaveLength(15);
    expect(r.customPositions).toBe(false);
  });

  it("falls back when zones come back on and the saved strategy no longer fits", () => {
    const r = resolveTeamPlaybook({
      sport: "afl",
      ageGroup: "U12",
      onFieldSize: 15,
      row: {
        strategy: "set-positions",
        policy_overrides: { zonesEnforced: true },
        season_balance: null,
        season_balance_since: null,
      },
    });
    expect(r.policy.zonesEnforced).toBe(true);
    expect(r.strategy.id).toBe("suggested");
    expect(r.savedStrategy).toBe("set-positions");
    expect(r.positionModel.kind).toBe("none");
  });

  it("switches season balance off for set positions unless the coach turns it on", () => {
    const base = { sport: "afl" as const, ageGroup: "U14", onFieldSize: 18 };
    const row = { policy_overrides: {}, season_balance_since: null, strategy: "set-positions" };
    expect(resolveTeamPlaybook({ ...base, row: { ...row, season_balance: null } }).seasonBalance).toBe("off");
    expect(resolveTeamPlaybook({ ...base, row: { ...row, season_balance: "light" } }).seasonBalance).toBe("light");
  });

  it("uses the team's own positions, laid out by line", () => {
    const r = resolveTeamPlaybook({
      sport: "afl",
      ageGroup: "U13",
      onFieldSize: 4,
      row: null,
      positions: [
        { id: "p2", label: "KEY", name: null, line: "fwd", sort: 1, archived_at: null },
        { id: "p1", label: "FB", name: null, line: "back", sort: 0, archived_at: null },
        { id: "p3", label: "OLD", name: null, line: "mid", sort: 2, archived_at: "2026-01-01" },
      ],
    });
    expect(r.customPositions).toBe(true);
    expect(r.positions.map((p) => [p.key, p.label, p.name])).toEqual([
      ["p2", "KEY", "KEY"],
      ["p1", "FB", "Full back"],
    ]);
  });

  it("stores only overrides the age policy allows, clamped to the band", () => {
    expect(sanitizeOverrides("afl", "U12", { minGameTimePct: 90, zonesEnforced: false })).toEqual({
      minGameTimePct: 75,
    });
    expect(sanitizeOverrides("afl", "U12", { minGameTimePct: 50 })).toEqual({});
    expect(sanitizeOverrides("netball", "11u", { zonesEnforced: true })).toEqual({});
  });

  it("freezes the policy, strategy and positions for kickoff", () => {
    const r = resolveTeamPlaybook({ sport: "netball", ageGroup: "go", onFieldSize: 7, row: null });
    const snap = playbookSnapshot(r, new Date("2026-10-12T09:00:00Z"));
    expect(snap.strategy).toBe("by-thirds");
    expect(snap.positions.map((p) => p.label)).toEqual(["GS", "GA", "WA", "C", "WD", "GD", "GK"]);
    expect(snap.takenAt).toBe("2026-10-12T09:00:00.000Z");
  });
});

describe("positions editor helpers", () => {
  const defaults = defaultAflPositions(12).map(toDraft);

  it("keeps a saved position's id when reset finds the same label", () => {
    const saved = [
      { key: "uuid-chb", label: "CHB", name: "", line: "back" as const },
      { key: "uuid-key", label: "KEY", name: "Key back", line: "back" as const },
    ];
    const reset = resetToDefaults(saved, defaults);
    expect(reset).toHaveLength(12);
    expect(reset.find((p) => p.label === "CHB")?.key).toBe("uuid-chb");
    expect(reset.some((p) => p.key === "uuid-key")).toBe(false);
    expect(reset.find((p) => p.label === "FF")?.key).toBe("ff");
  });

  it("adds new positions to the thinnest line", () => {
    const noForwards = defaults.filter((p) => p.line !== "fwd");
    expect(sparsestLine(noForwards, AFL_LINES)).toBe("fwd");
  });
});

describe("player roles", () => {
  const resolve = (sport: "afl" | "netball" | "rugby_league", ageGroup: string, strategy: string | null) =>
    resolveTeamPlaybook({
      sport,
      ageGroup,
      onFieldSize: sport === "netball" ? 7 : 15,
      row: { strategy, policy_overrides: {}, season_balance: null, season_balance_since: null },
    });

  it("has no roles at AFL zoned ages", () => {
    expect(roleModelFor(resolve("afl", "U9", null))).toBeNull();
  });

  it("uses positions for set positions and partners, lines otherwise", () => {
    const set = roleModelFor(resolve("afl", "U14", "set-positions"))!;
    expect(set.unit).toBe("position");
    expect(set.home).toBe(true);
    expect(set.options).toHaveLength(15);

    const preferred = roleModelFor(resolve("afl", "U12", "preferred-lines"))!;
    expect(preferred).toMatchObject({ unit: "line", home: true });
    expect(preferred.options.map((o) => o.key)).toEqual(["fwd", "mid", "back"]);

    expect(roleModelFor(resolve("afl", "U12", "free"))).toMatchObject({ unit: "line", home: false });
    expect(roleModelFor(resolve("netball", "13u", "partners"))).toMatchObject({ unit: "position", home: true });
    expect(roleModelFor(resolve("netball", "go", "by-thirds"))!.options.map((o) => o.key)).toEqual([
      "attack-third",
      "centre-third",
      "defence-third",
    ]);
    expect(roleModelFor(resolve("rugby_league", "U12", "preferred-line"))).toMatchObject({ unit: "line", home: true });
  });

  it("round-trips a role through prefs, without overlaps", () => {
    const role = normaliseRole(
      { home: "ff", also: ["chf", "ff", "hff1"], never: ["r", "chf"], keepOn: true },
      ["ff", "chf", "hff1", "r"],
    );
    expect(role).toEqual({ home: "ff", also: ["chf", "hff1"], never: ["r"], keepOn: true });
    const rows = prefsFromRole(role, "position").map((r) => ({ ...r, player_id: "p1" }));
    expect(rolesFromPrefs(rows, "position").p1).toEqual(role);
    // Position prefs don't leak into a line role.
    expect(rolesFromPrefs(rows, "line").p1).toEqual({ home: null, also: [], never: [], keepOn: true });
  });

  it("describes a role in one line", () => {
    const model = roleModelFor(resolve("afl", "U14", "set-positions"))!;
    expect(describeRole({ home: "ff", also: ["chf"], never: ["r"], keepOn: false }, model)).toBe(
      "Home FF · also CHF · not R",
    );
    const lines = roleModelFor(resolve("afl", "U12", "preferred-lines"))!;
    expect(describeRole({ home: "fwd", also: [], never: [], keepOn: true }, lines)).toBe(
      "Prefers Forward · keep on",
    );
  });
});
