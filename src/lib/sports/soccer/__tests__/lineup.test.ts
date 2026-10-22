// The soccer lineup: a keeper slot, lines and the bench, and the
// validator that holds it to the age group's rules.

import { describe, expect, it } from "vitest";
import { getAgeGroupConfig, getSportConfig } from "@/lib/sports";
import { SOCCER_RULES } from "@/lib/sports/soccer";
import { FUTSAL_RULES } from "@/lib/sports/futsal";
import { HOCKEY_RULES } from "@/lib/sports/hockey";
import { soccerFamilyAgeGroup } from "@/lib/sports/soccer/family";
import {
  emptySoccerLineup,
  normalizeSoccerLineup,
  soccerOnField,
  soccerOutfield,
  soccerUnitOf,
  validateSoccerLineup,
  type SoccerLineup,
} from "@/lib/sports/soccer/lineup";

function lineup(over: Partial<SoccerLineup> & { def?: string[]; mid?: string[]; att?: string[]; field?: string[] }): SoccerLineup {
  return {
    keeper: over.keeper ?? null,
    lines: { def: over.def ?? [], mid: over.mid ?? [], att: over.att ?? [], field: over.field ?? [] },
    bench: over.bench ?? [],
  };
}

// 7 a side, 2-3-1, with two on the bench.
const SEVEN = lineup({ keeper: "k", def: ["d1", "d2"], mid: ["m1", "m2", "m3"], att: ["a1"], bench: ["b1", "b2"] });

/** Soccer's validator: its words and its lines warning. */
const check = (l: unknown, ag: Parameters<typeof validateSoccerLineup>[1], size?: number) =>
  validateSoccerLineup(l, ag, size, SOCCER_RULES);

const messages = (r: ReturnType<typeof validateSoccerLineup>, kind: "error" | "warn") =>
  r.issues.filter((i) => i.kind === kind).map((i) => i.message);

describe("soccer lineup helpers", () => {
  it("normalises a partial lineup, every line present", () => {
    expect(normalizeSoccerLineup({ keeper: "k", lines: { def: ["a"] }, bench: ["b", 7] })).toEqual({
      keeper: "k",
      lines: { def: ["a"], mid: [], att: [], field: [] },
      bench: ["b"],
    });
    expect(normalizeSoccerLineup(null)).toEqual(emptySoccerLineup());
    expect(normalizeSoccerLineup({ keeper: "" }).keeper).toBeNull();
  });

  it("copies, so a caller can change the result", () => {
    const n = normalizeSoccerLineup(SEVEN);
    n.lines.def.push("x");
    expect(SEVEN.lines.def).toEqual(["d1", "d2"]);
  });

  it("lists the field keeper first, then the lines back to front", () => {
    expect(soccerOutfield(SEVEN)).toEqual(["d1", "d2", "m1", "m2", "m3", "a1"]);
    expect(soccerOnField(SEVEN)).toEqual(["k", "d1", "d2", "m1", "m2", "m3", "a1"]);
    expect(soccerOnField(lineup({ field: ["p1", "p2"] }))).toEqual(["p1", "p2"]);
  });

  it("says where a kid is: in goal, a line, or off the field", () => {
    expect(soccerUnitOf(SEVEN, "k")).toBe("gk");
    expect(soccerUnitOf(SEVEN, "m2")).toBe("mid");
    expect(soccerUnitOf(SEVEN, "b1")).toBeNull();
  });
});

