// The soccer suggesters: the starting lineup, rolling subs, a window's
// batch and the half-time plan with keeper turns.

import { describe, expect, it } from "vitest";
import { seasonBalanceWeight } from "@/lib/playbook/seasonBalance";
import { SOCCER_RULES } from "@/lib/sports/soccer";
import { soccerFamilyAgeGroup } from "@/lib/sports/soccer/family";
import { soccerOnField, soccerUnitOf, validateSoccerLineup, type SoccerLineup } from "@/lib/sports/soccer/lineup";
import { replaySoccerGame, soccerGameMs } from "@/lib/sports/soccer/replay";
import {
  suggestSoccerHalfTime,
  suggestSoccerLineup,
  suggestSoccerRollingSub,
  suggestSoccerWindowBatch,
  soccerSubWindowsMs,
  type SoccerSeasonBalance,
} from "@/lib/sports/soccer/suggest";
import { SOCCER_WINDOWS_PRESET } from "@/lib/sports/soccer";
import { MIN, SEVEN, game } from "./soccerGame";
import { soccerKeeperPrefs } from "@/lib/sports/soccer/playbook";

const NINE_KIDS = ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9"];
const U9 = soccerFamilyAgeGroup("soccer", "U9");
const HALF = 20 * MIN;

const season = (time: SoccerSeasonBalance["time"], strength: "light" | "balanced" | "strong" | null = "balanced"): SoccerSeasonBalance => ({
  time,
  weight: seasonBalanceWeight("soccer", strength),
  periodMs: HALF,
});

describe("suggestSoccerLineup: kick-off", () => {
  it("fields the age group's shape with a keeper, and passes its own validator", () => {
    const { lineup, formation } = suggestSoccerLineup({ ageGroup: U9, onFieldSize: 7, players: NINE_KIDS });
    expect(formation.id).toBe("2-3-1");
    expect(lineup).toEqual({
      keeper: "k1",
      lines: { def: ["k2", "k3"], mid: ["k4", "k5", "k6"], att: ["k7"], field: [] },
      bench: ["k8", "k9"],
    });
    expect(validateSoccerLineup(lineup, U9, undefined, SOCCER_RULES)).toEqual({ ok: true, issues: [] });
  });

  it("plays the team's own shape", () => {
    const { lineup } = suggestSoccerLineup({ ageGroup: U9, onFieldSize: 7, players: NINE_KIDS, formationId: "3-2-1" });
    expect([lineup.lines.def.length, lineup.lines.mid.length, lineup.lines.att.length]).toEqual([3, 2, 1]);
  });

  it("gives the keeper top to the fewest season keeper minutes, never to 'not in goal'", () => {
    const time = { k1: { gk: 40 * MIN }, k2: { gk: 20 * MIN }, k3: { gk: 20 * MIN } };
    const pick = (prefs = {}) => suggestSoccerLineup({ ageGroup: U9, onFieldSize: 7, players: NINE_KIDS, season: season(time), prefs }).lineup.keeper;
    expect(pick()).toBe("k4");
    expect(pick({ notInGoal: ["k4", "k5", "k6", "k7", "k8", "k9"] })).toBe("k2");
  });

  it("starts the kids with the most season minutes on the bench", () => {
    const time = { k2: { mid: 200 * MIN }, k5: { def: 150 * MIN } };
    const { lineup } = suggestSoccerLineup({ ageGroup: U9, onFieldSize: 7, players: NINE_KIDS, season: season(time) });
    expect(lineup.bench).toEqual(["k2", "k5"]);
  });

  it("puts a kid owed defence this season in defence, when season balance is on", () => {
    // Everyone has played an hour, spread over the lines, except: k7
    // has never played defence, and k2 and k3 have played nothing else.
    const even = { def: 20 * MIN, mid: 20 * MIN, att: 20 * MIN };
    const time: SoccerSeasonBalance["time"] = Object.fromEntries(NINE_KIDS.map((p) => [p, even]));
    time.k7 = { mid: 30 * MIN, att: 30 * MIN };
    time.k2 = { def: 60 * MIN };
    time.k3 = { def: 60 * MIN };
    const on = suggestSoccerLineup({ ageGroup: U9, onFieldSize: 7, players: NINE_KIDS, season: season(time) }).lineup;
    expect(on.lines.def).toContain("k7");
    expect(on.lines.def).not.toContain("k2");
    const off = suggestSoccerLineup({ ageGroup: U9, onFieldSize: 7, players: NINE_KIDS, season: season(time, null) }).lineup;
    expect(off.lines.def).toEqual(["k2", "k3"]);
  });

  it("plays 4 a side with no keeper and no lines", () => {
    const { lineup, formation } = suggestSoccerLineup({ ageGroup: soccerFamilyAgeGroup("soccer", "U6"), onFieldSize: 4, players: NINE_KIDS.slice(0, 6) });
    expect(formation.id).toBe("no-lines");
    expect(lineup).toEqual({ keeper: null, lines: { def: [], mid: [], att: [], field: ["k1", "k2", "k3", "k4"] }, bench: ["k5", "k6"] });
  });

  it("plays everyone in a smaller shape when the squad is short", () => {
    const { lineup, formation } = suggestSoccerLineup({ ageGroup: U9, onFieldSize: 7, players: NINE_KIDS.slice(0, 6) });
    expect(formation.id).toBe("2-2-1");
    expect(soccerOnField(lineup)).toHaveLength(6);
    expect(lineup.bench).toEqual([]);
  });

  it("rotates among named keepers from U12", () => {
    const U12 = soccerFamilyAgeGroup("soccer", "U12");
    const time = { k8: { gk: 60 * MIN }, k9: { gk: 30 * MIN } };
    const { lineup } = suggestSoccerLineup({
      ageGroup: U12,
      onFieldSize: 9,
      players: NINE_KIDS,
      season: season(time),
      prefs: { namedKeepers: ["k8", "k9"] },
    });
    expect(lineup.keeper).toBe("k9");
    // The team can choose turns at any age with a keeper.
    expect(suggestSoccerLineup({ ageGroup: U12, onFieldSize: 9, players: NINE_KIDS, keeperStrategy: "turns", season: season(time) }).lineup.keeper).toBe("k1");
  });
});

