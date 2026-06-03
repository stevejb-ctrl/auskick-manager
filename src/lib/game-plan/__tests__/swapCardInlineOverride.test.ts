// Inline SwapCard override — pure helpers (RED-first).
//
// The coach overrides the upcoming sub directly on the SwapCard: tap
// the incoming chip to pick a different bench player, or the outgoing
// chip to pick a different same-zone field player. The edited array is
// pinned via the SAME `plannedRotation` slice the Plan-Ahead planner
// uses, so the live game honours it through `resolveHonouredSwaps`.
//
// This spec pins the contract of the pure helpers behind that UI:
//   • eligibleOnReplacements / eligibleOffReplacements — picker options
//     (fit, same-zone for off, no double-use across pairs),
//   • applyInlineSwapOverride — immutable single-pair edit,
//   • swapsEqual / isPairEdited — pin-vs-auto diff for the "Edited"
//     badge + the "edited back to auto ⇒ unpin" decision,
//   • resolveDisplaySuggestions — honour a pin (and keep it visible
//     past the hooter), else suppress past the hooter (spec item 6).

import { describe, it, expect } from "vitest";
import {
  eligibleOnReplacements,
  eligibleOffReplacements,
  applyInlineSwapOverride,
  swapsEqual,
  isPairEdited,
  resolveDisplaySuggestions,
  resolveHonouredSwaps,
} from "@/lib/game-plan";
import type { PlannedRotation } from "@/lib/game-plan";
import type { SwapSuggestion } from "@/lib/fairness";
import type { Lineup } from "@/lib/types";

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

// Two simultaneous engine picks at the next sub-due moment: bring P09
// on for P07 (fwd) and P10 on for P04 (mid).
function makeSwaps(): SwapSuggestion[] {
  return [
    { off_player_id: "P07", on_player_id: "P09", zone: "fwd", gap: 0 },
    { off_player_id: "P04", on_player_id: "P10", zone: "mid", gap: 0 },
  ];
}

describe("eligibleOnReplacements — bench picks for the incoming chip", () => {
  it("offers fit bench players including the current incoming, never one already incoming in another pair", () => {
    const swaps = makeSwaps();
    const opts = eligibleOnReplacements({
      swaps,
      pairIndex: 0,
      lineup: makeLineup(),
      injuredIds: [],
      loanedIds: [],
      lockedIds: [],
    });
    // P09 (this pair's current incoming) + P11 (idle bench). P10 is
    // excluded — it's coming on in pair 1, so reusing it would bring
    // the same kid on twice.
    expect(opts).toContain("P09");
    expect(opts).toContain("P11");
    expect(opts).not.toContain("P10");
  });

  it("drops injured / loaned / locked bench players", () => {
    const opts = eligibleOnReplacements({
      swaps: makeSwaps(),
      pairIndex: 0,
      lineup: makeLineup(),
      injuredIds: ["P11"],
      loanedIds: [],
      lockedIds: ["P09"],
    });
    // P09 locked, P11 injured, P10 used by the other pair → nothing left.
    expect(opts).toEqual([]);
  });
});

describe("eligibleOffReplacements — same-zone field picks for the outgoing chip", () => {
  it("offers same-zone on-field players including the current outgoing, excluding other zones", () => {
    const opts = eligibleOffReplacements({
      swaps: makeSwaps(),
      pairIndex: 0, // fwd zone
      lineup: makeLineup(),
      injuredIds: [],
      loanedIds: [],
      lockedIds: [],
    });
    // fwd zone is [P07, P08]; both eligible. No cross-zone leakage.
    expect(opts).toEqual(["P07", "P08"]);
  });

  it("never offers a player already outgoing in another pair", () => {
    const swaps: SwapSuggestion[] = [
      { off_player_id: "P07", on_player_id: "P09", zone: "fwd", gap: 0 },
      { off_player_id: "P08", on_player_id: "P10", zone: "fwd", gap: 0 },
    ];
    const opts = eligibleOffReplacements({
      swaps,
      pairIndex: 0,
      lineup: makeLineup(),
      injuredIds: [],
      loanedIds: [],
      lockedIds: [],
    });
    // P08 is outgoing in pair 1 → excluded; only P07 (this pair) left.
    expect(opts).toEqual(["P07"]);
  });
});

describe("applyInlineSwapOverride — immutable single-pair edit", () => {
  it("replaces the incoming player of one pair without touching the others", () => {
    const swaps = makeSwaps();
    const next = applyInlineSwapOverride(swaps, 0, { on: "P11" });
    expect(next[0]).toMatchObject({
      off_player_id: "P07",
      on_player_id: "P11",
      zone: "fwd",
    });
    expect(next[1]).toMatchObject({ off_player_id: "P04", on_player_id: "P10" });
    // Input untouched.
    expect(swaps[0].on_player_id).toBe("P09");
  });

  it("replaces the outgoing player and is a no-op for an out-of-range index", () => {
    const swaps = makeSwaps();
    expect(applyInlineSwapOverride(swaps, 1, { off: "P05" })[1]).toMatchObject({
      off_player_id: "P05",
      on_player_id: "P10",
    });
    expect(swapsEqual(applyInlineSwapOverride(swaps, 9, { on: "P11" }), swaps)).toBe(
      true,
    );
  });
});

