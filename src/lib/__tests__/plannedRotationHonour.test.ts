// Plan-ahead rotation — pinned-sub honour / stale-guard (RED-first).
//
// Once a coach pins an upcoming AFL sub (F1), the live game must HONOUR
// the pinned swaps when the sub falls due — but only when they are still
// valid. `resolveHonouredSwaps` is the pure decision behind that:
//
//   • a VALID pin (off on-field, on a swappable bench, neither
//     injured/loaned, pinnedForPeriod === current) REPLACES the live
//     suggester's swaps,
//   • a STALE pin (the incoming player is now injured / loaned / no
//     longer on the bench, or the outgoing player has left the field) is
//     DISCARDED whole and the live suggester (fallback) is used — never
//     apply an invalid swap (threat T-11-01-A / D-09),
//   • a WRONG-PERIOD pin (pinnedForPeriod !== current) is ignored.
//
// The pin is the `plannedRotation` slice the live store persists; this
// spec pins its honour/validation contract before the helper exists.

import { describe, it, expect } from "vitest";
import { resolveHonouredSwaps } from "@/lib/game-plan";
import type { PlannedRotation } from "@/lib/game-plan";
import type { SwapSuggestion } from "@/lib/fairness";
import type { Lineup } from "@/lib/types";

// A representative AFL on-field lineup + bench.
function makeLineup(): Lineup {
  return {
    back: ["P01", "P02"],
    hback: ["P03"],
    mid: ["P04", "P05"],
    hfwd: ["P06"],
    fwd: ["P07", "P08"],
    bench: ["P09", "P10", "P11"],
  };
}

// What the live suggester would pick if we ignored the pin.
const fallback: SwapSuggestion[] = [
  { off_player_id: "P08", on_player_id: "P10", zone: "fwd", gap: 4321 },
];

// A valid plannedRotation pin for the CURRENT period (Q2 = period 2):
// bring P09 (bench) on for P07 (on-field, fwd).
function makePin(overrides: Partial<PlannedRotation> = {}): PlannedRotation {
  return {
    gameId: "game-1",
    pinnedForPeriod: 2,
    pinnedSwaps: [
      { off_player_id: "P07", on_player_id: "P09", zone: "fwd", gap: 0 },
    ],
    ...overrides,
  };
}

describe("resolveHonouredSwaps — a valid plannedRotation pin", () => {
  it("replaces the live suggester's swaps with the pinned swaps", () => {
    const pin = makePin();
    const result = resolveHonouredSwaps({
      pin,
      currentPeriod: 2,
      lineup: makeLineup(),
      injuredIds: [],
      loanedIds: [],
      fallback,
    });
    expect(result).toEqual(pin.pinnedSwaps);
    // Explicitly NOT the fallback.
    expect(result).not.toEqual(fallback);
  });
});

describe("resolveHonouredSwaps — a stale plannedRotation pin falls back (D-09)", () => {
  it("discards the pin when the incoming player is now injured", () => {
    const result = resolveHonouredSwaps({
      pin: makePin(),
      currentPeriod: 2,
      lineup: makeLineup(),
      injuredIds: ["P09"], // the pinned on-player got hurt
      loanedIds: [],
      fallback,
    });
    expect(result).toEqual(fallback);
  });

  it("discards the pin when the incoming player is now loaned out", () => {
    const result = resolveHonouredSwaps({
      pin: makePin(),
      currentPeriod: 2,
      lineup: makeLineup(),
      injuredIds: [],
      loanedIds: ["P09"], // lent to another team
      fallback,
    });
    expect(result).toEqual(fallback);
  });

  it("discards the pin when the incoming player is no longer on the bench", () => {
    const result = resolveHonouredSwaps({
      pin: makePin({
        pinnedSwaps: [
          { off_player_id: "P07", on_player_id: "GHOST", zone: "fwd", gap: 0 },
        ],
      }),
      currentPeriod: 2,
      lineup: makeLineup(),
      injuredIds: [],
      loanedIds: [],
      fallback,
    });
    expect(result).toEqual(fallback);
  });

  it("discards the pin when the outgoing player has left the field", () => {
    const result = resolveHonouredSwaps({
      pin: makePin({
        pinnedSwaps: [
          { off_player_id: "GHOST", on_player_id: "P09", zone: "fwd", gap: 0 },
        ],
      }),
      currentPeriod: 2,
      lineup: makeLineup(),
      injuredIds: [],
      loanedIds: [],
      fallback,
    });
    expect(result).toEqual(fallback);
  });
});

describe("resolveHonouredSwaps — a wrong-period or absent pin falls back", () => {
  it("ignores a pin whose pinnedForPeriod !== current period", () => {
    const result = resolveHonouredSwaps({
      pin: makePin({ pinnedForPeriod: 2 }),
      currentPeriod: 3, // advanced past the pinned period
      lineup: makeLineup(),
      injuredIds: [],
      loanedIds: [],
      fallback,
    });
    expect(result).toEqual(fallback);
  });

  it("uses the fallback when there is no pin", () => {
    const result = resolveHonouredSwaps({
      pin: null,
      currentPeriod: 2,
      lineup: makeLineup(),
      injuredIds: [],
      loanedIds: [],
      fallback,
    });
    expect(result).toEqual(fallback);
  });
});
