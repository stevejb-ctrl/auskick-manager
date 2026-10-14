import { describe, expect, it } from "vitest";
import { resolveTeamPlaybook } from "@/lib/playbook/team";
import {
  activeRules,
  lockedRules,
  newRule,
  ruleCatalogue,
  ruleSentence,
  ruleWords,
  rulesForSport,
  sanitizeRules,
} from "@/lib/playbook/rules";
import { getSportPlaybook } from "@/lib/playbook";
import { RULE_PACKS, applyPackRules, rulePacksFor } from "@/lib/playbook/rulePacks";

const resolve = (sport: "afl" | "netball" | "rugby_league", ageGroup: string, strategy: string | null) =>
  resolveTeamPlaybook({
    sport,
    ageGroup,
    onFieldSize: 12,
    row: { strategy, policy_overrides: {}, season_balance: null, season_balance_since: null },
  });

const names = (ids: string[]) => ids.map((id) => id.toUpperCase()).join(" and ");

describe("rule catalogue (UX plan §7.4)", () => {
  it("offers home rules only where kids have a home", () => {
    const free = ruleCatalogue(resolve("afl", "U12", "free")).map((d) => d.kind);
    expect(free).not.toContain("stays-home");
    const set = ruleCatalogue(resolve("afl", "U14", "set-positions")).map((d) => d.kind);
    expect(set).toContain("stays-home");
    expect(set).toContain("like-for-like");
  });

  it("leaves line rules out at zoned AFL ages and breaks-only out of netball", () => {
    const zoned = ruleCatalogue(resolve("afl", "U9", null)).map((d) => d.kind);
    expect(zoned).not.toContain("every-line-per-game");
    const netball = ruleCatalogue(resolve("netball", "11u", null)).map((d) => d.kind);
    expect(netball).not.toContain("subs-at-breaks");
    expect(netball).toContain("every-line-per-game");
  });

  it("reads as a sentence in the sport's words", () => {
    const words = ruleWords("netball", "quarter", false);
    expect(ruleSentence(newRule("every-line-per-game"), words, names)).toBe(
      "Every player plays each third at least once per game",
    );
    expect(ruleSentence({ ...newRule("max-bench-in-row") }, words, names)).toBe(
      "Nobody sits on the bench 2 quarters in a row",
    );
    const apart = { ...newRule("keep-apart"), params: { playerIds: ["mia", "ava"] } };
    expect(ruleSentence(apart, ruleWords("afl", "quarter", false), names)).toBe("Keep MIA and AVA apart");
  });

  it("shows policy rules locked, with their source", () => {
    const zoned = lockedRules(resolve("afl", "U9", null));
    expect(zoned.map((r) => r.text)).toEqual([
      "Everyone plays at least 50% of the game",
      "Every player rotates through every zone",
      "Even out each player's time in each zone across the season (Balanced)",
    ]);
    const league = lockedRules(resolve("rugby_league", "U8", null));
    expect(league.some((r) => r.id === "unbroken")).toBe(true);
  });
});

