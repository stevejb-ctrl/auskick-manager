// ─── How we played reports every missed Must ─────────────────
// Round 2 usability, 24 Oct 2026:
//
//   - Oztag P2: a half played with 5 boys on for about 3 minutes (the
//     live strip said "5 boys on · rule 4" all that time) read "Rules
//     kept. Everyone played a fair share." The time over the mixed rule
//     is now a missed rule.
//   - League P1 (hp): Tyler finished on 8:00 of 32 with one unbroken
//     quarter. How we played said only "played under 50%" and skipped
//     Law 6, a locked Must. It now says who didn't get their unbroken
//     periods; kids who missed time (late, hurt, lent) are exempt, as
//     they are from the line rules.

import { describe, expect, it } from "vitest";
import { gameReport, type GameReportInput } from "@/lib/playbook/gameReport";
import { mixedBreachMsByPeriod } from "@/lib/sports/touch/mixedBreach";
import { game, MIN } from "@/lib/sports/touch/__tests__/touchGame";
import type { MixedGroup } from "@/lib/types";

const HALF = 15 * MIN;

describe("mixedBreachMsByPeriod", () => {
  // Oztag, cap 4 boys, 7 on: boys b1–b5 and girls g1–g3 (g3 on the bench).
  const groups: Record<string, MixedGroup> = { b1: "boy", b2: "boy", b3: "boy", b4: "boy", b5: "boy", b6: "boy", g1: "girl", g2: "girl", g3: "girl" };
  const rule = { maxBoys: 4, minGirls: 2, minBoys: 0 };
  const lineup = { lines: { middle: [], link: [], wing: [], field: ["b1", "b2", "b3", "b4", "g1", "g2", "g3"] }, bench: ["b5", "b6"] };

  it("adds up the time the field broke the rule, per period", () => {
    const g = game();
    g.lineup(lineup);
    g.start(1);
    // 5:00 a hand sub puts a 5th boy on for a girl; 8:10 a girl comes back on.
    g.swap("g3", "b5", 5);
    g.add("swap", { off_player_id: "b5", on_player_id: "g3", elapsed_ms: 8 * MIN + 10_000 });
    g.end(1, 15);
    g.start(2);
    g.end(2, 15);
    expect(mixedBreachMsByPeriod(g.events, rule, (id) => groups[id])).toEqual({ 1: 3 * MIN + 10_000 });
  });

  it("runs a breach to the hooter, and none for a side that keeps the rule", () => {
    const g = game();
    g.lineup(lineup);
    g.start(1);
    g.swap("g3", "b5", 14);
    g.end(1, 15);
    expect(mixedBreachMsByPeriod(g.events, rule, (id) => groups[id])).toEqual({ 1: MIN });
    const kept = game();
    kept.lineup(lineup);
    kept.start(1);
    kept.end(1, 15);
    expect(mixedBreachMsByPeriod(kept.events, rule, (id) => groups[id])).toEqual({});
  });
});

const base = (over: Partial<GameReportInput> = {}): GameReportInput => ({
  byPeriod: { a: { 1: { field: HALF }, 2: { field: HALF } }, b: { 1: { field: HALF }, 2: { field: HALF } } },
  lines: ["field"],
  lineLabel: (k) => k,
  lineWord: "lane",
  periodLabel: (n) => `half ${n}`,
  periodCount: 2,
  periodMs: HALF,
  minGameTimePct: 50,
  rules: [],
  name: (pid) => ({ a: "Ava", b: "Ben", tyler: "Tyler" })[pid] ?? pid,
  ...over,
});

describe("gameReport: the mixed rule", () => {
  it("a stretch over the rule is a missed rule, with how long and when", () => {
    const report = gameReport(base({ mixedBreachMs: { 1: 3 * MIN + 10_000 } }));
    expect(report.items.find((i) => i.id === "mixed-rule")).toMatchObject({
      status: "fail",
      text: "Mixed rule broken for 3:10 in half 1",
    });
  });

  it("kept all game says so", () => {
    expect(gameReport(base({ mixedBreachMs: {} })).items.find((i) => i.id === "mixed-rule")).toMatchObject({
      status: "ok",
      text: "Mixed rule kept all game",
    });
  });
});

describe("gameReport: league's unbroken periods (Law 6)", () => {
  const Q = 8 * MIN;
  const quarters = (ids: Record<string, number[]>) =>
    Object.fromEntries(Object.entries(ids).map(([pid, ps]) => [pid, Object.fromEntries(ps.map((p) => [p, { field: Q }]))]));

  it("names a kid who didn't get their unbroken quarters", () => {
    const report = gameReport(
      base({
        byPeriod: quarters({ a: [1, 2, 3], b: [1, 3, 4], tyler: [2] }),
        periodCount: 4,
        periodMs: Q,
        periodLabel: (n) => `Q${n}`,
        unbroken: { required: 2, done: { a: 3, b: 3, tyler: 1 }, periodWord: "quarter" },
      }),
    );
    expect(report.items.find((i) => i.id === "unbroken-periods")).toMatchObject({
      status: "fail",
      text: "Tyler didn't get 2 unbroken quarters (Law 6)",
    });
  });

  it("a kid who missed time is exempt", () => {
    const report = gameReport(
      base({
        byPeriod: quarters({ a: [1, 2, 3], b: [1, 3, 4], tyler: [2] }),
        periodCount: 4,
        periodMs: Q,
        away: { tyler: { 3: Q, 4: Q } },
        unbroken: { required: 2, done: { a: 3, b: 3, tyler: 1 }, periodWord: "quarter" },
      }),
    );
    expect(report.items.find((i) => i.id === "unbroken-periods")).toMatchObject({
      status: "ok",
      text: "Everyone who could play all game played 2 unbroken quarters",
    });
  });
});
