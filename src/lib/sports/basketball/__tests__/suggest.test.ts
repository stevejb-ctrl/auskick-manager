// The basketball suggesters under each strategy: the starting five, the
// sub-due batch, and the next period's plan.

import { describe, expect, it } from "vitest";
import { replayBasketballGame } from "@/lib/sports/basketball/replay";
import {
  basketballShapeFor,
  suggestBasketballBreakPlan,
  suggestBasketballLineup,
  suggestBasketballSubs,
  type BasketballSeasonBalance,
} from "@/lib/sports/basketball/suggest";
import { COURT, LINES, MIN, POSITIONS, SQUAD, game } from "./basketballGame";

const HALF = 20 * MIN;

describe("basketballShapeFor", () => {
  it("plays the court under Equal minutes, the team's shape in lines, 2–3 for positions", () => {
    expect(basketballShapeFor("minutes", 5).lines).toEqual({ guard: 0, forward: 0, court: 5 });
    expect(basketballShapeFor("both-lines", 5).id).toBe("2-3");
    expect(basketballShapeFor("both-lines", 5, "3-2").id).toBe("3-2");
    expect(basketballShapeFor("position-by-position", 5, "3-2").id).toBe("2-3");
    // A side one short keeps a shape.
    expect(basketballShapeFor("both-lines", 4).id).toBe("2-2");
  });
});

describe("suggestBasketballLineup", () => {
  it("starts the five with the fewest season minutes, everyone in `court`", () => {
    const season: BasketballSeasonBalance = {
      time: { a: { court: 90 * MIN }, b: { court: 80 * MIN } },
      weight: 1,
      periodMs: HALF,
    };
    const { lineup } = suggestBasketballLineup({ onCourtSize: 5, strategy: "minutes", players: SQUAD, season });
    expect(lineup.lines.court).toEqual(["c", "d", "e", "f", "g"]);
    expect(lineup.bench).toEqual(["a", "b", "h", "i", "j"]);
    expect(lineup.slots).toBeUndefined();
  });

  it("keeps a ball handler on court under Equal minutes", () => {
    const { lineup } = suggestBasketballLineup({
      onCourtSize: 5,
      strategy: "minutes",
      players: SQUAD,
      prefs: { ballHandlers: ["j"] },
    });
    expect(lineup.lines.court).toContain("j");
    expect(lineup.lines.court).toHaveLength(5);
  });

  it("seats Guards and forwards by season debt: a kid short of guard time plays guard", () => {
    const season: BasketballSeasonBalance = {
      time: {
        a: { guard: 60 * MIN },
        b: { guard: 60 * MIN },
        c: { forward: 60 * MIN },
        d: { forward: 60 * MIN },
        e: { forward: 60 * MIN },
      },
      weight: 1,
      periodMs: HALF,
    };
    const { lineup, shape } = suggestBasketballLineup({
      onCourtSize: 5,
      strategy: "both-lines",
      players: ["a", "b", "c", "d", "e"],
      season,
    });
    expect(shape.id).toBe("2-3");
    expect(lineup.lines.guard).toHaveLength(2);
    expect(lineup.lines.forward).toHaveLength(3);
    // The forwards of the season are owed guard time.
    expect(lineup.lines.guard.every((p) => ["c", "d", "e"].includes(p))).toBe(true);
  });

  it("puts kids on their home line under Home line", () => {
    const { lineup } = suggestBasketballLineup({
      onCourtSize: 5,
      strategy: "preferred-line",
      players: ["a", "b", "c", "d", "e"],
      prefs: { homeLine: { d: "guard", e: "guard", a: "forward", b: "forward", c: "forward" } },
    });
    expect([...lineup.lines.guard].sort()).toEqual(["d", "e"]);
  });

  it("fills the five positions once each, in home positions under Set positions", () => {
    const { lineup } = suggestBasketballLineup({
      onCourtSize: 5,
      strategy: "set-positions",
      players: ["a", "b", "c", "d", "e"],
      prefs: { homePosition: { a: "c", b: "pf", c: "sf", d: "sg", e: "pg" } },
    });
    expect(lineup.slots).toEqual({ a: "c", b: "pf", c: "sf", d: "sg", e: "pg" });
    // Guards 1–2, forwards 3–5, each in number order.
    expect(lineup.lines.guard).toEqual(["e", "d"]);
    expect(lineup.lines.forward).toEqual(["c", "b", "a"]);
  });

  it("spreads All five positions by season debt", () => {
    const season: BasketballSeasonBalance = {
      time: { a: { pg: 80 * MIN }, b: { pg: 80 * MIN } },
      weight: 1,
      periodMs: HALF,
    };
    const { lineup } = suggestBasketballLineup({
      onCourtSize: 5,
      strategy: "position-by-position",
      players: ["a", "b", "c", "d", "e"],
      season,
    });
    expect(Object.values(lineup.slots ?? {}).sort()).toEqual(["c", "pf", "pg", "sf", "sg"]);
    expect(lineup.slots?.a).not.toBe("pg");
    expect(lineup.slots?.b).not.toBe("pg");
  });
});

