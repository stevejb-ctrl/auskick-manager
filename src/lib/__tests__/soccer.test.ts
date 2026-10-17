// Junior Football (soccer), phase 1 of .planning/SOCCER-PLAN.md: the
// sport and its config. Soccer is a family of its own with every rule
// stated in its config (decided 17 Oct 2026): MiniRoos up to U11, 9 a
// side at U12–U13, 11 a side from U14; scores off to U11; the keeper
// by turns at U8–U11 and named keepers from U12; rolling subs; and the
// main Siren brand. It reads nothing of AFL's, and no sport reads it.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_SPORTS,
  ALL_SPORT_IDS,
  getBrandForHost,
  getSportByBrand,
  getSportConfig,
  isSoccer,
  periodLabels,
  soccerSport,
} from "@/lib/sports";
import { newGameDefaults } from "@/lib/games/newGameDefaults";
import { PLAYHQ_TENANT } from "@/lib/playhq";
import {
  SOCCER_AGE_GROUPS,
  SOCCER_WINDOWS_PRESET,
  soccerAgeGroup,
  soccerFormations,
} from "@/lib/sports/soccer";
import { SOCCER_OUTFIELD_LINES, SOCCER_UNITS } from "@/lib/sports/soccer/types";

const ALL = ["U6", "U7", "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17"];

// Age: [default players, minutes a half, keeper, scores] — the plan's
// table and decisions.
const TABLE: Record<string, [number, number, "none" | "turns" | "keepers", boolean]> = {
  U6: [4, 20, "none", false],
  U7: [4, 20, "none", false],
  U8: [7, 20, "turns", false],
  U9: [7, 20, "turns", false],
  U10: [9, 25, "turns", false],
  U11: [9, 25, "turns", false],
  U12: [9, 30, "keepers", true],
  U13: [9, 30, "keepers", true],
  U14: [11, 35, "keepers", true],
  U15: [11, 40, "keepers", true],
  U16: [11, 40, "keepers", true],
  U17: [11, 40, "keepers", true],
};

describe("Football (soccer) sport config", () => {
  it("is a sport and family of its own, named for Football Australia", () => {
    expect(ALL_SPORT_IDS).toContain("soccer");
    expect(getSportConfig("soccer")).toBe(soccerSport);
    expect(isSoccer("soccer")).toBe(true);
    expect(soccerSport.family).toBe("soccer");
    expect(soccerSport.name).toBe("Football (soccer)");
    expect(soccerSport.shortName).toBe("Football");
    expect(soccerSport.jerseyNumbers).toBe(true);
    expect(soccerSport.teamSong).toBe(false);
    expect(soccerSport.substitutionRule).toBe("rolling");
    expect(soccerSport.periodLabel).toBe("half");
  });

  it("scores a goal as one point, for either side", () => {
    expect(soccerSport.scoreTypes).toEqual([
      { id: "goal", label: "Goal", shortLabel: "G", points: 1 },
      { id: "opponent_goal", label: "Opponent goal", shortLabel: "+G", points: 1, opponent: true },
    ]);
  });

  it("plays U6 to U17 in halves, at the plan's sizes and lengths", () => {
    expect(SOCCER_AGE_GROUPS.map((a) => a.id)).toEqual(ALL);
    expect(soccerSport.ageGroups).toBe(SOCCER_AGE_GROUPS);
    for (const [id, [players, minutes]] of Object.entries(TABLE)) {
      const ag = soccerAgeGroup(id);
      expect(ag.defaultOnFieldSize, id).toBe(players);
      expect(ag.periodCount, id).toBe(2);
      expect(ag.periodSeconds, id).toBe(minutes * 60);
      expect(periodLabels("soccer", ag), id).toEqual({ label: "half", plural: "halves" });
      expect(ag.minOnFieldSize, id).toBeLessThanOrEqual(players);
      expect(ag.maxOnFieldSize, id).toBeGreaterThanOrEqual(players);
      expect(ag.maxSquadSize, id).toBeGreaterThan(ag.maxOnFieldSize);
    }
  });

  it("keeps no score by default to U11 (MiniRoos), then scores from U12", () => {
    for (const [id, [, , , scores]] of Object.entries(TABLE)) {
      expect(soccerAgeGroup(id).tracksScoreDefault, id).toBe(scores);
    }
  });

  it("has no keeper at 4 a side, keeper turns at U8–U11 and named keepers from U12", () => {
    for (const [id, [, , keeper]] of Object.entries(TABLE)) {
      expect(soccerAgeGroup(id).keeper, id).toBe(keeper);
    }
  });

  it("subs on the run at every age; windows mode starts from Tasmania's", () => {
    for (const ag of SOCCER_AGE_GROUPS) expect(ag.subMode, ag.id).toEqual({ kind: "rolling" });
    expect(SOCCER_WINDOWS_PRESET).toEqual({ kind: "windows", perHalf: 3, cutoffSeconds: 120 });
  });

  it("starts a new game at the age group's size", () => {
    expect(newGameDefaults("soccer", "U6").on_field_size).toBe(4);
    expect(newGameDefaults("soccer", "U9").on_field_size).toBe(7);
    expect(newGameDefaults("soccer", "U12").on_field_size).toBe(9);
    expect(newGameDefaults("soccer", "U14").on_field_size).toBe(11);
  });

  it("refuses an age group it doesn't have, rather than borrowing one", () => {
    expect(() => soccerAgeGroup("go")).toThrow(/Unknown Football \(soccer\) age group "go"/);
    expect(() => soccerAgeGroup(null)).toThrow(/age group/);
  });

  it("keeps its team sheets off PlayHQ", () => {
    expect(PLAYHQ_TENANT.soccer).toBeNull();
  });
});

