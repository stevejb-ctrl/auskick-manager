// The shared rolling-sub pick: equal time, holds, lines, pools and
// composition constraints (a mixed team's boys' cap, a ball handler).

import { describe, expect, it } from "vitest";
import {
  brokenConstraints,
  compositionFixes,
  keepsComposition,
  rollingSubDue,
  suggestRollingSubs,
  type CompositionConstraint,
} from "@/lib/live/rollingSubs";

const MIN = 60_000;
type L = "a" | "b";

function minutes(table: Record<string, number>) {
  return (id: string) => (table[id] ?? 0) * MIN;
}

describe("suggestRollingSubs", () => {
  it("brings the bench kids with least time on for the field kids with most", () => {
    const subs = suggestRollingSubs<L>({
      field: [
        { id: "p1", line: "a" },
        { id: "p2", line: "a" },
        { id: "p3", line: "b" },
      ],
      bench: ["b1", "b2"],
      gameMs: minutes({ p1: 10, p2: 6, p3: 8, b1: 2, b2: 0 }),
    });
    expect(subs).toEqual([
      { off: "p1", on: "b2", line: "a" },
      { off: "p3", on: "b1", line: "b" },
    ]);
  });

  it("makes no sub that doesn't even time", () => {
    const subs = suggestRollingSubs<L>({
      field: [{ id: "p1", line: "a" }],
      bench: ["b1"],
      gameMs: minutes({ p1: 3, b1: 3 }),
    });
    expect(subs).toEqual([]);
  });

  it("never takes off a kid held on or one who plays every minute", () => {
    const subs = suggestRollingSubs<L>({
      field: [
        { id: "p1", line: "a" },
        { id: "p2", line: "a" },
        { id: "p3", line: "b" },
      ],
      bench: ["b1", "b2"],
      gameMs: minutes({ p1: 10, p2: 9, p3: 1 }),
      held: (id) => id === "p1",
      keepOn: (id) => id === "p2",
    });
    expect(subs).toEqual([{ off: "p3", on: "b1", line: "b" }]);
  });

  it("holds a kid to one line, and lets them prefer one", () => {
    const field = [
      { id: "p1", line: "a" as const },
      { id: "p2", line: "b" as const },
    ];
    const gameMs = minutes({ p1: 10, p2: 8 });
    expect(suggestRollingSubs<L>({ field, bench: ["b1"], gameMs, onlyLine: () => "b" })).toEqual([
      { off: "p2", on: "b1", line: "b" },
    ]);
    expect(suggestRollingSubs<L>({ field, bench: ["b1"], gameMs, preferLine: () => "b" })).toEqual([
      { off: "p2", on: "b1", line: "b" },
    ]);
    // A line they don't play: never.
    expect(suggestRollingSubs<L>({ field, bench: ["b1"], gameMs, plays: (_, line) => line === "a" })).toEqual([
      { off: "p1", on: "b1", line: "a" },
    ]);
  });

  it("evens time within each pool: a kid comes on only for one of their own", () => {
    const group: Record<string, string> = { g1: "girl", g2: "girl", gb: "girl", b1: "boy", b2: "boy", bb: "boy" };
    const subs = suggestRollingSubs<L>({
      field: [
        { id: "g1", line: "a" },
        { id: "g2", line: "a" },
        { id: "b1", line: "b" },
        { id: "b2", line: "b" },
      ],
      // The girl on the bench has less time than every boy on the field.
      bench: ["gb", "bb"],
      gameMs: minutes({ g1: 4, g2: 5, b1: 10, b2: 9, gb: 1, bb: 2 }),
      pool: (id) => group[id],
    });
    expect(subs).toEqual([
      { off: "g2", on: "gb", line: "a" },
      { off: "b1", on: "bb", line: "b" },
    ]);
  });

  it("at the boys' cap, a boy only comes on for a boy", () => {
    const boys = new Set(["b1", "b2", "b3", "b4"]);
    const tags = (id: string) => (boys.has(id) ? ["boy"] : ["girl"]);
    const constraints: CompositionConstraint[] = [
      { tag: "boy", max: 3, min: 1 },
      { tag: "girl", min: 1 },
    ];
    const subs = suggestRollingSubs<L>({
      field: [
        { id: "b1", line: "a" },
        { id: "b2", line: "a" },
        { id: "b3", line: "b" },
        { id: "g1", line: "b" },
      ],
      bench: ["b4"],
      // The girl has the most time, but taking her off for a boy breaks the cap.
      gameMs: minutes({ g1: 12, b1: 8, b2: 7, b3: 6, b4: 0 }),
      tags,
      constraints,
    });
    expect(subs).toEqual([{ off: "b1", on: "b4", line: "a" }]);
  });

  it("brings a field over the boys' cap back first: a girl on for a boy, across pools and before time evens", () => {
    // A hand sub put a fourth boy on. The girl on the bench has more time
    // than anyone on, and pools keep girls for girls, but the rule comes
    // first: she comes on for the boy on longest.
    const boys = new Set(["b1", "b2", "b3", "b4", "b5"]);
    const tags = (id: string) => (boys.has(id) ? ["boy"] : ["girl"]);
    const pool = (id: string) => tags(id)[0];
    const constraints: CompositionConstraint[] = [
      { tag: "boy", max: 3, min: 1 },
      { tag: "girl", min: 1 },
    ];
    const subs = suggestRollingSubs<L>({
      field: [
        { id: "b1", line: "a" },
        { id: "b2", line: "a" },
        { id: "b3", line: "b" },
        { id: "b4", line: "b" },
        { id: "g1", line: "b" },
      ],
      bench: ["b5", "g2"],
      gameMs: minutes({ b1: 6, b2: 8, b3: 5, b4: 1, g1: 7, b5: 0, g2: 9 }),
      tags,
      constraints,
      pool,
    });
    expect(subs[0]).toEqual({ off: "b2", on: "g2", line: "a" });
    // Then the evening subs keep the rule: b5 comes on for a boy.
    expect(subs.slice(1)).toEqual([{ off: "b1", on: "b5", line: "a" }]);
  });

  it("compositionFixes: only the subs that bring the field back inside the rule", () => {
    const tags = (id: string) => (id.startsWith("b") ? ["boy"] : ["girl"]);
    const constraints: CompositionConstraint[] = [{ tag: "boy", max: 3 }, { tag: "girl", min: 1 }];
    const input = {
      field: [
        { id: "b1", line: "a" as const },
        { id: "b2", line: "a" as const },
        { id: "b3", line: "b" as const },
        { id: "b4", line: "b" as const },
      ],
      bench: ["b5", "g1", "g2"],
      gameMs: minutes({ b1: 6, b2: 8, b3: 5, b4: 1, b5: 0, g1: 4, g2: 2 }),
      held: (id: string) => id === "b2",
      tags,
      constraints,
    };
    // Four boys and no girl: one girl on fixes both (b2 is held on).
    expect(compositionFixes<L>(input)).toEqual([{ off: "b1", on: "g2", line: "a" }]);
    // Inside the rule already: nothing to fix.
    expect(compositionFixes<L>({ ...input, field: [...input.field.slice(1), { id: "g3", line: "a" }] })).toEqual([]);
    // No girl to bring on: no fix.
    expect(compositionFixes<L>({ ...input, bench: ["b5"] })).toEqual([]);
  });

  it("keeps a ball handler on: the last one off only for another", () => {
    const tags = (id: string) => (id === "h1" || id === "h2" ? ["handler"] : []);
    const field = [
      { id: "h1", line: "a" as const },
      { id: "p1", line: "a" as const },
    ];
    const gameMs = minutes({ h1: 10, p1: 2 });
    const constraints = [{ tag: "handler", min: 1 }];
    expect(suggestRollingSubs<L>({ field, bench: ["x"], gameMs, tags, constraints })).toEqual([
      { off: "p1", on: "x", line: "a" },
    ]);
    expect(suggestRollingSubs<L>({ field, bench: ["h2"], gameMs, tags, constraints })).toEqual([
      { off: "h1", on: "h2", line: "a" },
    ]);
  });

  it("rests kids who just went off and keeps on kids who just came on, while others can", () => {
    const subs = suggestRollingSubs<L>({
      field: [
        { id: "p1", line: "a" },
        { id: "p2", line: "a" },
      ],
      bench: ["b1", "b2"],
      gameMs: minutes({ p1: 10, p2: 6, b1: 0, b2: 1 }),
      justOn: (id) => id === "p1",
      justOff: (id) => id === "b1",
      maxSubs: 1,
    });
    expect(subs).toEqual([{ off: "p2", on: "b2", line: "a" }]);
  });
});