/** A 7-a-side half in play to `minutes`, with any extra events. */
function inPlay(minutes: number, extra: (g: ReturnType<typeof game>) => void = () => {}) {
  const g = game();
  g.lineup(SEVEN);
  g.start(1);
  extra(g);
  return { state: replaySoccerGame(g.events, { nowMs: minutes * MIN }), nowMs: minutes * MIN };
}

describe("suggestSoccerRollingSub", () => {
  it("brings the bench kid with the least time on for the outfield kid with the most, in their line", () => {
    // m1 came on late; everyone else has played 6 minutes.
    const live = inPlay(6, (g) => g.swap("a1", "b2", 4));
    expect(suggestSoccerRollingSub(live)).toEqual({ off_player_id: "d1", on_player_id: "b1", line: "def" });
  });

  it("never takes the keeper off, however long they've played", () => {
    const live = inPlay(10);
    const sub = suggestSoccerRollingSub(live);
    expect(sub?.off_player_id).not.toBe("k");
    expect(sub?.line).not.toBe("gk");
  });

  it("never takes off a kid held on", () => {
    const live = inPlay(6, (g) => g.add("player_lock", { lock: { kind: "field" }, quarter: 1, elapsed_ms: 0 }, "d1"));
    expect(suggestSoccerRollingSub(live)?.off_player_id).toBe("d2");
  });

  it("subs nobody when no sub would even the time", () => {
    // At kick-off nobody has played.
    expect(suggestSoccerRollingSub(inPlay(0))).toBeNull();
    // b2 is lent; d1 (5 min) went off for b1 (1 min), and everyone else
    // on is held on. Bringing d1 back for b1 would only widen the gap.
    const live = inPlay(6, (g) => {
      g.add("player_loan", { loaned: true, elapsed_ms: 0 }, "b2");
      g.swap("d1", "b1", 5);
      for (const pid of ["d2", "m1", "m2", "m3", "a1"]) {
        g.add("player_lock", { lock: { kind: "field" }, quarter: 1, elapsed_ms: 0 }, pid);
      }
    });
    expect(suggestSoccerRollingSub(live)).toBeNull();
  });

  it("lets a kid who just came off rest, and doesn't pull one who just came on", () => {
    const live = inPlay(9, (g) => {
      g.swap("d1", "b1", 8);
    });
    // d1 (8 min) just went off; b2 (0) comes on, and not for b1, who just came on.
    const sub = suggestSoccerRollingSub({ ...live, minStintMs: 4 * MIN });
    expect(sub?.on_player_id).toBe("b2");
    expect(sub?.off_player_id).not.toBe("b1");
  });

  it("never brings on an injured or lent kid", () => {
    const live = inPlay(6, (g) => {
      g.add("injury", { injured: true, elapsed_ms: 0 }, "b1");
      g.add("player_loan", { loaned: true, elapsed_ms: 0 }, "b2");
    });
    expect(suggestSoccerRollingSub(live)).toBeNull();
  });

  it("brings a kid held in a line on only in that line", () => {
    const live = inPlay(6, (g) => g.add("player_lock", { lock: { kind: "zone", zone: "att" }, quarter: 1, elapsed_ms: 0 }, "b1"));
    expect(suggestSoccerRollingSub(live)).toEqual({ off_player_id: "a1", on_player_id: "b1", line: "att" });
  });

  it("keeps the keeper's hold for a whole half of rolling subs, and evens everyone else's time", () => {
    const g = game();
    g.lineup({ ...SEVEN, bench: ["b1", "b2", "b3"] });
    g.start(1);
    g.add("player_lock", { lock: { kind: "position", position: "gk" }, quarter: 1, elapsed_ms: 0 }, "k");
    for (let minute = 2; minute < 20; minute += 2) {
      const state = replaySoccerGame(g.events, { nowMs: minute * MIN });
      const sub = suggestSoccerRollingSub({ state, nowMs: minute * MIN, minStintMs: 4 * MIN });
      if (sub) g.swap(sub.off_player_id, sub.on_player_id, minute);
    }
    g.end(1, 20);
    const s = replaySoccerGame(g.events);
    expect(s.lineup?.keeper).toBe("k");
    expect(s.locks.k).toEqual({ kind: "position", position: "gk" });
    expect(s.ms.k).toEqual({ gk: 20 * MIN });
    const outfield = ["d1", "d2", "m1", "m2", "m3", "a1", "b1", "b2", "b3"].map((p) => soccerGameMs(s, p) / MIN);
    // Six outfield places × 20 min shared by nine kids: 13⅓ each.
    expect(Math.max(...outfield) - Math.min(...outfield)).toBeLessThanOrEqual(4);
  });
});