describe("Football (soccer) formations", () => {
  const ids = (age: string, size: number) => soccerFormations(soccerAgeGroup(age), size).map((f) => f.id);

  it("defaults to the plan's shapes: 2-3-1, 3-3-2 and 4-3-3, with their alternatives", () => {
    expect(ids("U8", 7)).toEqual(["2-3-1", "3-2-1"]);
    expect(ids("U10", 9)).toEqual(["3-3-2", "3-2-3"]);
    expect(ids("U12", 9)).toEqual(["3-3-2", "3-2-3"]);
    expect(ids("U14", 11)).toEqual(["4-3-3", "4-4-2"]);
  });

  it("has no keeper and no lines at 4 a side: minutes only", () => {
    for (const size of [3, 4]) {
      const [only, ...rest] = soccerFormations(soccerAgeGroup("U6"), size);
      expect(rest).toEqual([]);
      expect(only).toEqual({ id: "no-lines", keeper: false, lines: { def: 0, mid: 0, att: 0, field: size } });
    }
  });

  it("fills every size each age group plays, keeper plus lines adding up", () => {
    for (const ag of SOCCER_AGE_GROUPS) {
      for (let size = ag.minOnFieldSize; size <= ag.maxOnFieldSize; size++) {
        const shapes = ag.formations[size];
        expect(shapes?.length, `${ag.id} ${size}`).toBeGreaterThan(0);
        for (const f of shapes) {
          const outfield = Object.values(f.lines).reduce((s, n) => s + n, 0);
          expect(outfield + (f.keeper ? 1 : 0), `${ag.id} ${size} ${f.id}`).toBe(size);
          expect(f.keeper, `${ag.id} ${f.id}`).toBe(ag.keeper !== "none");
          if (f.keeper) {
            // At least three lines (FV's U12–U13 rule), and no `field` line.
            expect(SOCCER_OUTFIELD_LINES.every((l) => f.lines[l] > 0), `${ag.id} ${f.id}`).toBe(true);
            expect(f.lines.field).toBe(0);
          }
        }
      }
    }
  });

  it("takes the nearest size the age group plays", () => {
    expect(ids("U8", 11)).toEqual(ids("U8", 7));
    expect(ids("U14", 2)).toEqual(ids("U14", 9));
  });
});

// Soccer plan phase 4 (isolation), pulled into phase 1: soccer's config
// holds nothing from AFL (no behind, no Auskick, no AFL lines or
// quarters), soccer's code imports none of another sport's, and no
// other sport mentions soccer.
describe("Football (soccer) isolation", () => {
  // The brand is the main Siren site's by decision (as union's), so it
  // is checked on its own below.
  const { brand, ...rules } = soccerSport;
  const text = JSON.stringify(rules);

  it("holds nothing of AFL's: no behinds, Auskick, AFL words, lines or quarters", () => {
    expect(text).not.toMatch(/behind/i);
    expect(text).not.toMatch(/auskick/i);
    expect(text).not.toMatch(/\bAFL\b/);
    expect(text).not.toMatch(/footy/i);
    expect(text).not.toMatch(/quarter/i);
    expect(text).not.toMatch(/"(back|hback|hfwd|fwd)"/);
    expect(soccerSport.scoreTypes.map((s) => s.id)).toEqual(["goal", "opponent_goal"]);
  });

  it("counts time in its own lines and in goal", () => {
    expect([...SOCCER_UNITS]).toEqual(["gk", "def", "mid", "att", "field"]);
  });

  it("is the main Siren brand, with no site of its own", () => {
    expect(brand.name).toBe("Siren");
    expect(brand.defaultSport).toBe("soccer");
    expect(brand.tagline).not.toMatch(/AFL|footy/i);
    expect(brand.id).not.toBe("soccer");
    for (const host of [brand.host, "sirennetball.com.au", "soccer.example", "localhost:3000"]) {
      expect(getBrandForHost(host).id, host).not.toBe("soccer");
    }
    expect(getSportByBrand("soccer").id).not.toBe("soccer");
  });

  const SPORTS_DIR = join(process.cwd(), "src/lib/sports");
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
      return /\.tsx?$/.test(name) ? [path] : [];
    });
  const importsOf = (path: string) =>
    Array.from(readFileSync(path, "utf8").matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);

  it("imports none of another sport's code (only the main brand, for its brand)", () => {
    const foreign = /^@\/lib\/(fairness$|sports\/(afl|netball|rugby|rugby_league|rugby_union)(\/|$))/;
    for (const path of sources(join(SPORTS_DIR, "soccer"))) {
      const bad = importsOf(path).filter((spec) => foreign.test(spec));
      const allowed = path.endsWith(join("soccer", "index.ts")) ? ["@/lib/sports/afl"] : [];
      expect(bad, path).toEqual(allowed);
    }
    // ...and index.ts takes only the brand from it.
    const index = readFileSync(join(SPORTS_DIR, "soccer", "index.ts"), "utf8");
    expect(index.match(/aflSport\.\w+/g)).toEqual(["aflSport.brand"]);
  });

  it("is read by no other sport", () => {
    for (const cfg of ALL_SPORTS.filter((c) => c.id !== "soccer")) {
      const { brand: _brand, ...other } = cfg;
      expect(JSON.stringify(other), cfg.id).not.toMatch(/soccer/i);
    }
    for (const sport of ["afl", "netball", "rugby", "rugby_league", "rugby_union"]) {
      for (const path of sources(join(SPORTS_DIR, sport))) {
        expect(importsOf(path).filter((spec) => spec.includes("soccer")), path).toEqual([]);
      }
    }
  });
});
