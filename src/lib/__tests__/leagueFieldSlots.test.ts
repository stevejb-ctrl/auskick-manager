// ─── Field slot counts per age group ─────────────────────────
// Pins the LeagueField formation resolver so a future change can't
// silently regress to "always render 11 slots" (which is what
// happened pre-2026-05-19: U6 rendered 6 players + 5 EMPTY tiles).
//
// Per Junior Laws §3 — on-field sizes by age:
//   U6 / U7  →  6  (no vests)
//   U8       →  8  (FR only)
//   U9       →  8  (FR + DH)
//   U10 / U11 → 11 (FR + DH)
//   U12      → 13  (FR + DH)
//
// Each formation must have:
//   * EXACTLY onFieldSize slots — no surplus, no shortfall.
//   * FR slot iff vestRequirements.fr === true.
//   * DH slot iff vestRequirements.dh === true.
//   * Exactly one fullback slot when there's any back pool.

import { describe, expect, it } from "vitest";
import {
  getFieldSlots,
  pickBestForSlot,
  slotMismatchScore,
} from "@/lib/sports/rugby_league/fieldFormation";

interface AgeCase {
  age: string;
  onFieldSize: number;
  vestRequirements: { fr: boolean; dh: boolean };
}

const AGE_CASES: AgeCase[] = [
  { age: "U6", onFieldSize: 6, vestRequirements: { fr: false, dh: false } },
  { age: "U7", onFieldSize: 6, vestRequirements: { fr: false, dh: false } },
  { age: "U8", onFieldSize: 8, vestRequirements: { fr: true, dh: false } },
  { age: "U9", onFieldSize: 8, vestRequirements: { fr: true, dh: true } },
  { age: "U10", onFieldSize: 11, vestRequirements: { fr: true, dh: true } },
  { age: "U11", onFieldSize: 11, vestRequirements: { fr: true, dh: true } },
  { age: "U12", onFieldSize: 13, vestRequirements: { fr: true, dh: true } },
];