describe("soccerSubWindowsMs", () => {
  it("has no windows for rolling subs", () => {
    expect(soccerSubWindowsMs({ kind: "rolling" }, HALF)).toEqual([]);
  });

  it("spreads Tasmania's three windows through a half, clear of the last 2 minutes", () => {
    expect(soccerSubWindowsMs(SOCCER_WINDOWS_PRESET, 30 * MIN)).toEqual([7.5 * MIN, 15 * MIN, 22.5 * MIN]);
  });

  it("pulls the windows in when the cutoff would catch the last", () => {
    const windows = soccerSubWindowsMs({ kind: "windows", perPeriod: 4, cutoffSeconds: 300 }, HALF);
    expect(windows).toEqual([3.75 * MIN, 7.5 * MIN, 11.25 * MIN, 15 * MIN]);
  });

  it("scales the cutoff with a sped-up clock", () => {
    // 8× demo clock: a 20-minute half lasts 2.5 minutes, the 5-minute cutoff 37.5 s.
    const fast = soccerSubWindowsMs({ kind: "windows", perPeriod: 4, cutoffSeconds: 300 }, HALF / 8, 8);
    expect(fast).toEqual([3.75, 7.5, 11.25, 15].map((m) => (m * MIN) / 8));
  });
});

describe("suggestSoccerWindowBatch", () => {
  it("brings the whole bench on at a window, for the kids with the most time, each into their line", () => {
    const live = inPlay(7, (g) => g.swap("m3", "b2", 0));
    // b2 came on at kick-off; the bench is m3 (0 min) and b1 (0 min).
    const batch = suggestSoccerWindowBatch(live);
    expect(batch).toHaveLength(2);
    expect(batch.map((s) => s.on_player_id)).toEqual(["b1", "m3"]);
    for (const sub of batch) {
      expect(sub.off_player_id).not.toBe("k");
      expect(soccerUnitOf(live.state.lineup as SoccerLineup, sub.off_player_id)).toBe(sub.line);
    }
    expect(new Set(batch.map((s) => s.off_player_id)).size).toBe(2);
  });

  it("stops when a sub would no longer even the time", () => {
    const g = game();
    g.lineup(SEVEN);
    g.start(1);
    g.swap("d1", "b1", 1);
    const state = replaySoccerGame(g.events, { nowMs: 2 * MIN });
    // d1 (1 min) comes back for someone on 2 minutes; b2 (0) too. Nobody else.
    const batch = suggestSoccerWindowBatch({ state, nowMs: 2 * MIN });
    expect(batch.map((s) => s.on_player_id)).toEqual(["b2", "d1"]);
    expect(batch.map((s) => s.off_player_id)).not.toContain("b1");
  });
});

