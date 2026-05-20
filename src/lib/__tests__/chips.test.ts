// Regression coverage for chip-mode normalisation.
//
// History (Steve 2026-05-20): a previous inline normaliser in
// settings/actions.ts collapsed every input to "split"|"group",
// silently dropping forward/centre/back picks on the way to the
// DB. End-to-end the bug looked like "zone-preference chips
// don't influence the suggester" — the settings UI happily
// rendered the picks, the column CHECK accepted any value, and
// the fairness algorithm honoured zone modes. Save was the
// single missing link.
//
// These tests pin the canonical normaliser in @/lib/chips so a
// future inline rewrite can't reintroduce the silent-drop bug
// without going red.

import { describe, expect, it } from "vitest";
import { normalizeChipMode, CHIP_MODES } from "@/lib/chips";

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

  it("falls back to 'split' for unrecognised strings", () => {
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
