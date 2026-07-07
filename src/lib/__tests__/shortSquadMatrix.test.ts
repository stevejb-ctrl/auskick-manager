// Cross-age-group test matrix for the short-squad capability.
//
// Steve 2026-05-23: after the AFL match-day fix (blank-zone stuck
// in Forwards, 8a92f71) and the netball mirror (2760d76 + 98de84e +
// 751f0a6), this spec pins the behaviour across every AFL age
// group AND every netball age group so a future refactor of
// `zoneCapsFor` / `pickNetballPositionsToFill` /
// `deriveEffectiveZoneCaps` can't silently re-introduce the bug
// for a less-common age group.
//
// Three sections:
//
//   1. AFL `zoneCapsFor` × age-group × on-field-size
//      Default-quarter fill priority: [mid, back, fwd]. Asserts
//      which zone the blank-slot lands in first as the coach
//      drops below the age group's defaultOnFieldSize.
//
//   2. AFL `deriveEffectiveZoneCaps` (the Q-break preservation)
//      Given a previous quarter's lineup with a non-default
//      blank zone, the next quarter's caps should preserve that
//      shape. With size mismatch, fall back to fresh derivation.
//
//   3. Netball `pickNetballPositionsToFill` × age-group ×
//      on-field-size. Drop priority: wings first for 7-position
//      groups, centre first for Set. Asserts the exact positions
//      to fill for each valid (ageGroup, onFieldSize) pair, plus
//      the alreadyFilled preservation contract.

import { describe, expect, it } from "vitest";
import { AGE_GROUPS } from "@/lib/ageGroups";
import {
  deriveEffectiveZoneCaps,
  effectiveDisplayZoneCaps,
  zoneCapsFor,
  type ZoneCaps,
} from "@/lib/fairness";
import { netballSport, pickNetballPositionsToFill } from "@/lib/sports";
import type { Lineup, PositionModel } from "@/lib/types";

// ──────────────────────────────────────────────────────────────
// SECTION 1: AFL zoneCapsFor × age group × short-squad sizes
// ──────────────────────────────────────────────────────────────

// Helper: build a Lineup with a given per-zone count distribution.
// Player ids are synthetic ("p0".."pN") because the cap derivation
// only cares about array lengths.
function lineupWithCounts(counts: Partial<ZoneCaps>): Lineup {
  let id = 0;
  const ids = (n: number) =>
    Array.from({ length: n }, () => `p${id++}`);
  return {
    back: ids(counts.back ?? 0),
    hback: ids(counts.hback ?? 0),
    mid: ids(counts.mid ?? 0),
    hfwd: ids(counts.hfwd ?? 0),
    fwd: ids(counts.fwd ?? 0),
    bench: [],
  };
}

