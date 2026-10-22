// The period break's sport-neutral board: slots from a staged lineup,
// tap-tap swaps (a bib stays with its slot), movement text, low time,
// and the one-swap Fix search.

import { describe, expect, it } from "vitest";
import {
  BENCH,
  buildBoard,
  canSwap,
  findFixSwap,
  isLowTime,
  movementText,
  placeIndex,
  placesOf,
  swapInStaged,
  type BoardSlot,
  type StagedLineup,
} from "@/lib/live/break/board";
import { breakIssues } from "@/lib/live/break/issues";
import { rotateGroups } from "@/lib/live/break/rotateGroups";
import type { BreakZoneDef } from "@/lib/sports/types";
import type { RuleCheckItem } from "@/lib/playbook/ruleCheck";

const AFL: BreakZoneDef[] = [
  { key: "fwd", label: "FORWARD", short: "Fwd", color: "zone1", slots: 2 },
  { key: "mid", label: "CENTRE", short: "Centre", color: "zone2", slots: 2 },
  { key: "back", label: "BACK", short: "Back", color: "zone3", slots: 2 },
];
const NETBALL: BreakZoneDef[] = [
  { key: "attack", label: "ATTACK", short: "Attack", color: "zone1", slots: 2, slotIds: ["gs", "ga"], slotLabels: ["GS", "GA"] },
];

const staged: StagedLineup = { groups: { fwd: ["a", "b"], mid: ["c"], back: ["d", "e"] }, bench: ["x", "hurt", "y"] };
const at = (slots: BoardSlot[], id: string) => slots.find((s) => s.playerId === id) as BoardSlot;

describe("buildBoard", () => {
  it("lays out each zone's slots, empties included, then the bench with sidelined kids last", () => {
    const slots = buildBoard(AFL, staged, new Set(["hurt"]));
    expect(slots.map((s) => [s.zone, s.playerId])).toEqual([
      ["fwd", "a"],
      ["fwd", "b"],
      ["mid", "c"],
      ["mid", null],
      ["back", "d"],
      ["back", "e"],
      [BENCH, "x"],
      [BENCH, "y"],
      [BENCH, "hurt"],
    ]);
  });

  it("gives a kid over the zone's count a slot rather than losing them", () => {
    const slots = buildBoard(AFL, { groups: { fwd: ["a", "b", "c"] }, bench: [] });
    expect(slots.filter((s) => s.zone === "fwd").map((s) => s.playerId)).toEqual(["a", "b", "c"]);
  });

  it("netball: one slot per bib, the bib on the slot", () => {
    const slots = buildBoard(NETBALL, { groups: { gs: ["a"], ga: [] }, bench: ["b"] });
    expect(slots.map((s) => [s.group, s.label, s.playerId])).toEqual([
      ["gs", "GS", "a"],
      ["ga", "GA", null],
      [BENCH, undefined, "b"],
    ]);
  });
});

describe("swapInStaged", () => {
  const slots = buildBoard(AFL, staged, new Set(["hurt"]));

  it("swaps two kids across zones", () => {
    expect(swapInStaged(staged, at(slots, "a"), at(slots, "d")).groups).toMatchObject({ fwd: ["d", "b"], back: ["a", "e"] });
  });

  it("swaps a field kid with the bench", () => {
    const next = swapInStaged(staged, at(slots, "x"), at(slots, "c"));
    expect(next.groups.mid).toEqual(["x"]);
    expect(next.bench).toEqual(["c", "hurt", "y"]);
  });

  it("moves a kid into an empty slot, leaving theirs empty", () => {
    const empty = slots.find((s) => s.zone === "mid" && !s.playerId) as BoardSlot;
    const next = swapInStaged(staged, at(slots, "y"), empty);
    expect(next.groups.mid).toEqual(["c", "y"]);
    expect(next.bench).toEqual(["x", "hurt"]);
  });

  it("netball: the kids move, the bibs stay", () => {
    const nb: StagedLineup = { groups: { gs: ["a"], ga: ["b"] }, bench: [] };
    const s = buildBoard(NETBALL, nb);
    expect(swapInStaged(nb, s[0], s[1]).groups).toEqual({ gs: ["b"], ga: ["a"] });
  });

  it("won't swap two bench kids, two empties or a sidelined kid", () => {
    const hurt = new Set(["hurt"]);
    expect(canSwap(at(slots, "x"), at(slots, "y"), hurt)).toBe(false);
    expect(canSwap(at(slots, "hurt"), at(slots, "a"), hurt)).toBe(false);
    expect(canSwap(at(slots, "a"), at(slots, "y"), hurt)).toBe(true);
  });
});