describe("suggestBasketballSubs", () => {
  it("brings the bench on for the kids with the most time, only when it evens time", () => {
    const g = game();
    g.lineup(COURT);
    g.start(1);
    const s = replayBasketballGame(g.events, { nowMs: 5 * MIN });
    const subs = suggestBasketballSubs({ state: s, nowMs: 5 * MIN, strategy: "minutes", foulOutAt: 5 });
    expect(subs).toHaveLength(5);
    expect(subs.map((x) => x.on_player_id)).toEqual(["f", "g", "h", "i", "j"]);
    expect(new Set(subs.map((x) => x.off_player_id))).toEqual(new Set(["a", "b", "c", "d", "e"]));

    // Right after the subs, nobody on the bench is owed time.
    const h = game();
    h.lineup(COURT);
    h.start(1);
    for (const [off, on] of [["a", "f"], ["b", "g"], ["c", "h"], ["d", "i"], ["e", "j"]]) h.swap(off, on, 5);
    const t = replayBasketballGame(h.events, { nowMs: 6 * MIN });
    expect(suggestBasketballSubs({ state: t, nowMs: 6 * MIN, strategy: "minutes", foulOutAt: 5 })).toEqual([]);
  });

  it("caps a batch at maxSubs", () => {
    const g = game();
    g.lineup(COURT);
    g.start(1);
    const s = replayBasketballGame(g.events, { nowMs: 5 * MIN });
    expect(suggestBasketballSubs({ state: s, nowMs: 5 * MIN, strategy: "minutes", foulOutAt: 5, maxSubs: 2 })).toHaveLength(2);
  });

  it("takes a kid in foul trouble off first", () => {
    const g = game();
    g.lineup(COURT);
    g.start(1);
    for (let i = 0; i < 4; i++) g.foul("e", 1 + i * 0.1);
    const s = replayBasketballGame(g.events, { nowMs: 5 * MIN });
    const [first] = suggestBasketballSubs({ state: s, nowMs: 5 * MIN, strategy: "minutes", foulOutAt: 5, maxSubs: 1 });
    expect(first.off_player_id).toBe("e");
  });

  it("never brings on a fouled-out kid, or one still sitting out", () => {
    const g = game();
    g.lineup({ ...COURT, bench: ["f", "g"] });
    g.start(1);
    g.foulOut("f", 0);
    g.sitOut("g", 0);
    const s = replayBasketballGame(g.events, { nowMs: 4 * MIN });
    expect(suggestBasketballSubs({ state: s, nowMs: 4 * MIN, strategy: "minutes", foulOutAt: 5 })).toEqual([]);
    const later = replayBasketballGame(g.events, { nowMs: 6 * MIN });
    expect(suggestBasketballSubs({ state: later, nowMs: 6 * MIN, strategy: "minutes", foulOutAt: 5 }).map((x) => x.on_player_id)).toEqual(["g"]);
  });

  it("subs like-for-like under Home line: a guard comes on only for a guard", () => {
    const g = game();
    g.lineup({ ...LINES, bench: ["f"] });
    g.start(1);
    const s = replayBasketballGame(g.events, { nowMs: 5 * MIN });
    const subs = suggestBasketballSubs({
      state: s,
      nowMs: 5 * MIN,
      strategy: "preferred-line",
      foulOutAt: 5,
      prefs: { homeLine: { f: "guard" } },
    });
    expect(subs).toHaveLength(1);
    expect(["a", "b"]).toContain(subs[0].off_player_id);
    expect(subs[0].line).toBe("guard");
  });

  it("matches the kids coming on to the line each is short of (Guards and forwards)", () => {
    const g = game();
    g.lineup({ ...LINES, bench: ["f", "g", "x"] });
    g.start(1);
    // x came on for b at 2', so a (a guard) and c (a forward) have
    // played longest.
    g.swap("b", "x", 2);
    const s = replayBasketballGame(g.events, { nowMs: 5 * MIN });
    const season: BasketballSeasonBalance = {
      time: { f: { guard: 60 * MIN }, g: { forward: 60 * MIN } },
      weight: 1,
      periodMs: HALF,
    };
    const subs = suggestBasketballSubs({ state: s, nowMs: 5 * MIN, strategy: "both-lines", foulOutAt: 5, season, maxSubs: 2 });
    const byOn = Object.fromEntries(subs.map((x) => [x.on_player_id, x.line]));
    // f has played guard all season, so f goes to the forwards; g the guards.
    expect(byOn).toEqual({ f: "forward", g: "guard" });
  });

  it("keeps a ball handler on court under Equal minutes", () => {
    const g = game();
    g.lineup({ ...COURT, bench: ["f"] });
    g.start(1);
    const s = replayBasketballGame(g.events, { nowMs: 5 * MIN });
    // a is the only ball handler; any sub would take someone off, and
    // a has as much time as anyone — the suggester takes another kid.
    const subs = suggestBasketballSubs({
      state: s,
      nowMs: 5 * MIN,
      strategy: "minutes",
      foulOutAt: 5,
      prefs: { ballHandlers: ["a"] },
      maxSubs: 1,
    });
    expect(subs).toHaveLength(1);
    expect(subs[0].off_player_id).not.toBe("a");
  });
});

