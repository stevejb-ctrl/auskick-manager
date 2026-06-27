// An injured-at-break player must be forced off the field onto the bench
// (Steve 2026-06-15: kept the INJ badge but stayed on-field next quarter,
// still accruing minutes).

import { describe, it, expect } from "vitest";
import { benchPlayerInLineup } from "@/lib/live/lineupOps";
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
