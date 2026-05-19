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
import { getFieldSlots } from "@/lib/sports/rugby_league/fieldFormation";

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
