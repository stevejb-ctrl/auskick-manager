// An injured-at-break player must be forced off the field onto the bench
// (Steve 2026-06-15: kept the INJ badge but stayed on-field next quarter,
// still accruing minutes).

import { describe, it, expect } from "vitest";
import {
  benchPlayerInLineup,
  benchPlayerInPositionLineup,
  benchSidelinedInLeagueLineup,
  benchSidelinedInLineup,
  replaceInLineup,
} from "@/lib/live/lineupOps";
import type { Lineup } from "@/lib/types";

function makeLineup(): Lineup {
  return {
    back: ["P1", "P2"],
    hback: ["P3"],
    mid: ["P4", "P5"],
    hfwd: ["P6"],
    fwd: ["P7", "P8"],
    bench: ["P9"],
  };
}

describe("benchPlayerInLineup", () => {
  it("moves an on-field player to the bench, vacating their zone", () => {
    const next = benchPlayerInLineup(makeLineup(), "P5");
    expect(next.mid).toEqual(["P4"]); // P5 pulled out
    expect(next.bench).toContain("P5");
    expect(next.bench).toContain("P9"); // existing bench kept
  });

  it("does not mutate the input", () => {
    const original = makeLineup();
    benchPlayerInLineup(original, "P1");
    expect(original.back).toEqual(["P1", "P2"]);
    expect(original.bench).toEqual(["P9"]);
  });

  it("returns the same object when the player is already off the field", () => {
    const lineup = makeLineup();
    expect(benchPlayerInLineup(lineup, "P9")).toBe(lineup); // bench player
    expect(benchPlayerInLineup(lineup, "GHOST")).toBe(lineup); // not in lineup
  });

  it("never double-adds to the bench", () => {
    // (defensive) a player somehow on field AND bench ends up once on bench
    const weird: Lineup = {
      back: ["P1"], hback: [], mid: [], hfwd: [], fwd: [], bench: ["P1"],
    };
    const next = benchPlayerInLineup(weird, "P1");
    expect(next.back).toEqual([]);
    expect(next.bench.filter((id) => id === "P1")).toEqual(["P1"]);
  });
});

describe("benchPlayerInPositionLineup (netball)", () => {
  const court = () => ({
    positions: { GS: ["P1"], GA: ["P2"], C: ["P3"] },
    bench: ["P4"],
  });

  it("vacates the court position and benches the player", () => {
    const next = benchPlayerInPositionLineup(court(), "P2");
    expect(next.positions.GA).toEqual([]); // left empty → blocks Start until filled
    expect(next.bench).toContain("P2");
    expect(next.bench).toContain("P4");
  });

  it("returns the same object for an off-court player", () => {
    const lineup = court();
    expect(benchPlayerInPositionLineup(lineup, "P4")).toBe(lineup);
    expect(benchPlayerInPositionLineup(lineup, "GHOST")).toBe(lineup);
  });
});

describe("benchSidelinedInLeagueLineup", () => {
  const lineup = () => ({
    forwards: ["F1", "F2"],
    backs: ["B1", "B2"],
    bench: ["X1"],
  });

  it("moves injured/loaned off the field to the bench", () => {
    const next = benchSidelinedInLeagueLineup(lineup(), new Set(["F2", "B1"]));
    expect(next.forwards).toEqual(["F1"]);
    expect(next.backs).toEqual(["B2"]);
    expect(next.bench).toEqual(["X1", "F2", "B1"]);
  });

  it("returns the same object when no on-field player is sidelined", () => {
    const l = lineup();
    expect(benchSidelinedInLeagueLineup(l, new Set(["X1"]))).toBe(l); // benched already
    expect(benchSidelinedInLeagueLineup(l, new Set())).toBe(l);
  });
});

// AFL break combos: a kid lent or marked out at the break must not start
// the next quarter on the field, however the draft got there ("Keep last
// quarter" picked after the change, a replacement added beside them).
describe("benchSidelinedInLineup (AFL)", () => {
  it("benches every sidelined kid on the field", () => {
    const next = benchSidelinedInLineup(makeLineup(), new Set(["P1", "P7", "P9"]));
    expect(next.back).toEqual(["P2"]);
    expect(next.fwd).toEqual(["P8"]);
    expect(next.bench).toEqual(["P9", "P1", "P7"]);
  });

  it("returns the same lineup when nobody sidelined is on the field", () => {
    const lineup = makeLineup();
    expect(benchSidelinedInLineup(lineup, new Set(["P9"]))).toBe(lineup);
  });
});

describe("replaceInLineup (AFL)", () => {
  it("the replacement takes the out kid's spot; the out kid goes to the bench", () => {
    const next = replaceInLineup(makeLineup(), "P5", "P9", "mid");
    expect(next.mid).toEqual(["P4", "P9"]);
    expect(next.bench).toEqual(["P5"]);
  });

  it("never leaves the out kid on the field beside the replacement", () => {
    const next = replaceInLineup(makeLineup(), "P5", "P9", "mid");
    const field = (["back", "hback", "mid", "hfwd", "fwd"] as const).flatMap((z) => next[z]);
    expect(field).not.toContain("P5");
    expect(field.filter((p) => p === "P9")).toHaveLength(1);
  });
});