describe("suggestBasketballBreakPlan", () => {
  it("plays the least time this game first, and leaves the fouled out on the bench", () => {
    const g = game();
    g.lineup(LINES);
    g.start(1);
    g.foulOut("a", 10);
    g.swap("a", "f", 10);
    g.end(1, 20);
    const s = replayBasketballGame(g.events);
    const plan = suggestBasketballBreakPlan({ state: s, onCourtSize: 5, strategy: "both-lines" });
    const on = [...plan!.lineup.lines.guard, ...plan!.lineup.lines.forward];
    expect(new Set(on)).toEqual(new Set(["g", "h", "i", "j", "f"]));
    expect(plan!.lineup.bench[plan!.lineup.bench.length - 1]).toBe("a");
  });

  it("swaps lines at the break under Guards and forwards", () => {
    const g = game();
    g.lineup({ ...LINES, bench: [] });
    g.start(1);
    g.end(1, 20);
    const s = replayBasketballGame(g.events);
    const plan = suggestBasketballBreakPlan({ state: s, onCourtSize: 5, strategy: "both-lines" })!;
    // Last half's guards (a, b) lean to the forwards.
    expect(plan.lineup.lines.guard.some((p) => p === "a" || p === "b")).toBe(false);
  });

  it("rotates positions at the break under All five positions", () => {
    const g = game();
    g.lineup({ ...POSITIONS, bench: [] });
    g.start(1);
    g.end(1, 20);
    const s = replayBasketballGame(g.events);
    const plan = suggestBasketballBreakPlan({ state: s, onCourtSize: 5, strategy: "position-by-position" })!;
    for (const [pid, pos] of Object.entries(POSITIONS.slots!)) expect(plan.lineup.slots?.[pid]).not.toBe(pos);
  });
});

