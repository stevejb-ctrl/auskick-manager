// The touch family's suggesters under each strategy: the starting side,
// the sub-due batch and the next half's plan, with a mixed team's rule
// kept and fair time evened within each group.

import { describe, expect, it } from "vitest";
import { replayTouchGame, touchGameMs } from "@/lib/sports/touch/replay";
import { touchOnField } from "@/lib/sports/touch/lineup";
import {
  suggestTouchBreakPlan,
  suggestTouchLineup,
  suggestTouchSubs,
  touchMixFix,
  touchShapeFor,
  type TouchMixed,
  type TouchSeasonBalance,
} from "@/lib/sports/touch/suggest";
import { touchAgeGroup } from "@/lib/sports/touch/family";
import { TOUCH_MIXED_RULE } from "@/lib/sports/touch";
import { countMixedGroups } from "@/lib/sports/touch/mixed";
import { FIELD, LANES, MIN, SQUAD, game, groupOf } from "./touchGame";

const U11 = touchAgeGroup("touch", "U11");
const HALF = 20 * MIN;
const mixed: TouchMixed = { rule: TOUCH_MIXED_RULE, groupOf };

describe("touchShapeFor", () => {
  it("plays the field under Minutes only, and the age's lanes otherwise", () => {
    expect(touchShapeFor(U11, "minutes", 6).lines).toEqual({ middle: 0, link: 0, wing: 0, field: 6 });
    expect(touchShapeFor(U11, "rotate-positions", 6).id).toBe("2-2-2");
    expect(touchShapeFor(U11, "rotate-positions", 5).id).toBe("1-2-2");
    expect(touchShapeFor(U11, "rotate-positions", 4, "1-1-2").id).toBe("1-1-2");
    // Outside the age's range: the nearest size.
    expect(touchShapeFor(U11, "rotate-positions", 9).id).toBe("2-2-2");
  });
});

describe("suggestTouchLineup", () => {
  it("starts the six with the fewest season minutes, everyone on the field", () => {
    const season: TouchSeasonBalance = { time: { a: { field: 90 * MIN }, b: { field: 80 * MIN } }, weight: 1, periodMs: HALF };
    const { lineup } = suggestTouchLineup({ ageGroup: U11, onFieldSize: 6, strategy: "minutes", players: SQUAD, season });
    expect(lineup.lines.field).toEqual(["c", "d", "e", "f", "g", "h"]);
    expect(lineup.bench).toEqual(["a", "b", "i", "j", "k", "l"]);
  });

  it("puts kids in the lane they're short of over the season (Rotate positions)", () => {
    const season: TouchSeasonBalance = {
      time: { a: { middle: 60 * MIN }, b: { middle: 60 * MIN }, c: { wing: 60 * MIN }, d: { wing: 60 * MIN } },
      weight: 1,
      periodMs: HALF,
    };
    const { lineup, shape } = suggestTouchLineup({
      ageGroup: U11,
      onFieldSize: 6,
      strategy: "rotate-positions",
      players: ["a", "b", "c", "d", "e", "f"],
      season,
    });
    expect(shape.id).toBe("2-2-2");
    expect(lineup.lines.middle).not.toContain("a");
    expect(lineup.lines.middle).not.toContain("b");
    expect(lineup.lines.wing).not.toContain("c");
    expect(lineup.lines.wing).not.toContain("d");
  });

  it("puts kids in their home lane (Home position)", () => {
    const { lineup } = suggestTouchLineup({
      ageGroup: U11,
      onFieldSize: 6,
      strategy: "home-position",
      players: ["a", "b", "c", "d", "e", "f"],
      prefs: { homeLane: { a: "wing", f: "middle" } },
    });
    expect(lineup.lines.wing).toContain("a");
    expect(lineup.lines.middle).toContain("f");
  });

  it("fields a mixed team's cap of boys and the girls to match, fewest season minutes first in each group", () => {
    const season: TouchSeasonBalance = { time: { d: { field: 90 * MIN }, a: { field: 90 * MIN } }, weight: 1, periodMs: HALF };
    const { lineup, plan } = suggestTouchLineup({ ageGroup: U11, onFieldSize: 6, strategy: "minutes", players: SQUAD, season, mixed });
    expect(plan).toMatchObject({ size: 6, boys: 3, girls: 3, short: false });
    // Girls a b c g (a has the most); boys d e f h i j k l (d has the most).
    expect(lineup.lines.field).toEqual(["b", "c", "e", "f", "g", "h"]);
    expect(countMixedGroups(lineup.lines.field, groupOf)).toEqual({ girls: 3, boys: 3, unknown: 0 });
  });

  it("fields what the rule allows when a mixed team is short of girls", () => {
    const { lineup, plan } = suggestTouchLineup({
      ageGroup: U11,
      onFieldSize: 6,
      strategy: "rotate-positions",
      players: ["a", "d", "e", "f", "h", "i"],
      mixed,
    });
    expect(plan).toMatchObject({ size: 4, boys: 3, girls: 1, short: true });
    expect(touchOnField(lineup)).toHaveLength(4);
    expect(lineup.lines.field).toEqual([]);
  });
});

