// Junior basketball, phase 1 of .planning/BASKETBALL-PLAN.md: the sport
// and its config, wired into the shared dispatchers (scores, season
// time, the season grid, PlayHQ, How we play). Basketball is a family of
// its own with every rule stated in its config. It reads nothing of
// another sport's, and no sport reads it.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_SPORTS,
  ALL_SPORT_IDS,
  basketballSport,
  getBrandForHost,
  getSportByBrand,
  getSportConfig,
  isBasketball,
  isRugby,
  isSoccer,
} from "@/lib/sports";
import { newGameDefaults } from "@/lib/games/newGameDefaults";
import { PLAYHQ_TENANT, parsePlayhqUrl } from "@/lib/playhq";
import { scoreFromEvents, scorersFromEvents } from "@/lib/results";
import { seasonTimeByUnit } from "@/lib/playbook/seasonTime";
import { gridUnits } from "@/lib/playbook/seasonGrid";
import { BASE_UNIT } from "@/lib/playbook/rollup";
import { effectivePolicy, effectiveStrategy, getSportPlaybook } from "@/lib/playbook";
import { basketballPrefs, basketballStrategy } from "@/lib/sports/basketball/playbook";
import type { GameEvent } from "@/lib/types";

const MIN = 60_000;

function events(): GameEvent[] {
  const out: GameEvent[] = [];
  const add = (type: string, metadata: Record<string, unknown>, player_id: string | null = null) =>
    out.push({
      id: `e${out.length + 1}`,
      game_id: "g1",
      type: type as GameEvent["type"],
      player_id,
      metadata,
      created_by: "u1",
      created_at: new Date(Date.UTC(2026, 9, 18, 9, 0, out.length + 1)).toISOString(),
    });
  add("lineup_set", {
    lineup: {
      lines: { guard: ["a", "b"], forward: ["c", "d", "e"], court: [] },
      bench: ["f"],
      slots: { a: "pg", b: "sg", c: "sf", d: "pf", e: "c" },
    },
  });
  add("quarter_start", { quarter: 1 });
  add("two_pointer", { elapsed_ms: MIN }, "a");
  add("three_pointer", { elapsed_ms: 2 * MIN }, "c");
  add("free_throw", { elapsed_ms: 3 * MIN }, "c");
  add("opponent_two_pointer", { elapsed_ms: 4 * MIN });
  add("swap", { off_player_id: "a", on_player_id: "f", elapsed_ms: 10 * MIN });
  add("quarter_end", { quarter: 1, elapsed_ms: 20 * MIN });
  return out;
}

describe("basketball sport config", () => {
  it("is a sport and family of its own", () => {
    expect(ALL_SPORT_IDS).toContain("basketball");
    expect(getSportConfig("basketball")).toBe(basketballSport);
    expect(isBasketball("basketball")).toBe(true);
    expect(isSoccer("basketball")).toBe(false);
    expect(isRugby("basketball")).toBe(false);
    expect(basketballSport.family).toBe("basketball");
    expect(basketballSport.name).toBe("Basketball");
    for (const id of ALL_SPORT_IDS.filter((s) => s !== "basketball")) expect(isBasketball(id), id).toBe(false);
  });

  it("starts a new game five on court, at the age group's interval", () => {
    expect(newGameDefaults("basketball", "U12", null)).toMatchObject({
      on_field_size: 5,
      sub_interval_seconds: 240,
    });
  });

  it("lives under the main Siren brand: no host resolves to it", () => {
    const brand = basketballSport.brand;
    expect(brand.name).toBe("Siren");
    expect(brand.id).not.toBe("basketball");
    for (const host of [brand.host, "sirennetball.com.au", "basketball.example", "localhost:3000"]) {
      expect(getBrandForHost(host).id, host).not.toBe("basketball");
    }
    expect(getSportByBrand("basketball").id).not.toBe("basketball");
  });
});

describe("basketball in the shared dispatchers", () => {
  it("scores baskets as points, and lists scorers by points", () => {
    expect(scoreFromEvents("basketball", events())).toEqual({ us: 6, them: 2 });
    expect(scorersFromEvents("basketball", events())).toEqual([
      { playerId: "c", detail: "4 pts", points: 4, showPoints: false },
      { playerId: "a", detail: "2 pts", points: 2, showPoints: false },
    ]);
  });

  it("counts season time per line and per position", () => {
    const byLine = seasonTimeByUnit("basketball", events(), "line");
    expect(byLine.a).toEqual({ guard: 10 * MIN });
    expect(byLine.f).toEqual({ guard: 10 * MIN });
    expect(byLine.c).toEqual({ forward: 20 * MIN });
    const byPos = seasonTimeByUnit("basketball", events(), "position");
    expect(byPos.f).toEqual({ pg: 10 * MIN });
    expect(byPos.e).toEqual({ c: 20 * MIN });
    expect(BASE_UNIT.basketball).toBe("line");
  });

  it("shows guards and forwards, or 1 to 5, in the season grid", () => {
    expect(gridUnits("basketball", "line").columns.map((c) => c.key)).toEqual(["guard", "forward"]);
    expect(gridUnits("basketball", "position").columns.map((c) => c.label)).toEqual(["PG", "SG", "SF", "PF", "C"]);
  });

  it("imports fixtures from any state's PlayHQ basketball tenant, and no other sport's", () => {
    expect(PLAYHQ_TENANT.basketball).toBe("basketball-victoria");
    const vic = parsePlayhqUrl("https://www.playhq.com/basketball-victoria/org/club/abc123/comp/teams/team/def456ghi", "basketball");
    expect(vic).toEqual({ ok: true, teamId: "def456ghi", tenant: "basketball-victoria" });
    const wa = parsePlayhqUrl("https://www.playhq.com/basketball-wa/org/club/abc123/comp/teams/team/def456ghi", "basketball");
    expect(wa).toMatchObject({ ok: true, tenant: "basketball-wa" });
    const afl = parsePlayhqUrl("https://www.playhq.com/afl/org/club/abc123/comp/teams/team/def456ghi", "basketball");
    expect(afl).toMatchObject({ ok: false });
    // A basketball page isn't an AFL team's.
    const wrong = parsePlayhqUrl("https://www.playhq.com/basketball-victoria/org/club/abc123/comp/teams/team/def456ghi", "afl");
    expect(wrong).toMatchObject({ ok: false, reason: expect.stringMatching(/a basketball team page/) });
  });
});