// Positive roles (21 Oct 2026): "Plays as" is stored as `never` rows for
// the other lines or positions, and "Plays every minute" as keep_on. The
// basketball suggesters ignored both; now they honour them as the other
// sports do.
describe("plays as and plays every minute", () => {
  it("never seats a kid on a line they don't play (Guards and forwards)", () => {
    const season: BasketballSeasonBalance = {
      time: { a: { guard: 60 * MIN }, b: { guard: 60 * MIN }, c: { forward: 60 * MIN }, d: { forward: 60 * MIN }, e: { forward: 60 * MIN } },
      weight: 1,
      periodMs: HALF,
    };
    // c is owed guard time, but only plays forward.
    const { lineup } = suggestBasketballLineup({
      onCourtSize: 5,
      strategy: "both-lines",
      players: ["a", "b", "c", "d", "e"],
      season,
      prefs: { neverLine: { c: ["guard"] } },
    });
    expect(lineup.lines.forward).toContain("c");
  });

  it("never seats a kid in a position they don't play (All five positions)", () => {
    const { lineup } = suggestBasketballLineup({
      onCourtSize: 5,
      strategy: "position-by-position",
      players: ["a", "b", "c", "d", "e"],
      prefs: { neverPosition: { a: ["pg", "sg", "sf", "pf"] } },
    });
    expect(lineup.slots?.a).toBe("c");
  });

  it("brings a kid on only for a line they play", () => {
    const g = game();
    g.lineup({ ...LINES, bench: ["f"] });
    g.start(1);
    const s = replayBasketballGame(g.events, { nowMs: 5 * MIN });
    const subs = suggestBasketballSubs({
      state: s,
      nowMs: 5 * MIN,
      strategy: "both-lines",
      foulOutAt: 5,
      prefs: { neverLine: { f: ["guard"] } },
    });
    expect(subs).toHaveLength(1);
    expect(subs[0].line).toBe("forward");
  });

  it("starts a kid who plays every minute, whatever their season minutes", () => {
    const season: BasketballSeasonBalance = { time: { a: { court: 90 * MIN } }, weight: 1, periodMs: HALF };
    const { lineup } = suggestBasketballLineup({
      onCourtSize: 5,
      strategy: "minutes",
      players: SQUAD,
      season,
      prefs: { keepOn: ["a"] },
    });
    expect(lineup.lines.court).toContain("a");
  });

  it("leaves a kid who plays every minute on court through a sub", () => {
    const g = game();
    g.lineup(COURT);
    g.start(1);
    const s = replayBasketballGame(g.events, { nowMs: 5 * MIN });
    const subs = suggestBasketballSubs({ state: s, nowMs: 5 * MIN, strategy: "minutes", foulOutAt: 5, prefs: { keepOn: ["a"] } });
    expect(subs.map((x) => x.off_player_id)).not.toContain("a");
    expect(subs).toHaveLength(4);
  });

  it("plays a kid who plays every minute in the next period", () => {
    const g = game();
    g.lineup(LINES);
    g.start(1);
    g.end(1, 20);
    const s = replayBasketballGame(g.events);
    const plan = suggestBasketballBreakPlan({ state: s, onCourtSize: 5, strategy: "both-lines", prefs: { keepOn: ["a"] } });
    expect([...plan!.lineup.lines.guard, ...plan!.lineup.lines.forward]).toContain("a");
  });
});