// Sports are independent (14 Oct 2026): every rule, word and source
// comes from the team's own sport, and a sport is offered only the
// rules its own engine acts on.
describe("each sport owns its rules", () => {
  it("offers league only what the league engine does (subs at the breaks)", () => {
    for (const strategy of [null, "preferred-line", "named-positions"]) {
      expect(ruleCatalogue(resolve("rugby_league", "U11", strategy)).map((d) => d.kind)).toEqual(["subs-at-breaks"]);
    }
  });

  it("offers netball no like-for-like or breaks-only rule, and AFL no carnival rule", () => {
    for (const strategy of ["position-by-position", "partners", "set-positions"]) {
      const netball = ruleCatalogue(resolve("netball", "11u", strategy)).map((d) => d.kind);
      expect(netball).not.toContain("like-for-like");
      expect(netball).not.toContain("subs-at-breaks");
    }
    for (const strategy of ["free", "preferred-lines", "set-positions"]) {
      expect(ruleCatalogue(resolve("afl", "U14", strategy)).map((d) => d.kind)).not.toContain("every-line-per-day");
    }
  });

  it("drops saved rules the sport doesn't act on", () => {
    const resolved = resolve("rugby_league", "U11", null);
    const kept = rulesForSport([newRule("every-line-per-game"), newRule("subs-at-breaks"), newRule("max-bench-in-row")], resolved);
    expect(kept.map((r) => r.kind)).toEqual(["subs-at-breaks"]);
  });

  it("takes each locked rule's source from the sport, not from a name check", () => {
    const floor = (sport: "afl" | "netball" | "rugby_league", age: string) =>
      lockedRules(resolve(sport, age, null)).find((r) => r.id === "min-game-time")!.source;
    expect(floor("afl", "U12")).toBe("AFL Junior Rules (May 2024)");
    expect(floor("netball", "11u")).toBe("Siren default");
    expect(floor("rugby_league", "U11")).toBe("Siren default");
    const unbroken = lockedRules(resolve("rugby_league", "U8", null)).find((r) => r.id === "unbroken")!;
    expect(unbroken.source).toBe("NRL Junior League Laws §6");
  });

  it("uses the sport's own words", () => {
    expect(ruleWords("netball", "half", false)).toMatchObject({ line: "third", period: "half" });
    expect(ruleWords("rugby_league", "half", false)).toMatchObject({ line: "line", period: "stint" });
    expect(ruleWords("afl", "quarter", true)).toMatchObject({ line: "line", period: "stint", home: "home position" });
  });

  it("has no fallback sport", () => {
    expect(() => getSportPlaybook("rugby_union" as never)).toThrow(/rugby_union/);
  });
});

describe("stored rules", () => {
  it("clamps counts, drops unknown kinds and strangers, keeps one of each single rule", () => {
    const rules = sanitizeRules(
      [
        { id: "a", kind: "max-bench-in-row", params: { count: 9 }, strength: "must", enabled: true },
        { id: "b", kind: "max-bench-in-row", params: { count: 2 }, strength: "must", enabled: true },
        { id: "c", kind: "teleport", params: {}, strength: "must", enabled: true },
        { id: "d", kind: "keep-apart", params: { playerIds: ["p1", "p2", "stranger"] }, strength: "prefer", enabled: true },
        { id: "e", kind: "keep-apart", params: { playerIds: ["p3"] }, strength: "oops", enabled: true },
      ],
      ["p1", "p2", "p3"],
    );
    expect(rules.map((r) => [r.id, r.kind, r.params, r.strength])).toEqual([
      ["a", "max-bench-in-row", { count: 3 }, "must"],
      ["d", "keep-apart", { playerIds: ["p1", "p2"] }, "prefer"],
      ["e", "keep-apart", { playerIds: ["p3"] }, "prefer"],
    ]);
    // A keep-apart with one player isn't a rule yet.
    expect(activeRules(rules).map((r) => r.id)).toEqual(["a", "d"]);
  });
});

describe("local rule packs", () => {
  it("offers packs by sport and age", () => {
    expect(rulePacksFor("afl", "U12").map((p) => p.id)).toEqual(["afl-club-development"]);
    expect(rulePacksFor("afl", "U11").map((p) => p.id)).toEqual(["afl-club-development", "afl-zones-until-u11"]);
    expect(rulePacksFor("afl", "U14")).toEqual([]);
    expect(rulePacksFor("netball", "11u").map((p) => p.id)).toEqual(["netball-association-junior", "netball-carnival-day"]);
  });

  it("replaces rules of the same kind and marks them as local", () => {
    const mine = [{ ...newRule("max-bench-in-row"), params: { count: 3 } }, { ...newRule("keep-apart"), params: { playerIds: ["a", "b"] } }];
    const pack = RULE_PACKS.find((p) => p.id === "afl-club-development")!;
    const next = applyPackRules(mine, pack);
    expect(next.map((r) => [r.kind, r.params.count ?? null, r.source ?? null])).toEqual([
      ["keep-apart", null, null],
      ["every-line-per-game", null, "pack:afl-club-development"],
      ["max-bench-in-row", 2, "pack:afl-club-development"],
    ]);
  });
});