describe("movement", () => {
  const places = placeIndex([...AFL, ...NETBALL]);
  const prev = placesOf({ groups: { fwd: ["a"], back: ["b"], gs: ["n"] }, bench: ["c"] });

  it("says where a kid has come from", () => {
    expect(movementText(prev.a, "fwd", places)).toBe("Stays");
    expect(movementText(prev.b, "fwd", places)).toBe("From Back");
    expect(movementText(prev.c, "mid", places)).toBe("From bench");
    expect(movementText(prev.a, BENCH, places)).toBe("From Fwd");
    expect(movementText(undefined, "mid", places)).toBe("From bench");
    expect(movementText(prev.n, "ga", places)).toBe("From GS");
  });

  it("flags time the threshold or more under the average", () => {
    expect(isLowTime(16 * 60_000, 20 * 60_000, 4 * 60_000)).toBe(true);
    expect(isLowTime(17 * 60_000, 20 * 60_000, 4 * 60_000)).toBe(false);
  });
});

describe("Fix", () => {
  // A rule: "x" must not be on the bench (stands in for "sat out twice").
  const check = (s: StagedLineup): RuleCheckItem[] => [
    { id: "bench-twice", status: s.bench.includes("x") ? "fail" : "ok", text: "x sits out again", playerIds: ["x"] },
    { id: "keep-a", status: s.bench.includes("a") ? "fail" : "ok", text: "a must play" },
  ];
  const sidelined = new Set(["hurt"]);
  const slots = buildBoard(AFL, staged, sidelined);

  it("finds a single swap that clears the rule without breaking another", () => {
    const fix = findFixSwap({
      slots,
      sidelined,
      itemId: "bench-twice",
      offenders: ["x"],
      failing: new Set(["bench-twice"]),
      failingAfter: (a, b) => new Set(check(swapInStaged(staged, a, b)).filter((i) => i.status === "fail").map((i) => i.id)),
    });
    expect(fix).not.toBeNull();
    const after = swapInStaged(staged, fix![0], fix![1]);
    expect(after.bench).not.toContain("x");
    expect(after.bench).not.toContain("a");
  });

  it("gives up (no Fix) when no single swap works", () => {
    const fix = findFixSwap({
      slots,
      sidelined,
      itemId: "bench-twice",
      failing: new Set(["bench-twice"]),
      failingAfter: () => new Set(["bench-twice"]),
    });
    expect(fix).toBeNull();
  });

  it("breakIssues: broken rules carry their fix; warnings fold together", () => {
    const issues = breakIssues({
      items: [...check(staged), { id: "w", status: "warn", text: "Pete hasn't played Centre" }],
      slots,
      sidelined,
      checkAfter: (a, b) => check(swapInStaged(staged, a, b)),
      extraWarnings: ["1 spot is empty"],
    });
    expect(issues.broken.map((i) => i.id)).toEqual(["bench-twice"]);
    expect(issues.broken[0].fix).toBeDefined();
    expect(issues.warnings).toEqual(["1 spot is empty", "Pete hasn't played Centre"]);
  });
});

describe("rotateGroups", () => {
  it("moves everyone one group along, least-played on", () => {
    const time: Record<string, number> = { a: 10, b: 10, c: 10, d: 10, e: 5 };
    const out = rotateGroups({
      players: ["a", "b", "c", "d", "e"],
      cycle: ["def", "mid", "att"],
      caps: { def: 1, mid: 2, att: 1 },
      timeIn: () => 0,
      total: (id) => time[id],
      lastGroup: { a: "def", b: "mid", c: "mid", d: "att" },
    });
    expect(out.groups.mid).toContain("a");
    expect(out.groups.att).toHaveLength(1);
    expect(out.groups.def).toHaveLength(1);
    // e has the least time: they come on.
    expect(out.bench).toHaveLength(1);
    expect(out.bench).not.toContain("e");
  });

  it("one group: just brings the least-played on", () => {
    const time: Record<string, number> = { a: 9, b: 1, c: 5 };
    const out = rotateGroups({
      players: ["a", "b", "c"],
      cycle: ["court"],
      caps: { court: 2 },
      timeIn: () => 0,
      total: (id) => time[id],
      lastGroup: { a: "court", c: "court" },
    });
    expect(out.groups.court.sort()).toEqual(["b", "c"]);
    expect(out.bench).toEqual(["a"]);
  });
});