describe("getFieldSlots — per-age-group formations", () => {
  for (const c of AGE_CASES) {
    describe(`${c.age} (${c.onFieldSize} on field)`, () => {
      const slots = getFieldSlots(c.onFieldSize, c.vestRequirements);

      it("returns exactly onFieldSize slots", () => {
        expect(slots).toHaveLength(c.onFieldSize);
      });

      it("includes an FR slot iff vestRequirements.fr is true", () => {
        const hasFr = slots.some((s) => s.role === "fr");
        expect(hasFr).toBe(c.vestRequirements.fr);
      });

      it("includes a DH slot iff vestRequirements.dh is true", () => {
        const hasDh = slots.some((s) => s.role === "dh");
        expect(hasDh).toBe(c.vestRequirements.dh);
      });

      it("includes exactly one fullback slot", () => {
        const fullbacks = slots.filter((s) => s.role === "fullback");
        expect(fullbacks).toHaveLength(1);
      });

      it("every slot has a unique id", () => {
        const ids = slots.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it("every coordinate is within the pitch (0–100 percent)", () => {
        for (const s of slots) {
          expect(s.x).toBeGreaterThanOrEqual(0);
          expect(s.x).toBeLessThanOrEqual(100);
          expect(s.y).toBeGreaterThanOrEqual(0);
          expect(s.y).toBeLessThanOrEqual(100);
        }
      });
    });
  }

  it("falls back to the 11-player layout for unknown sizes", () => {
    // Defensive — if a future age group lands with size 9 / 10 / 12,
    // we don't crash. The 11-player formation is the canonical RL
    // shape so it's the safest default until a real layout is added.
    const slots = getFieldSlots(10, { fr: true, dh: true });
    expect(slots).toHaveLength(11);
  });

  it("defaults to no-vests shape when vestRequirements omitted", () => {
    const slots = getFieldSlots(6);
    expect(slots).toHaveLength(6);
    expect(slots.some((s) => s.role === "fr")).toBe(false);
    expect(slots.some((s) => s.role === "dh")).toBe(false);
  });
});

// ─── Chip-aware overflow placement (Steve 2026-05-23) ────────
// Pins the regression that put B-chipped ("Back") players into
// forward slots when FR + DH were drawn from the forwards bucket,
// leaving empty forward slots that overflow used to fill in
// declaration order — picking the first back even when an
// unchipped back was sitting next to them in the pool.

describe("slotMismatchScore", () => {
  it("scores unchipped (null/undefined) as a perfect fit for either zone", () => {
    expect(slotMismatchScore(null, "forward")).toBe(0);
    expect(slotMismatchScore(null, "back")).toBe(0);
    expect(slotMismatchScore(undefined, "forward")).toBe(0);
    expect(slotMismatchScore(undefined, "back")).toBe(0);
  });

  it("scores A-chip (forward) as 0 for a forward slot, 1 for a back slot", () => {
    expect(slotMismatchScore("a", "forward")).toBe(0);
    expect(slotMismatchScore("a", "back")).toBe(1);
  });

  it("scores B-chip (back) as 0 for a back slot, 1 for a forward slot", () => {
    expect(slotMismatchScore("b", "back")).toBe(0);
    expect(slotMismatchScore("b", "forward")).toBe(1);
  });

  it("scores unrecognised chip values as mismatches", () => {
    // Defensive — chip 'c' is dead for RL but exists in the DB
    // column. We treat it as a mismatch for both zones rather
    // than silently routing it.
    expect(slotMismatchScore("c", "forward")).toBe(1);
    expect(slotMismatchScore("c", "back")).toBe(1);
  });
});

describe("pickBestForSlot", () => {
  it("returns null on an empty pool", () => {
    expect(pickBestForSlot([], "forward")).toBeNull();
  });

  it("prefers an unchipped player over a B-chip for a forward slot", () => {
    // The U10 scenario Steve hit: forwards bucket dried up
    // (FR+DH both drawn from forwards), leaving 2 empty fwd
    // slots. The back-bucket overflow has a mix of B-chipped
    // and unchipped — picker MUST take unchipped first.
    const pool = [
      { id: "max", chip: "b" },
      { id: "mia", chip: null },
      { id: "william", chip: "b" },
      { id: "isla", chip: null },
    ];
    const picked1 = pickBestForSlot(pool, "forward");
    expect(picked1?.id).toBe("mia");
    expect(pool).toHaveLength(3);
    const picked2 = pickBestForSlot(pool, "forward");
    expect(picked2?.id).toBe("isla");
    expect(pool).toHaveLength(2);
    // Remaining pool is all B-chips — must mismatch.
    const picked3 = pickBestForSlot(pool, "forward");
    expect(picked3?.chip).toBe("b");
  });

  it("prefers an unchipped player over an A-chip for a back slot", () => {
    // Symmetric scenario: backs bucket dried up, forwards spill
    // over. Unchipped go first; A-chips are last resort.
    const pool = [
      { id: "amelia", chip: "a" },
      { id: "oliver", chip: null },
      { id: "jack", chip: "a" },
    ];
    const picked = pickBestForSlot(pool, "back");
    expect(picked?.id).toBe("oliver");
    expect(pool).toHaveLength(2);
    // Remaining are both A-chip — declaration order kept.
    const next = pickBestForSlot(pool, "back");
    expect(next?.chip).toBe("a");
  });

  it("picks correct-zone chip when both right and wrong chips share the pool", () => {
    // Defensive — if the cross-zone pool happens to contain a
    // right-zone chip (shouldn't normally happen but possible if
    // upstream routing changes), prefer it over a wrong-zone chip.
    const pool = [
      { id: "wrong", chip: "b" },
      { id: "right", chip: "a" },
    ];
    expect(pickBestForSlot(pool, "forward")?.id).toBe("right");
  });

  it("preserves order among equally-fit candidates (stable pick)", () => {
    // All unchipped — first one in the array wins. Important for
    // determinism so a layout doesn't shuffle across renders.
    const pool = [
      { id: "first", chip: null },
      { id: "second", chip: null },
      { id: "third", chip: null },
    ];
    expect(pickBestForSlot(pool, "forward")?.id).toBe("first");
    expect(pickBestForSlot(pool, "forward")?.id).toBe("second");
    expect(pickBestForSlot(pool, "forward")?.id).toBe("third");
  });
});