describe("suggestTouchSubs", () => {
  it("brings on the bench kids with least time for the kids on longest", () => {
    const g = game();
    g.lineup(FIELD);
    g.start(1);
    const state = replayTouchGame(g.events, { nowMs: 5 * MIN });
    const subs = suggestTouchSubs({ state, nowMs: 5 * MIN, strategy: "minutes" });
    expect(subs).toHaveLength(6);
    expect(subs[0]).toEqual({ off_player_id: "a", on_player_id: "g", line: "field" });
  });

  it("on a mixed team, a girl comes on for a girl and a boy for a boy", () => {
    const g = game();
    // a b c girls on, d e f boys on; bench g (girl), h i j k l (boys).
    g.lineup(FIELD);
    g.start(1);
    const state = replayTouchGame(g.events, { nowMs: 5 * MIN });
    const subs = suggestTouchSubs({ state, nowMs: 5 * MIN, strategy: "minutes", mixed });
    for (const s of subs) expect(groupOf(s.on_player_id)).toBe(groupOf(s.off_player_id!));
    expect(subs.map((s) => s.on_player_id)).toEqual(["g", "h", "i", "j"]);
  });

  it("fixes the mix first after a hand sub breaks the cap: a girl on for a boy, then the side stays legal", () => {
    // Audit 23 Oct (touch P1): Mia off for Jack put 4 boys on, and the
    // next suggestion (girl for girl) kept 4 boys on.
    const g = game();
    // a b c girls on, d e f boys on; bench g (girl), h i j k l (boys).
    g.lineup(FIELD);
    g.start(1);
    g.swap("a", "h", 2); // a girl off for a boy: d e f h = 4 boys
    const state = replayTouchGame(g.events, { nowMs: 3 * MIN });
    expect(countMixedGroups(touchOnField(state.lineup!), groupOf).boys).toBe(4);
    const subs = suggestTouchSubs({ state, nowMs: 3 * MIN, strategy: "minutes", mixed });
    // The girl with least time (g) on for the boy on longest (d).
    expect(subs[0]).toEqual({ off_player_id: "d", on_player_id: "g", line: "field" });
    for (const s of subs) g.swap(s.off_player_id, s.on_player_id, 3);
    const after = countMixedGroups(touchOnField(replayTouchGame(g.events).lineup!), groupOf);
    expect(after.boys).toBeLessThanOrEqual(3);
    expect(after.girls).toBeGreaterThanOrEqual(1);
  });

  it("touchMixFix: just the fix, and nothing once the side keeps the rule", () => {
    const g = game();
    g.lineup(FIELD);
    g.start(1);
    g.swap("a", "h", 2);
    const over = replayTouchGame(g.events, { nowMs: 3 * MIN });
    expect(touchMixFix({ state: over, nowMs: 3 * MIN, strategy: "minutes", mixed }).subs).toEqual([
      { off_player_id: "d", on_player_id: "g", line: "field" },
    ]);
    const g2 = game();
    g2.lineup(FIELD);
    g2.start(1);
    const fine = replayTouchGame(g2.events, { nowMs: 3 * MIN });
    expect(touchMixFix({ state: fine, nowMs: 3 * MIN, strategy: "minutes", mixed }).subs).toEqual([]);
    // A team that isn't mixed has no rule to fix.
    expect(touchMixFix({ state: over, nowMs: 3 * MIN, strategy: "minutes" }).subs).toEqual([]);
  });

  it("keeps a held kid on, and a lane hold in its lane", () => {
    const g = game();
    g.lineup(LANES);
    g.start(1);
    g.add("player_lock", { lock: { kind: "field" } }, "a");
    g.add("player_lock", { lock: { kind: "zone", zone: "wing" } }, "g");
    const state = replayTouchGame(g.events, { nowMs: 5 * MIN });
    const subs = suggestTouchSubs({ state, nowMs: 5 * MIN, strategy: "rotate-positions" });
    expect(subs.some((s) => s.off_player_id === "a")).toBe(false);
    expect(subs.find((s) => s.on_player_id === "g")?.line).toBe("wing");
  });

  it("evens time within each group across a whole mixed game, and never breaks the cap", () => {
    // 6 on, at most 3 boys, 8 boys and 4 girls: boys share 3 places
    // (37.5 % each), girls 3 (75 % each). Subs every 4 minutes.
    const g = game();
    const first = suggestTouchLineup({ ageGroup: U11, onFieldSize: 6, strategy: "minutes", players: SQUAD, mixed });
    g.lineup(first.lineup);
    for (const half of [1, 2]) {
      if (half === 2) {
        const plan = suggestTouchBreakPlan({ state: replayTouchGame(g.events), ageGroup: U11, onFieldSize: 6, strategy: "minutes", mixed });
        g.lineup(plan!.lineup);
      }
      g.start(half);
      for (let t = 4; t < 20; t += 4) {
        const now = (half - 1) * HALF + t * MIN;
        const state = replayTouchGame(g.events, { nowMs: t * MIN });
        for (const s of suggestTouchSubs({ state, nowMs: now, strategy: "minutes", mixed })) g.swap(s.off_player_id, s.on_player_id, t);
        const on = touchOnField(replayTouchGame(g.events).lineup!);
        const count = countMixedGroups(on, groupOf);
        expect(count.boys).toBeLessThanOrEqual(3);
        expect(count.girls).toBeGreaterThanOrEqual(1);
      }
      g.end(half, 20);
    }
    const end = replayTouchGame(g.events);
    const mins = (ids: string[]) => ids.map((id) => touchGameMs(end, id) / MIN);
    const girls = mins(SQUAD.filter((id) => groupOf(id) === "girl"));
    const boys = mins(SQUAD.filter((id) => groupOf(id) === "boy"));
    expect(girls.reduce((a, b) => a + b, 0)).toBeCloseTo(120);
    expect(boys.reduce((a, b) => a + b, 0)).toBeCloseTo(120);
    // Within a group, nobody more than one sub's worth apart.
    expect(Math.max(...girls) - Math.min(...girls)).toBeLessThanOrEqual(8);
    expect(Math.max(...boys) - Math.min(...boys)).toBeLessThanOrEqual(8);
    // And the groups apart: girls about 30 minutes, boys about 15.
    expect(Math.min(...girls)).toBeGreaterThan(Math.max(...boys));
  });

  it("matches the kids coming on to the lanes they're short of (Rotate positions)", () => {
    const g = game();
    g.lineup(LANES);
    g.start(1);
    const state = replayTouchGame(g.events, { nowMs: 5 * MIN });
    state.ms.g = { middle: 30 * MIN };
    state.ms.h = { wing: 30 * MIN };
    // Fresh in this game, but by this game's lanes g has played middle.
    const subs = suggestTouchSubs({ state, nowMs: 5 * MIN, strategy: "rotate-positions", maxSubs: 6 });
    expect(subs.find((s) => s.on_player_id === "g")?.line).not.toBe("middle");
  });
});