describe("swapsEqual / isPairEdited — pin-vs-auto diff", () => {
  it("swapsEqual ignores gap but compares off/on/zone in order", () => {
    const a: SwapSuggestion[] = [
      { off_player_id: "P07", on_player_id: "P09", zone: "fwd", gap: 999 },
    ];
    const b: SwapSuggestion[] = [
      { off_player_id: "P07", on_player_id: "P09", zone: "fwd", gap: 0 },
    ];
    expect(swapsEqual(a, b)).toBe(true);
    expect(
      swapsEqual(a, [{ off_player_id: "P07", on_player_id: "P11", zone: "fwd", gap: 0 }]),
    ).toBe(false);
  });

  it("isPairEdited flags a pair that no auto suggestion matches", () => {
    const auto = makeSwaps();
    const edited = applyInlineSwapOverride(auto, 0, { on: "P11" });
    expect(isPairEdited(edited[0], auto)).toBe(true); // overridden incoming
    expect(isPairEdited(edited[1], auto)).toBe(false); // untouched pair
  });
});

// ─── The wire: an inline override pins the SAME slice the planner does ─
describe("inline override → pin parity with the Plan-Ahead planner", () => {
  it("an edited swap array, pinned, is honoured by resolveHonouredSwaps exactly like a planner pin", () => {
    const auto = makeSwaps();
    // Coach overrides pair 0 to bring P11 on instead of P09.
    const edited = applyInlineSwapOverride(auto, 0, { on: "P11" });

    // The live game pins the edited array into the plannedRotation slice
    // — identical shape to GamePlanModal's onPin (gameId + pinnedForPeriod
    // + pinnedSwaps). No separate code path.
    const pin: PlannedRotation = {
      gameId: "game-1",
      pinnedForPeriod: 2,
      pinnedSwaps: edited,
    };

    const honoured = resolveHonouredSwaps({
      pin,
      currentPeriod: 2,
      lineup: makeLineup(),
      injuredIds: [],
      loanedIds: [],
      fallback: auto,
    });
    expect(honoured).toEqual(edited);
    expect(honoured).not.toEqual(auto);
  });

  it("editing back to the auto pick is detectable so the caller can unpin", () => {
    const auto = makeSwaps();
    const edited = applyInlineSwapOverride(auto, 0, { on: "P11" });
    const reverted = applyInlineSwapOverride(edited, 0, { on: "P09" });
    expect(swapsEqual(reverted, auto)).toBe(true); // → caller clears the pin
  });
});

// ─── Compose: the second override re-projects against the first pin ───
describe("two overrides compose without conflict (spec item 5)", () => {
  it("once pair 0 is pinned to bring P11 on, pair 1's incoming options exclude P11", () => {
    const auto = makeSwaps();
    const afterFirst = applyInlineSwapOverride(auto, 0, { on: "P11" });
    // Now the coach opens the picker for pair 1: P11 is taken by pair 0.
    const opts = eligibleOnReplacements({
      swaps: afterFirst,
      pairIndex: 1,
      lineup: makeLineup(),
      injuredIds: [],
      loanedIds: [],
      lockedIds: [],
    });
    expect(opts).not.toContain("P11"); // no double-use
    expect(opts).toContain("P10"); // pair 1's own current incoming stays
  });
});

// ─── resolveDisplaySuggestions — honour + past-hooter carry (item 6) ──
describe("resolveDisplaySuggestions", () => {
  const lineup = makeLineup();
  const raw = makeSwaps();
  const pin: PlannedRotation = {
    gameId: "game-1",
    pinnedForPeriod: 2,
    pinnedSwaps: [
      { off_player_id: "P07", on_player_id: "P11", zone: "fwd", gap: 0 },
    ],
  };

  it("honours a valid pin over the engine pick and reports pinnedActive", () => {
    const r = resolveDisplaySuggestions({
      rawSuggestions: raw,
      subPastHooter: false,
      pin,
      currentPeriod: 2,
      lineup,
      injuredIds: [],
      loanedIds: [],
    });
    expect(r.suggestions).toEqual(pin.pinnedSwaps);
    expect(r.pinnedActive).toBe(true);
    expect(r.pastHooterCarry).toBe(false);
  });

  it("falls back to the engine pick when there is no pin", () => {
    const r = resolveDisplaySuggestions({
      rawSuggestions: raw,
      subPastHooter: false,
      pin: null,
      currentPeriod: 2,
      lineup,
      injuredIds: [],
      loanedIds: [],
    });
    expect(r.suggestions).toEqual(raw);
    expect(r.pinnedActive).toBe(false);
  });

  it("suppresses suggestions past the hooter when NO pin is active", () => {
    const r = resolveDisplaySuggestions({
      rawSuggestions: raw,
      subPastHooter: true,
      pin: null,
      currentPeriod: 2,
      lineup,
      injuredIds: [],
      loanedIds: [],
    });
    expect(r.suggestions).toEqual([]);
  });

  // The regression: a pinned sub used to vanish when the next sub fell
  // past the hooter (baseSuggestions was emptied before honour ran).
  it("KEEPS a pinned sub visible past the hooter and flags the carry state (item 6)", () => {
    const r = resolveDisplaySuggestions({
      rawSuggestions: raw,
      subPastHooter: true,
      pin,
      currentPeriod: 2,
      lineup,
      injuredIds: [],
      loanedIds: [],
    });
    expect(r.suggestions).toEqual(pin.pinnedSwaps);
    expect(r.pinnedActive).toBe(true);
    expect(r.pastHooterCarry).toBe(true);
  });

  it("a stale pin past the hooter is discarded AND stays suppressed", () => {
    const stalePin: PlannedRotation = {
      gameId: "game-1",
      pinnedForPeriod: 2,
      pinnedSwaps: [
        { off_player_id: "GHOST", on_player_id: "P11", zone: "fwd", gap: 0 },
      ],
    };
    const r = resolveDisplaySuggestions({
      rawSuggestions: raw,
      subPastHooter: true,
      pin: stalePin,
      currentPeriod: 2,
      lineup,
      injuredIds: [],
      loanedIds: [],
    });
    expect(r.pinnedActive).toBe(false);
    expect(r.suggestions).toEqual([]); // not honoured, and past hooter
  });
});