describe("suggestSoccerHalfTime", () => {
  /** The first half of a U9 game: a kick-off lineup and one sub. */
  function firstHalf(extra: (g: ReturnType<typeof game>) => void = () => {}) {
    const g = game();
    g.lineup(SEVEN);
    g.start(1);
    g.swap("m1", "b1", 10);
    extra(g);
    g.end(1, 20);
    return replaySoccerGame(g.events);
  }

  it("changes the keeper at half-time, by keeper turns, and sends last half's keeper to the field", () => {
    const state = firstHalf();
    const plan = suggestSoccerHalfTime({ state, ageGroup: U9, onFieldSize: 7 })!;
    // Nobody has kept goal but k; b2 sat out the half, so goes in (the
    // keeper plays the whole half: it evens game time).
    expect(plan.keeper).toEqual({ from: "k", to: "b2" });
    expect(plan.lineup.keeper).toBe("b2");
    // k has the most minutes but plays out in the field, not the bench.
    expect(soccerUnitOf(plan.lineup, "k")).not.toBeNull();
    expect(plan.lineup.bench).not.toContain("k");
    expect(validateSoccerLineup(plan.lineup, U9, undefined, SOCCER_RULES)).toEqual({ ok: true, issues: [] });
  });

  it("benches the kids with the most time this game, and rotates the rest to new lines", () => {
    const state = firstHalf();
    const plan = suggestSoccerHalfTime({ state, ageGroup: U9, onFieldSize: 7 })!;
    // m1 and b1 played 10 minutes; everyone else on played 20.
    expect(plan.lineup.bench).toHaveLength(2);
    expect(plan.lineup.bench.every((p) => ["d1", "d2", "m2", "m3", "a1"].includes(p))).toBe(true);
    // Nobody plays the line they played all first half.
    for (const [pid, line] of [["d1", "def"], ["d2", "def"], ["m2", "mid"], ["m3", "mid"], ["a1", "att"]] as const) {
      const now = soccerUnitOf(plan.lineup, pid);
      if (now) expect(now, pid).not.toBe(line);
    }
  });

  it("uses this season's keeper minutes, and skips 'not in goal'", () => {
    const state = firstHalf();
    const time = { b2: { gk: 40 * MIN }, d1: { gk: 20 * MIN } };
    const plan = suggestSoccerHalfTime({
      state,
      ageGroup: U9,
      onFieldSize: 7,
      season: season(time),
      prefs: { notInGoal: ["d2", "m1", "m2", "m3"] },
    })!;
    // b2 has kept goal most this season and d1 some; k is last half's
    // keeper. a1 and b1 never have, and b1 has played less this game.
    expect(plan.keeper.to).toBe("b1");
  });

  it("rotates named keepers from U12, and one named keeper keeps goal", () => {
    const U12 = soccerFamilyAgeGroup("soccer", "U12");
    const state = firstHalf();
    const rotate = suggestSoccerHalfTime({ state, ageGroup: U12, onFieldSize: 7, prefs: { namedKeepers: ["k", "m2"] } })!;
    expect(rotate.keeper).toEqual({ from: "k", to: "m2" });
    const one = suggestSoccerHalfTime({ state, ageGroup: U12, onFieldSize: 7, prefs: { namedKeepers: ["k"] } })!;
    expect(one.keeper).toEqual({ from: "k", to: "k" });
  });

  it("keeps the team's shape and leaves the injured and lent on the bench", () => {
    const state = firstHalf((g) => {
      g.add("injury", { injured: true, elapsed_ms: 15 * MIN }, "d2");
      g.swap("d2", "b2", 15);
      g.add("player_loan", { loaned: true, elapsed_ms: 18 * MIN }, "a1");
    });
    const plan = suggestSoccerHalfTime({ state, ageGroup: U9, onFieldSize: 7, formationId: "3-2-1" })!;
    expect(plan.formation.id).toBe("3-2-1");
    // Seven fit kids for seven places: d2 and a1 sit, last on the bench.
    expect(soccerOnField(plan.lineup)).toHaveLength(7);
    expect(plan.lineup.bench.slice(-2).sort()).toEqual(["a1", "d2"]);
    expect([plan.lineup.lines.def.length, plan.lineup.lines.mid.length, plan.lineup.lines.att.length]).toEqual([3, 2, 1]);
  });

  it("plays 4 a side without a keeper", () => {
    const g = game();
    g.lineup({ keeper: null, lines: { def: [], mid: [], att: [], field: ["p1", "p2", "p3", "p4"] }, bench: ["p5", "p6"] });
    g.start(1);
    g.end(1, 20);
    const plan = suggestSoccerHalfTime({ state: replaySoccerGame(g.events), ageGroup: soccerFamilyAgeGroup("soccer", "U7"), onFieldSize: 4 })!;
    expect(plan.keeper).toEqual({ from: null, to: null });
    expect(plan.lineup.lines.field).toEqual(expect.arrayContaining(["p5", "p6"]));
    expect(plan.lineup.bench).toHaveLength(2);
  });

  it("needs a lineup", () => {
    expect(suggestSoccerHalfTime({ state: replaySoccerGame([]), ageGroup: U9, onFieldSize: 7 })).toBeNull();
  });
});