describe("basketball's How we play", () => {
  it("offers five rotations, positions optional, with each age's ★", () => {
    const playbook = getSportPlaybook("basketball");
    const policy = effectivePolicy("basketball", "U12");
    expect(playbook.strategies(policy).map((s) => s.id)).toEqual([
      "minutes",
      "both-lines",
      "preferred-line",
      "position-by-position",
      "set-positions",
    ]);
    expect(playbook.recommendedStrategy(effectivePolicy("basketball", "U8"))).toBe("minutes");
    expect(playbook.recommendedStrategy(policy)).toBe("both-lines");
    expect(playbook.recommendedStrategy(effectivePolicy("basketball", "U16"))).toBe("preferred-line");
    // A team with no saved choice plays the age's ★.
    expect(effectiveStrategy("basketball", policy, null).id).toBe("both-lines");
    expect(basketballStrategy("U18", "nonsense")).toBe("preferred-line");
    expect(basketballStrategy("U10", "set-positions")).toBe("set-positions");
  });

  it("has the five fixed positions in guards and forwards", () => {
    const model = getSportPlaybook("basketball").positionModel(effectivePolicy("basketball", "U14"), 5);
    expect(model.kind).toBe("fixed");
    expect(model.defaults.map((p) => [p.key, p.line])).toEqual([
      ["pg", "guard"],
      ["sg", "guard"],
      ["sf", "forward"],
      ["pf", "forward"],
      ["c", "forward"],
    ]);
  });

  it("shows the junior laws at the ages that play them", () => {
    const laws = (age: string) => getSportPlaybook("basketball").lawRules(effectivePolicy("basketball", age), getSportPlaybook("basketball").agePolicy(age)).map((r) => r.id);
    expect(laws("U10")).toEqual(["basketball-no-zone", "basketball-no-threes", "basketball-five-fouls"]);
    expect(laws("U14")).toEqual(["basketball-no-zone", "basketball-five-fouls"]);
    expect(laws("U18")).toEqual(["basketball-five-fouls"]);
  });

  it("reads home lines, home positions, backups and ball handlers from the role sheet", () => {
    const prefs = basketballPrefs([
      { player_id: "a", position_key: null, line: "guard", kind: "home", rank: 0 },
      { player_id: "b", position_key: null, line: "forward", kind: "home", rank: 0 },
      { player_id: "c", position_key: "c", line: "forward", kind: "home", rank: 0 },
      { player_id: "c", position_key: "pf", line: "forward", kind: "also", rank: 1 },
    ]);
    expect(prefs.homeLine).toEqual({ a: "guard", b: "forward" });
    expect(prefs.homePosition).toEqual({ c: "c" });
    expect(prefs.alsoPositions).toEqual({ c: ["pf"] });
    expect(prefs.ballHandlers).toEqual(["a"]);
  });
});

describe("basketball isolation", () => {
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
    const foreign = /^@\/lib\/(fairness$|sports\/(afl|netball|rugby|rugby_league|rugby_union|soccer)(\/|$))/;
    for (const path of sources(join(SPORTS_DIR, "basketball"))) {
      const bad = importsOf(path).filter((spec) => foreign.test(spec));
      const allowed = path.endsWith(join("basketball", "index.ts")) ? ["@/lib/sports/afl"] : [];
      expect(bad, path).toEqual(allowed);
    }
    const index = readFileSync(join(SPORTS_DIR, "basketball", "index.ts"), "utf8");
    expect(index.match(/aflSport\.\w+/g)).toEqual(["aflSport.brand"]);
  });

  it("is read by no other sport", () => {
    for (const cfg of ALL_SPORTS.filter((c) => c.id !== "basketball")) {
      const { brand: _brand, ...other } = cfg;
      expect(JSON.stringify(other), cfg.id).not.toMatch(/basketball/i);
    }
    for (const sport of ["afl", "netball", "rugby", "rugby_league", "rugby_union", "soccer"]) {
      for (const path of sources(join(SPORTS_DIR, sport))) {
        expect(importsOf(path).filter((spec) => spec.includes("basketball")), path).toEqual([]);
      }
    }
  });
});

describe("basketball's new games", () => {
  it("take a quarter's sub interval when the team plays quarters", () => {
    expect(newGameDefaults("basketball", "U12", null, 4)).toEqual({ on_field_size: 5, sub_interval_seconds: 300 });
    expect(newGameDefaults("basketball", "U12", null, null)).toEqual({ on_field_size: 5, sub_interval_seconds: 240 });
    // Another sport ignores the period count.
    expect(newGameDefaults("soccer", "U9", null, 4)).toEqual(newGameDefaults("soccer", "U9", null));
  });
});