describe("composition", () => {
  const tags = (id: string) => (id.startsWith("b") ? ["boy"] : ["girl"]);
  const constraints: CompositionConstraint[] = [{ tag: "boy", max: 3 }, { tag: "girl", min: 1 }];

  it("names the constraints a field breaks", () => {
    expect(brokenConstraints(["b1", "b2", "b3", "b4"], tags, constraints)).toEqual([
      { constraint: { tag: "boy", max: 3 }, count: 4 },
      { constraint: { tag: "girl", min: 1 }, count: 0 },
    ]);
    expect(brokenConstraints(["b1", "g1"], tags, constraints)).toEqual([]);
  });

  it("lets a field outside a constraint take subs that bring it back, never further out", () => {
    const over = { boy: 4, girl: 0 };
    expect(keepsComposition(over, "b1", "g1", tags, constraints)).toBe(true);
    expect(keepsComposition(over, "b1", "b2", tags, constraints)).toBe(true);
    expect(keepsComposition({ boy: 3, girl: 1 }, "g1", "b4", tags, constraints)).toBe(false);
    // A fill (nobody off) and a kid leaving (nobody on).
    expect(keepsComposition({ boy: 3, girl: 1 }, null, "b4", tags, constraints)).toBe(false);
    expect(keepsComposition({ boy: 2, girl: 1 }, "g1", null, tags, constraints)).toBe(false);
  });
});

describe("rollingSubDue", () => {
  it("is due an interval after the last planned sub, and quiet in the cutoff", () => {
    const base = { subIntervalMs: 4 * MIN, periodMs: 20 * MIN, anchorMs: 0 };
    expect(rollingSubDue({ ...base, elapsedMs: 3 * MIN })).toMatchObject({ due: false, msUntilDue: MIN });
    expect(rollingSubDue({ ...base, elapsedMs: 4 * MIN }).due).toBe(true);
    expect(rollingSubDue({ ...base, anchorMs: 16 * MIN, elapsedMs: 20 * MIN, cutoffMs: MIN }).due).toBe(false);
    expect(rollingSubDue({ ...base, anchorMs: null, elapsedMs: 5 * MIN }).due).toBe(false);
  });
});