describe("suggestTouchBreakPlan", () => {
  it("starts the next half with the least time this game, within each group", () => {
    const g = game();
    g.lineup(FIELD);
    g.start(1);
    g.end(1, 20);
    const plan = suggestTouchBreakPlan({ state: replayTouchGame(g.events), ageGroup: U11, onFieldSize: 6, strategy: "minutes", mixed });
    // Girl g and boys h i j k l haven't played; three boys and three girls.
    const on = plan!.lineup.lines.field;
    expect(on).toContain("g");
    expect(countMixedGroups(on, groupOf)).toEqual({ girls: 3, boys: 3, unknown: 0 });
    expect(on.filter((id) => ["h", "i", "j", "k", "l"].includes(id))).toHaveLength(3);
  });

  it("shrinks the side when a mixed team loses girls, and benches the hurt", () => {
    const g = game();
    g.lineup(FIELD);
    g.start(1);
    g.injure("a", 5);
    g.injure("b", 6);
    g.injure("c", 7);
    g.end(1, 20);
    const plan = suggestTouchBreakPlan({ state: replayTouchGame(g.events), ageGroup: U11, onFieldSize: 6, strategy: "minutes", mixed });
    expect(plan!.plan).toMatchObject({ size: 4, boys: 3, girls: 1, short: true });
    expect(plan!.lineup.lines.field).toContain("g");
    expect(plan!.lineup.bench.slice(-3).sort()).toEqual(["a", "b", "c"]);
  });
});