describe("AFL zoneCapsFor — short-squad fill priority across age groups", () => {
  // Every AFL age group is `zones3` today (per ageGroups.ts:108-
  // comment block). The priority for short-squad remainders is
  // [mid, back, fwd] — so the blank slot lands in FWD first when
  // total is one short of default, then BACK + FWD when two short.

  // U8 (default 6, range 4-9)
  describe("U8: default 6, three zones", () => {
    it("6 on field → even 2-2-2", () => {
      expect(zoneCapsFor(6, "zones3")).toEqual({
        back: 2, hback: 0, mid: 2, hfwd: 0, fwd: 2,
      });
    });
    it("5 on field → blank in FWD (mid=2, back=2, fwd=1)", () => {
      expect(zoneCapsFor(5, "zones3")).toEqual({
        back: 2, hback: 0, mid: 2, hfwd: 0, fwd: 1,
      });
    });
    it("4 on field → blank in BACK + FWD (mid=2, back=1, fwd=1)", () => {
      expect(zoneCapsFor(4, "zones3")).toEqual({
        back: 1, hback: 0, mid: 2, hfwd: 0, fwd: 1,
      });
    });
  });

  // U9 (default 9, range 6-12)
  describe("U9: default 9", () => {
    it("9 on field → even 3-3-3", () => {
      expect(zoneCapsFor(9, "zones3")).toEqual({
        back: 3, hback: 0, mid: 3, hfwd: 0, fwd: 3,
      });
    });
    it("8 on field → blank in FWD (3-3-2)", () => {
      expect(zoneCapsFor(8, "zones3")).toEqual({
        back: 3, hback: 0, mid: 3, hfwd: 0, fwd: 2,
      });
    });
    it("7 on field → blank in BACK + FWD (3-2-2)", () => {
      expect(zoneCapsFor(7, "zones3")).toEqual({
        back: 2, hback: 0, mid: 3, hfwd: 0, fwd: 2,
      });
    });
  });

  // U10/U11/U12 — all default 12 (per AFL Community Policy)
  describe("U10/U11/U12: default 12 — Steve's match-day case", () => {
    it("12 on field → even 4-4-4", () => {
      expect(zoneCapsFor(12, "zones3")).toEqual({
        back: 4, hback: 0, mid: 4, hfwd: 0, fwd: 4,
      });
    });
    it("11 on field → blank in FWD (4-4-3) — the original bug", () => {
      // Coach's exact match-day report: U10s, 11 players, blank
      // stuck in Forwards. zoneCapsFor confirms the default
      // distribution; the FIX is that the coach can now move the
      // blank zone via the swap-to-empty flow, and Q2's break
      // preserves whichever zone they chose. The default itself
      // here is unchanged — Steve picked option 3A.
      expect(zoneCapsFor(11, "zones3")).toEqual({
        back: 4, hback: 0, mid: 4, hfwd: 0, fwd: 3,
      });
    });
    it("10 on field → blank in BACK + FWD (4-3-3)", () => {
      expect(zoneCapsFor(10, "zones3")).toEqual({
        back: 3, hback: 0, mid: 4, hfwd: 0, fwd: 3,
      });
    });
    it("9 on field → even 3-3-3", () => {
      expect(zoneCapsFor(9, "zones3")).toEqual({
        back: 3, hback: 0, mid: 3, hfwd: 0, fwd: 3,
      });
    });
  });

  // U13/U14/U15 — all default 15
  describe("U13/U14/U15: default 15", () => {
    it("15 on field → even 5-5-5", () => {
      expect(zoneCapsFor(15, "zones3")).toEqual({
        back: 5, hback: 0, mid: 5, hfwd: 0, fwd: 5,
      });
    });
    it("14 on field → blank in FWD (5-5-4)", () => {
      expect(zoneCapsFor(14, "zones3")).toEqual({
        back: 5, hback: 0, mid: 5, hfwd: 0, fwd: 4,
      });
    });
    it("13 on field → blank in BACK + FWD (5-4-4)", () => {
      expect(zoneCapsFor(13, "zones3")).toEqual({
        back: 4, hback: 0, mid: 5, hfwd: 0, fwd: 4,
      });
    });
    it("12 on field → even 4-4-4", () => {
      expect(zoneCapsFor(12, "zones3")).toEqual({
        back: 4, hback: 0, mid: 4, hfwd: 0, fwd: 4,
      });
    });
  });

  // U16/U17 — default 18 (legacy entries — newer split groups
  // have the same defaults). Hits the 18-player ceiling exactly.
  describe("U16/U17: default 18", () => {
    it("18 on field → even 6-6-6", () => {
      expect(zoneCapsFor(18, "zones3")).toEqual({
        back: 6, hback: 0, mid: 6, hfwd: 0, fwd: 6,
      });
    });
    it("17 on field → blank in FWD (6-6-5)", () => {
      expect(zoneCapsFor(17, "zones3")).toEqual({
        back: 6, hback: 0, mid: 6, hfwd: 0, fwd: 5,
      });
    });
    it("16 on field → blank in BACK + FWD (6-5-5)", () => {
      expect(zoneCapsFor(16, "zones3")).toEqual({
        back: 5, hback: 0, mid: 6, hfwd: 0, fwd: 5,
      });
    });
    it("12 on field → even 4-4-4 (well below default)", () => {
      expect(zoneCapsFor(12, "zones3")).toEqual({
        back: 4, hback: 0, mid: 4, hfwd: 0, fwd: 4,
      });
    });
  });

  // Cross-cutting: every AGE_GROUPS entry's defaultOnFieldSize
  // must produce a cap distribution that exactly sums to the
  // default. Catches a future age group that's mis-configured.
  it("default on-field-size matches the cap distribution sum for every age group", () => {
    for (const ag of Object.values(AGE_GROUPS)) {
      const caps = zoneCapsFor(ag.defaultOnFieldSize, ag.positionModel as PositionModel);
      const sum = caps.back + caps.hback + caps.mid + caps.hfwd + caps.fwd;
      expect(`${ag.id}:${sum}`).toBe(`${ag.id}:${ag.defaultOnFieldSize}`);
    }
  });

  // Bounds check: every min and max on-field-size in the age
  // group config must produce a non-negative cap distribution
  // that sums to the requested size (within the 18-player hard
  // max, which clamps anything higher).
  it("min/max on-field-size always sums correctly", () => {
    for (const ag of Object.values(AGE_GROUPS)) {
      const model = ag.positionModel as PositionModel;
      for (const size of [ag.minOnFieldSize, ag.maxOnFieldSize]) {
        const caps = zoneCapsFor(size, model);
        const sum = caps.back + caps.hback + caps.mid + caps.hfwd + caps.fwd;
        const clamped = Math.min(18, size);
        expect(`${ag.id}@${size}:${sum}`).toBe(`${ag.id}@${size}:${clamped}`);
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────
// SECTION 2: AFL deriveEffectiveZoneCaps — Q-break preservation
// ──────────────────────────────────────────────────────────────

describe("AFL deriveEffectiveZoneCaps — Q-break shape preservation", () => {
  const FALLBACK_11 = zoneCapsFor(11, "zones3"); // {mid:4, back:4, fwd:3}

  it("returns fallback when previousLineup is null (Q1 init)", () => {
    expect(
      deriveEffectiveZoneCaps(null, 11, "zones3", FALLBACK_11),
    ).toEqual(FALLBACK_11);
  });

  it("preserves coach's manual blank-in-BACK choice (Steve's match-day fix)", () => {
    // Coach manually moved Forward → Backs blank in Q1.
    // Lineup ended with back=3, mid=4, fwd=4 (blank in BACK).
    // Q2's caps must inherit THAT shape, not the default.
    const previous = lineupWithCounts({ back: 3, mid: 4, fwd: 4 });
    const caps = deriveEffectiveZoneCaps(previous, 11, "zones3", FALLBACK_11);
    expect(caps).toEqual({ back: 3, hback: 0, mid: 4, hfwd: 0, fwd: 4 });
  });

  it("preserves coach's manual blank-in-MID choice (unusual but valid)", () => {
    const previous = lineupWithCounts({ back: 4, mid: 3, fwd: 4 });
    const caps = deriveEffectiveZoneCaps(previous, 11, "zones3", FALLBACK_11);
    expect(caps).toEqual({ back: 4, hback: 0, mid: 3, hfwd: 0, fwd: 4 });
  });

  it("falls back when previous-quarter sum doesn't match new on-field size", () => {
    // Late arrival: previous had 11 on, now 12. Previous shape
    // doesn't sum to 12, so use fresh `zoneCapsFor(12)` instead.
    const previous = lineupWithCounts({ back: 4, mid: 4, fwd: 3 });
    const fallback12 = zoneCapsFor(12, "zones3");
    const caps = deriveEffectiveZoneCaps(previous, 12, "zones3", fallback12);
    expect(caps).toEqual(fallback12);
  });

  it("preserves shape across all U10 short-squad sizes (11, 10, 9)", () => {
    // The most common short-squad scenario: U10 coach with squad
    // of 11, 10, or 9 players. Each size has its own valid
    // distribution and the coach's manual choice must persist.
    const cases: Array<{
      size: number;
      shape: { back: number; mid: number; fwd: number };
    }> = [
      { size: 11, shape: { back: 3, mid: 4, fwd: 4 } },
      { size: 10, shape: { back: 4, mid: 3, fwd: 3 } },
      { size: 9, shape: { back: 2, mid: 3, fwd: 4 } },
    ];
    for (const { size, shape } of cases) {
      const previous = lineupWithCounts(shape);
      const fallback = zoneCapsFor(size, "zones3");
      const caps = deriveEffectiveZoneCaps(previous, size, "zones3", fallback);
      expect(`${size}:${JSON.stringify({
        back: caps.back, mid: caps.mid, fwd: caps.fwd,
      })}`).toBe(`${size}:${JSON.stringify(shape)}`);
    }
  });

  it("preserves shape across U13+ short-squad sizes (14, 13, 12)", () => {
    const cases: Array<{
      size: number;
      shape: { back: number; mid: number; fwd: number };
    }> = [
      { size: 14, shape: { back: 4, mid: 5, fwd: 5 } },
      { size: 13, shape: { back: 4, mid: 4, fwd: 5 } },
      { size: 12, shape: { back: 4, mid: 4, fwd: 4 } },
    ];
    for (const { size, shape } of cases) {
      const previous = lineupWithCounts(shape);
      const fallback = zoneCapsFor(size, "zones3");
      const caps = deriveEffectiveZoneCaps(previous, size, "zones3", fallback);
      expect(`${size}:${JSON.stringify({
        back: caps.back, mid: caps.mid, fwd: caps.fwd,
      })}`).toBe(`${size}:${JSON.stringify(shape)}`);
    }
  });

  it("preserves shape across U16/U17 short-squad sizes (17, 16, 15, 14)", () => {
    const cases: Array<{
      size: number;
      shape: { back: number; mid: number; fwd: number };
    }> = [
      { size: 17, shape: { back: 5, mid: 6, fwd: 6 } },
      { size: 16, shape: { back: 5, mid: 6, fwd: 5 } },
      { size: 15, shape: { back: 5, mid: 5, fwd: 5 } },
      { size: 14, shape: { back: 4, mid: 5, fwd: 5 } },
    ];
    for (const { size, shape } of cases) {
      const previous = lineupWithCounts(shape);
      const fallback = zoneCapsFor(size, "zones3");
      const caps = deriveEffectiveZoneCaps(previous, size, "zones3", fallback);
      expect(`${size}:${JSON.stringify({
        back: caps.back, mid: caps.mid, fwd: caps.fwd,
      })}`).toBe(`${size}:${JSON.stringify(shape)}`);
    }
  });
});

// ──────────────────────────────────────────────────────────────
// SECTION 2b: effectiveDisplayZoneCaps — live-field slot count
// Steve 2026-07-07: a short squad shouldn't render phantom empty
// slots for kids who aren't there, but a coach who reduced on-field
// size (with a full squad on the bench) still should.
// ──────────────────────────────────────────────────────────────

describe("effectiveDisplayZoneCaps — short squad vs reduced size (U10, default 12)", () => {
  it("collapses to the coach's shape when fewer players are available than the default", () => {
    // 10 kids, running 3/4/3, nobody on the bench → show 3/4/3, no phantom.
    const lineup = lineupWithCounts({ back: 3, mid: 4, fwd: 3 });
    const caps = effectiveDisplayZoneCaps(lineup, 10, 12, "zones3");
    expect({ back: caps.back, mid: caps.mid, fwd: caps.fwd }).toEqual({
      back: 3,
      mid: 4,
      fwd: 3,
    });
  });

  it("keeps the default slot count when the squad is big enough (reduced-size affordance)", () => {
    // Coach reduced on-field to 10 but has 14 available (4 on the bench):
    // still show the default 12 slots so the 2 trimmed positions render
    // as empty placeholders.
    const lineup = lineupWithCounts({ back: 3, mid: 4, fwd: 3 });
    const caps = effectiveDisplayZoneCaps(lineup, 14, 12, "zones3");
    expect(Object.values(caps).reduce((a, b) => a + b, 0)).toBe(12);
  });
});

// ──────────────────────────────────────────────────────────────
// SECTION 3: Netball pickNetballPositionsToFill × age group
// ──────────────────────────────────────────────────────────────

describe("Netball pickNetballPositionsToFill — fill priority across all age groups", () => {
  const setAge = netballSport.ageGroups.find((a) => a.id === "set")!;
  const goAge = netballSport.ageGroups.find((a) => a.id === "go")!;
  const u11Age = netballSport.ageGroups.find((a) => a.id === "11u")!;
  const u12Age = netballSport.ageGroups.find((a) => a.id === "12u")!;
  const u13Age = netballSport.ageGroups.find((a) => a.id === "13u")!;
  const openAge = netballSport.ageGroups.find((a) => a.id === "open")!;

  describe("Set (5-position): drop priority C → GA → GD → GS → GK", () => {
    it("5 on court → all five positions filled", () => {
      expect(pickNetballPositionsToFill(setAge, 5)).toEqual([
        "gs", "ga", "c", "gd", "gk",
      ]);
    });
    it("4 on court → blank C (drop priority hits centre first)", () => {
      expect(pickNetballPositionsToFill(setAge, 4)).toEqual([
        "gs", "ga", "gd", "gk",
      ]);
    });
    it("clamps to min (4) when caller passes 3", () => {
      expect(pickNetballPositionsToFill(setAge, 3)).toEqual([
        "gs", "ga", "gd", "gk",
      ]);
    });
  });

  // Go / 11u / 12u / 13u / Open all share the 7-position config
  // (gs, ga, wa, c, wd, gd, gk) with identical drop priority
  // (WD → WA → C). The describes are explicit per age group so a
  // failure points at the right one if a future age tweak drifts.
  for (const [label, ag] of [
    ["Go", goAge],
    ["11u", u11Age],
    ["12u", u12Age],
    ["13u", u13Age],
    ["Open", openAge],
  ] as const) {
    describe(`${label} (7-position): drop priority WD → WA → C`, () => {
      it("7 on court → all seven filled", () => {
        expect(pickNetballPositionsToFill(ag, 7)).toEqual([
          "gs", "ga", "wa", "c", "wd", "gd", "gk",
        ]);
      });
      it("6 on court → blank WD", () => {
        expect(pickNetballPositionsToFill(ag, 6)).toEqual([
          "gs", "ga", "wa", "c", "gd", "gk",
        ]);
      });
      it("5 on court → blanks WD + WA", () => {
        expect(pickNetballPositionsToFill(ag, 5)).toEqual([
          "gs", "ga", "c", "gd", "gk",
        ]);
      });
      it("clamps to min (5) when caller passes 3", () => {
        expect(pickNetballPositionsToFill(ag, 3)).toEqual([
          "gs", "ga", "c", "gd", "gk",
        ]);
      });
      it("clamps to max (7) when caller passes 9", () => {
        expect(pickNetballPositionsToFill(ag, 9)).toEqual([
          "gs", "ga", "wa", "c", "wd", "gd", "gk",
        ]);
      });
    });
  }

  describe("alreadyFilled preservation — coach's manual blank persists into next Q", () => {
    it("Open: previous Q left WA blank instead of WD → next Q keeps WA blank", () => {
      const alreadyFilled = new Set(["gs", "ga", "c", "wd", "gd", "gk"]);
      expect(pickNetballPositionsToFill(openAge, 6, alreadyFilled)).toEqual([
        "gs", "ga", "c", "wd", "gd", "gk",
      ]);
    });

    it("Open: previous Q left C blank → next Q keeps C blank", () => {
      const alreadyFilled = new Set(["gs", "ga", "wa", "wd", "gd", "gk"]);
      expect(pickNetballPositionsToFill(openAge, 6, alreadyFilled)).toEqual([
        "gs", "ga", "wa", "wd", "gd", "gk",
      ]);
    });

    it("Set: previous Q left GA blank → next Q keeps GA blank", () => {
      const alreadyFilled = new Set(["gs", "c", "gd", "gk"]);
      expect(pickNetballPositionsToFill(setAge, 4, alreadyFilled)).toEqual([
        "gs", "c", "gd", "gk",
      ]);
    });

    it("size shrinks between quarters → falls back to default fill priority", () => {
      // Coach had 7 on in Q1, lost a player at half. alreadyFilled
      // has 7 entries but target is 6. Fall back to default
      // priority (drop WD), not "keep these 6 from the 7".
      const alreadyFilled = new Set([
        "gs", "ga", "wa", "c", "wd", "gd", "gk",
      ]);
      expect(pickNetballPositionsToFill(openAge, 6, alreadyFilled)).toEqual([
        "gs", "ga", "wa", "c", "gd", "gk",
      ]);
    });

    it("size grows between quarters → falls back so new position fills via priority", () => {
      // Coach had 5 on in Q1, late arrival at half-time bumps to
      // 6. alreadyFilled has 5 entries but target is 6. The 6th
      // position comes from the default fill priority (WD).
      const alreadyFilled = new Set(["gs", "ga", "c", "gd", "gk"]);
      expect(pickNetballPositionsToFill(openAge, 6, alreadyFilled)).toEqual([
        "gs", "ga", "wa", "c", "gd", "gk",
      ]);
    });
  });
});
