// ─── chips.ts ──────────────────────────────────────────────────
// Pins the chip mode taxonomy + normaliser + palette resolver.
//
// History (Steve 2026-05-20): a previous inline normaliser in
// settings/actions.ts collapsed every input to "split"|"group",
// silently dropping forward/centre/back picks on the way to the
// DB. End-to-end the bug looked like "zone-preference chips
// don't influence the suggester" — the settings UI happily
// rendered the picks, the column CHECK accepted any value, and
// the fairness algorithm honoured zone modes. Save was the
// single missing link. These tests pin the canonical normaliser
// so a future inline rewrite can't reintroduce the silent-drop
// bug without going red.
//
// Three concerns under test:
//   1. ChipMode union includes all five modes (cluster + zone).
//   2. normalizeChipMode collapses unknown / null / undefined to
//      "split" (safe DB write fallback), preserves valid modes
//      verbatim.
//   3. chipPalette returns the zone-colour palette for zone modes
//      and falls back to the per-key brand palette for cluster
//      modes / missing mode.

import { describe, expect, it } from "vitest";
import {
  CHIP_MODES,
  CHIP_ZONE_MODES,
  CHIP_COLORS,
  chipPalette,
  isChipZoneMode,
  normalizeChipMode,
  type ChipMode,
} from "@/lib/chips";

describe("ChipMode taxonomy", () => {
  it("includes all five modes in CHIP_MODES", () => {
    expect(CHIP_MODES).toEqual([
      "split",
      "group",
      "forward",
      "centre",
      "back",
    ]);
  });

  it("CHIP_ZONE_MODES is the zone subset", () => {
    expect([...CHIP_ZONE_MODES]).toEqual(["forward", "centre", "back"]);
  });
});

describe("isChipZoneMode", () => {
  it("returns true for the three zone modes", () => {
    expect(isChipZoneMode("forward")).toBe(true);
    expect(isChipZoneMode("centre")).toBe(true);
    expect(isChipZoneMode("back")).toBe(true);
  });

  it("returns false for cluster modes", () => {
    expect(isChipZoneMode("split")).toBe(false);
    expect(isChipZoneMode("group")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isChipZoneMode(undefined)).toBe(false);
  });
});

describe("normalizeChipMode", () => {
  it("preserves every valid ChipMode unchanged", () => {
    for (const m of CHIP_MODES) {
      expect(normalizeChipMode(m)).toBe(m);
    }
  });

  it("preserves zone modes (the bug we're regression-testing)", () => {
    // Explicit cases so the failure message names the exact
    // mode that broke if this ever regresses.
    expect(normalizeChipMode("forward")).toBe("forward");
    expect(normalizeChipMode("centre")).toBe("centre");
    expect(normalizeChipMode("back")).toBe("back");
  });

  it("collapses unknown strings to 'split' (safe DB write)", () => {
    // Defensive — a stale client posting an old enum value, or a
    // future migration adding a mode the client hasn't shipped yet,
    // must NOT corrupt the column. "split" is the canonical default.
    expect(normalizeChipMode("garbage")).toBe("split");
    expect(normalizeChipMode("forward_legacy")).toBe("split");
  });

  it("falls back to 'split' for case-sensitive / whitespace input", () => {
    expect(normalizeChipMode("")).toBe("split");
    expect(normalizeChipMode("nope")).toBe("split");
    expect(normalizeChipMode("FORWARD")).toBe("split"); // case-sensitive
    expect(normalizeChipMode("Forward ")).toBe("split"); // no trim
  });

  it("falls back to 'split' for non-string inputs", () => {
    expect(normalizeChipMode(null)).toBe("split");
    expect(normalizeChipMode(undefined)).toBe("split");
  });
});

describe("chipPalette", () => {
  it("returns the zone palette for zone modes (forward → zone-f)", () => {
    expect(chipPalette("a", "forward").dot).toBe("bg-zone-f");
    expect(chipPalette("b", "forward").dot).toBe("bg-zone-f");
  });

  it("returns the zone palette for back mode (any chip key → zone-b)", () => {
    expect(chipPalette("a", "back").dot).toBe("bg-zone-b");
    expect(chipPalette("c", "back").dot).toBe("bg-zone-b");
  });

  it("returns the zone palette for centre mode", () => {
    expect(chipPalette("a", "centre").dot).toBe("bg-zone-c");
  });

  it("falls back to the per-key brand palette for cluster modes", () => {
    expect(chipPalette("a", "split")).toEqual(CHIP_COLORS.a);
    expect(chipPalette("b", "group")).toEqual(CHIP_COLORS.b);
  });

  it("falls back to the per-key brand palette when mode is undefined", () => {
    // Legacy callers that don't know team settings still render the
    // brand-palette dot — same look as before zone modes shipped.
    expect(chipPalette("c", undefined)).toEqual(CHIP_COLORS.c);
  });

  it("treats unknown modes as cluster (falls back to brand palette)", () => {
    // Type-cast so the unknown mode reaches the runtime check;
    // mirrors a stale client passing a value the type hasn't caught.
    const palette = chipPalette("a", "garbage" as unknown as ChipMode);
    expect(palette).toEqual(CHIP_COLORS.a);
  });
});