describe("validateSoccerLineup", () => {
  const U9 = soccerFamilyAgeGroup("soccer", "U9");
  const U6 = soccerFamilyAgeGroup("soccer", "U6");

  it("is the sport's own validator, with soccer's words", () => {
    expect(getSportConfig("soccer").validateLineup!(SEVEN, U9)).toEqual(check(SEVEN, U9));
    const bad = { ...SEVEN, lines: { ...SEVEN.lines, att: [], field: ["a1"] } };
    expect(getSportConfig("soccer").validateLineup!(bad, U9)).toEqual(check(bad, U9));
  });

  it("passes a full 7 a side with a keeper", () => {
    expect(check(SEVEN, U9)).toEqual({ ok: true, issues: [] });
    // Through the registry's (base-typed) age group too.
    expect(check(SEVEN, getAgeGroupConfig("soccer", "U9")).ok).toBe(true);
  });

  it("needs a keeper from 7 a side", () => {
    const r = check({ ...SEVEN, keeper: null, lines: { ...SEVEN.lines, att: ["a1", "k"] } }, U9);
    expect(r.ok).toBe(false);
    expect(messages(r, "error")).toEqual(["Nobody is in goal. Pick a keeper."]);
  });

  it("has no keeper and no lines at 4 a side", () => {
    expect(check(lineup({ field: ["a", "b", "c", "d"], bench: ["e"] }), U6)).toEqual({ ok: true, issues: [] });

    const keeper = check(lineup({ keeper: "a", field: ["b", "c", "d"] }), U6);
    expect(messages(keeper, "error")).toEqual(["Under 6 plays without a keeper."]);

    const lines = check(lineup({ def: ["a", "b"], att: ["c", "d"] }), U6);
    expect(messages(lines, "error")).toEqual(["Under 6 plays without lines: everyone is in the field."]);
  });

  it("keeps kids in lines when there's a keeper", () => {
    const r = check({ ...SEVEN, lines: { ...SEVEN.lines, att: [], field: ["a1"] } }, U9);
    expect(messages(r, "error")).toEqual(["With a keeper, kids play in defence, midfield or attack."]);
  });

  it("checks the game's size: too many is an error, short is a warning", () => {
    const eight = check({ ...SEVEN, bench: ["b2"], lines: { ...SEVEN.lines, att: ["a1", "b1"] } }, U9);
    expect(messages(eight, "error")).toEqual(["Too many players on the field (8); this game plays 7."]);

    const six = check({ ...SEVEN, lines: { ...SEVEN.lines, att: [] }, bench: ["a1", "b1", "b2"] }, U9);
    expect(six.ok).toBe(true);
    expect(messages(six, "warn")).toEqual(["6 on the field for a 7-a-side game: playing short."]);

    // The game's own size wins over the age group's default.
    expect(check({ ...SEVEN, lines: { ...SEVEN.lines, att: [] }, bench: ["a1", "b1", "b2"] }, U9, 6)).toEqual({ ok: true, issues: [] });
  });

  it("refuses a kid in two places", () => {
    const r = check({ ...SEVEN, bench: ["b1", "k"] }, U9);
    expect(r.ok).toBe(false);
    expect(r.issues).toContainEqual({ kind: "error", message: "Player is in both goal and the bench.", playerId: "k" });
    const twice = check({ ...SEVEN, lines: { ...SEVEN.lines, def: ["d1", "d1"] } }, U9);
    expect(twice.issues).toContainEqual({ kind: "error", message: "Player listed twice in defence.", playerId: "d1" });
  });

  it("asks for three lines at U12–U13 (Football Victoria), as a warning", () => {
    const U12 = soccerFamilyAgeGroup("soccer", "U12");
    const twoLines = lineup({ keeper: "k", def: ["a", "b", "c", "d"], mid: ["e", "f", "g", "h"] });
    const r = check(twoLines, U12);
    expect(r.ok).toBe(true);
    expect(messages(r, "warn")).toEqual(["Football Victoria's U12–U13 rules ask for at least three lines."]);
    // Not a rule at U14.
    expect(messages(check(twoLines, soccerFamilyAgeGroup("soccer", "U14"), 9), "warn")).toEqual([]);
  });

  it("refuses a malformed lineup or another sport's age group", () => {
    expect(check({ forwards: [], backs: [], bench: [] }, U9)).toEqual({
      ok: false,
      issues: [{ kind: "error", message: "Invalid lineup shape." }],
    });
    expect(check({ ...SEVEN, lines: { def: "d1" } }, U9).ok).toBe(false);
    expect(() => check(SEVEN, getAgeGroupConfig("afl", "U9"))).toThrow(/isn't a soccer-family age group/);
  });
});

describe("validateSoccerLineup in futsal's and hockey's words", () => {
  // Futsal 5 a side, 2-2.
  const FIVE = lineup({ keeper: "k", def: ["b1", "b2"], att: ["f1", "f2"], bench: ["s1"] });

  it("is each sport's own validator, in its own words", () => {
    const futsalU10 = soccerFamilyAgeGroup("futsal", "U10");
    expect(getSportConfig("futsal").validateLineup!(FIVE, futsalU10)).toEqual({ ok: true, issues: [] });
    const onCourt = getSportConfig("futsal").validateLineup!({ ...FIVE, lines: { ...FIVE.lines, att: [], field: ["f1", "f2"] } }, futsalU10);
    expect(messages(onCourt, "error")).toEqual(["With a keeper, kids play in the back, the wings or the front."]);
    const short = getSportConfig("futsal").validateLineup!({ ...FIVE, lines: { ...FIVE.lines, att: ["f1"] } }, futsalU10);
    expect(messages(short, "warn")).toEqual(["4 on the court for a 5-a-side game: playing short."]);
    const twice = validateSoccerLineup({ ...FIVE, lines: { ...FIVE.lines, def: ["b1", "b1"] } }, futsalU10, 5, FUTSAL_RULES);
    expect(twice.issues).toContainEqual({ kind: "error", message: "Player listed twice in the back.", playerId: "b1" });

    const hockeyU9 = soccerFamilyAgeGroup("hockey", "U9");
    const seven = getSportConfig("hockey").validateLineup!(SEVEN, hockeyU9);
    expect(seven).toEqual({ ok: true, issues: [] });
    const both = validateSoccerLineup({ ...SEVEN, bench: ["b1", "a1"] }, hockeyU9, 7, HOCKEY_RULES);
    expect(both.issues).toContainEqual({ kind: "error", message: "Player is in both the strikers and the bench.", playerId: "a1" });
  });

  it("keeps Football Victoria's three-lines warning to soccer", () => {
    // Regression (four-sports plan): the warning keyed on the age id
    // alone, so a hockey U12 with two lines was told about Football
    // Victoria's rules.
    const twoLines = lineup({ keeper: "k", def: ["a", "b", "c", "d"], mid: ["e", "f", "g", "h"], att: [], bench: ["x", "y"] });
    for (const id of ["U12", "U13"]) {
      const hockey = getSportConfig("hockey").validateLineup!(twoLines, soccerFamilyAgeGroup("hockey", id), 9);
      expect(messages(hockey, "warn"), `hockey ${id}`).toEqual([]);
    }
    const soccer = getSportConfig("soccer").validateLineup!(twoLines, soccerFamilyAgeGroup("soccer", "U12"), 9);
    expect(messages(soccer, "warn")).toEqual(["Football Victoria's U12–U13 rules ask for at least three lines."]);
  });
});