// Steve 2026-10-22: "For soccer … you can go forward and backs or further
// tailor it." A kid's "Plays as" lines are stored as never rows for the
// rest (notInLine); every suggester keeps them to those lines.
describe("plays as: the lines a kid plays", () => {
  it("seats a kid only in the lines they play at kick-off", () => {
    // k2 and k3 would start in defence; k2 plays attack only.
    const { lineup } = suggestSoccerLineup({
      ageGroup: U9,
      onFieldSize: 7,
      players: NINE_KIDS,
      prefs: { notInLine: { k2: ["def", "mid"] } },
    });
    expect(lineup.lines.att).toContain("k2");
  });

  it("brings a kid on only for a line they play (rolling sub and window batch)", () => {
    // b1 plays attack only, so comes on for a1, not d1 (first in line).
    const live = inPlay(6);
    const prefs = { notInLine: { b1: ["def", "mid"] as const } };
    expect(suggestSoccerRollingSub({ ...live, prefs })).toEqual({ off_player_id: "a1", on_player_id: "b1", line: "att" });
    const batch = suggestSoccerWindowBatch({ state: live.state, nowMs: live.nowMs, prefs });
    expect(batch.find((s) => s.on_player_id === "b1")?.line).toBe("att");
  });

  it("plans the next half with each kid in the lines they play", () => {
    const g = game();
    g.lineup(SEVEN);
    g.start(1);
    g.end(1, 20);
    const plan = suggestSoccerHalfTime({
      state: replaySoccerGame(g.events),
      ageGroup: U9,
      onFieldSize: 7,
      prefs: { notInLine: { d1: ["def", "mid"] } },
    });
    if (plan!.lineup.keeper !== "d1" && !plan!.lineup.bench.includes("d1")) expect(plan!.lineup.lines.att).toContain("d1");
  });

  it("reads the lines a kid doesn't play from their role", () => {
    expect(
      soccerKeeperPrefs([
        { player_id: "k1", position_key: null, line: "def", kind: "never", rank: null },
        { player_id: "k1", position_key: null, line: "mid", kind: "never", rank: null },
        { player_id: "k2", position_key: null, line: "gk", kind: "never", rank: null },
      ]).notInLine,
    ).toEqual({ k1: ["def", "mid"] });
  });
});
