// Plan-ahead rotation — pin derivation (diffPlanToSwaps).
//
// When a coach tweaks the upcoming period in the shared planner (F1), we
// must translate the EDITED current period back into AFL rolling-sub
// pairs the live game can honour. `diffPlanToSwaps` is that pure
// translation. Its contract:
//
//   • emit ONE swap per genuine bench↔field move, matched per-zone —
//     an incoming player who came on from the live bench paired with an
//     outgoing player who left that zone to the edited bench,
//   • the swap's `zone` is the group id (the outgoing player's live zone
//     AND the incoming player's edited destination — keeps applySwap
//     correct),
//   • field↔field zone reshuffles and bench reorders emit NOTHING (they
//     are not subs),
//   • it is pure + deterministic.

import { describe, it, expect } from "vitest";
import { diffPlanToSwaps } from "@/lib/game-plan";

// Live reality: 3-zone AFL, two on each line, three resting.
function makeLive() {
  return {
    liveGroups: {
      back: ["P01", "P02"],
      mid: ["P03", "P04"],
      fwd: ["P05", "P06"],
    } as Record<string, string[]>,
    liveBench: ["P07", "P08", "P09"],
  };
}

describe("diffPlanToSwaps — a single bench↔field tweak in one zone", () => {
  it("emits one swap: off = the benched field player, on = the promoted bench player, zone = that line", () => {
    const { liveGroups, liveBench } = makeLive();
    // Coach swaps P05 (fwd, on-field) for P07 (bench).
    const result = diffPlanToSwaps({
      liveGroups,
      liveBench,
      editedGroups: {
        back: ["P01", "P02"],
        mid: ["P03", "P04"],
        fwd: ["P07", "P06"],
      },
      editedBench: ["P05", "P08", "P09"],
    });
    expect(result).toEqual([
      { off_player_id: "P05", on_player_id: "P07", zone: "fwd", gap: 0 },
    ]);
  });
});

describe("diffPlanToSwaps — non-subs emit nothing", () => {
  it("returns [] when the edited period equals live reality", () => {
    const { liveGroups, liveBench } = makeLive();
    const result = diffPlanToSwaps({
      liveGroups,
      liveBench,
      editedGroups: { ...liveGroups },
      editedBench: [...liveBench],
    });
    expect(result).toEqual([]);
  });

  it("ignores a field↔field zone reshuffle (both players stay on)", () => {
    const { liveGroups, liveBench } = makeLive();
    // P02 (back) and P03 (mid) swap zones — neither touches the bench.
    const result = diffPlanToSwaps({
      liveGroups,
      liveBench,
      editedGroups: {
        back: ["P01", "P03"],
        mid: ["P02", "P04"],
        fwd: ["P05", "P06"],
      },
      editedBench: [...liveBench],
    });
    expect(result).toEqual([]);
  });

  it("ignores a bench-only reorder", () => {
    const { liveGroups } = makeLive();
    const result = diffPlanToSwaps({
      liveGroups,
      liveBench: ["P07", "P08", "P09"],
      editedGroups: { ...liveGroups },
      editedBench: ["P09", "P07", "P08"],
    });
    expect(result).toEqual([]);
  });
});

describe("diffPlanToSwaps — multiple subs across zones", () => {
  it("emits one swap per zone where a bench↔field exchange happened", () => {
    const { liveGroups, liveBench } = makeLive();
    // Two subs: P01→bench / P07→back, and P05→bench / P08→fwd.
    const result = diffPlanToSwaps({
      liveGroups,
      liveBench,
      editedGroups: {
        back: ["P07", "P02"],
        mid: ["P03", "P04"],
        fwd: ["P08", "P06"],
      },
      editedBench: ["P01", "P05", "P09"],
    });
    expect(result).toEqual(
      expect.arrayContaining([
        { off_player_id: "P01", on_player_id: "P07", zone: "back", gap: 0 },
        { off_player_id: "P05", on_player_id: "P08", zone: "fwd", gap: 0 },
      ]),
    );
    expect(result).toHaveLength(2);
  });
});

describe("diffPlanToSwaps — purity", () => {
  it("does not mutate inputs and is deterministic", () => {
    const { liveGroups, liveBench } = makeLive();
    const editedGroups = {
      back: ["P01", "P02"],
      mid: ["P03", "P04"],
      fwd: ["P07", "P06"],
    };
    const editedBench = ["P05", "P08", "P09"];
    const snapshot = JSON.stringify({ liveGroups, liveBench, editedGroups, editedBench });

    const a = diffPlanToSwaps({ liveGroups, liveBench, editedGroups, editedBench });
    const b = diffPlanToSwaps({ liveGroups, liveBench, editedGroups, editedBench });

    expect(a).toEqual(b);
    expect(JSON.stringify({ liveGroups, liveBench, editedGroups, editedBench })).toBe(
      snapshot,
    );
  });
});
