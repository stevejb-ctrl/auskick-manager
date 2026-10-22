// The touch family on the shared surfaces: results and scorers, season
// time per lane, How we play's roles, and the game report's time floor
// compared within each group on a mixed team.

import { describe, expect, it } from "vitest";
import { scoreFromEvents, scorersFromEvents } from "@/lib/results";
import { gameTimeByUnit } from "@/lib/playbook/seasonTime";
import { gameReport } from "@/lib/playbook/gameReport";
import { aggregateTouchSeason } from "@/lib/dashboard/touchAggregators";
import { touchHowWePlay, touchPrefs } from "@/lib/sports/touch/familyPlaybook";
import { FIELD, LANES, MIN, game } from "./touchGame";

describe("results", () => {
  it("scores a girl's try as 2 and tallies tries, not points", () => {
    const g = game();
    g.lineup(FIELD);
    g.start(1);
    g.score("girls_try", 1, "a");
    g.score("try", 2, "d");
    g.score("opponent_girls_try", 3);
    expect(scoreFromEvents("oztag", g.events)).toEqual({ us: 3, them: 2 });
    expect(scorersFromEvents("oztag", g.events)).toEqual([
      { playerId: "a", detail: "1 try", points: 2, showPoints: false },
      { playerId: "d", detail: "1 try", points: 1, showPoints: false },
    ]);
  });
});

describe("season time", () => {
  it("counts each lane, or the field under Minutes only", () => {
    const g = game();
    g.lineup(LANES);
    g.start(1);
    g.end(1, 20);
    expect(gameTimeByUnit("touch", g.events, "line")).toMatchObject({ a: { middle: 20 * MIN }, e: { wing: 20 * MIN } });
    expect(gameTimeByUnit("touch", g.events, "position")).toEqual({});
  });
});

describe("How we play's roles", () => {
  it("reads home lanes, lanes left out and Plays every minute", () => {
    expect(
      touchPrefs([
        { player_id: "a", position_key: null, line: "wing", kind: "home", rank: 0 },
        { player_id: "b", position_key: null, line: "middle", kind: "never", rank: 0 },
        { player_id: "c", position_key: null, line: null, kind: "keep_on", rank: 0 },
        { player_id: "d", position_key: null, line: "forwards", kind: "home", rank: 0 },
      ] as never),
    ).toEqual({ homeLane: { a: "wing" }, neverLane: { b: ["middle"] }, keepOn: ["c"] });
  });

  it("plays the snapshot's strategy once a game is under way, else the saved one, else the age's ★", () => {
    const loaded = (id: string | null) => ({
      resolved: { strategy: { id } as never, seasonBalance: "balanced" as const, seasonBalanceSince: null },
      prefs: [],
    });
    expect(touchHowWePlay("touch", loaded(null), "U9").strategy).toBe("minutes");
    expect(touchHowWePlay("touch", loaded("home-position"), "U9").strategy).toBe("home-position");
    expect(
      touchHowWePlay("oztag", loaded("home-position"), "U12", {
        strategy: "rotate-positions",
        seasonBalance: "off",
        seasonBalanceSince: null,
      }),
    ).toMatchObject({ strategy: "rotate-positions", balance: "off" });
  });
});

describe("gameReport on a mixed team", () => {
  const P = 20 * MIN;
  const base = {
    lines: ["field"],
    lineLabel: (k: string) => k,
    name: (id: string) => id.toUpperCase(),
    periodMs: P,
    periodCount: 2,
    lineWord: "lane",
    periodLabel: (n: number) => `half ${n}`,
    minGameTimePct: 50,
    rules: [],
  };
  // Four girls on 75 % each and eight boys on 37.5 % each (touch's cap),
  // except boy B8, who played 25 %.
  const byPeriod: Record<string, Record<number, Record<string, number>>> = {};
  const groups: Record<string, string> = {};
  for (const id of ["g1", "g2", "g3", "g4"]) {
    byPeriod[id] = { 1: { field: P * 0.75 }, 2: { field: P * 0.75 } };
    groups[id] = "girl";
  }
  for (const id of ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"]) {
    byPeriod[id] = { 1: { field: P * (id === "b8" ? 0.25 : 0.375) }, 2: { field: P * (id === "b8" ? 0.25 : 0.375) } };
    groups[id] = "boy";
  }

  it("compares each kid's time within their group, naming no group", () => {
    const report = gameReport({ ...base, byPeriod, mixedGroupOf: (id) => groups[id] });
    expect(report.items[0]).toEqual({
      id: "min-game-time",
      status: "fail",
      text: "B8 played under a fair share. Boys and girls are evened separately under the mixed rule.",
    });
  });

  it("would flag every boy against the team's floor", () => {
    const report = gameReport({ ...base, byPeriod });
    expect(report.items[0].text).toMatch(/^B1, B2, .* and B8 played under 50%$/);
  });
});

describe("aggregateTouchSeason", () => {
  it("adds up each kid's minutes, lanes and tries, and the results", () => {
    const g1 = game();
    g1.lineup(LANES);
    g1.start(1);
    g1.score("girls_try", 2, "a");
    g1.score("opponent_try", 3);
    g1.end(1, 20);
    const g2 = game();
    g2.lineup(LANES);
    g2.start(1);
    g2.score("opponent_try", 2);
    g2.end(1, 20);
    const agg = aggregateTouchSeason([{ id: "x" }, { id: "y" }], { x: g1.events, y: g2.events });
    expect(agg.totals).toEqual({ games: 2, pointsFor: 2, pointsAgainst: 2, wins: 1, draws: 0, losses: 1 });
    expect(agg.perPlayer.a).toMatchObject({ gamesPlayed: 2, ms: 40 * MIN, middleMs: 40 * MIN, tries: 1, points: 2 });
    expect(agg.perPlayer.g).toBeUndefined();
  });
});
