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
  POSITION_LINKED_PRESET,
  RUGBY_LEAGUE_POSITION_LINKED_PRESET,
  chipPalette,
  isChipZoneMode,
  isPositionLinkedChipConfig,
  isRugbyLeaguePositionLinkedChipConfig,
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

// ─── Position-linked presets (AFL + RL) ──────────────────────
// Pins the canonical preset shapes + their detectors so first-paint
// mode resolution in CohortChipsSettings doesn't silently drop a
// team's existing config into "Custom" mode after a chip-mode change.

describe("POSITION_LINKED_PRESET (AFL/netball)", () => {
  it("has Forward / Centre / Back labels with matching zone modes", () => {
    expect(POSITION_LINKED_PRESET.labels).toEqual({
      a: "Forward",
      b: "Centre",
      c: "Back",
    });
    expect(POSITION_LINKED_PRESET.modes).toEqual({
      a: "forward",
      b: "centre",
      c: "back",
    });
  });
});

describe("isPositionLinkedChipConfig (AFL/netball)", () => {
  it("returns true when labels + modes exactly match the preset", () => {
    expect(
      isPositionLinkedChipConfig(
        { a: "Forward", b: "Centre", c: "Back" },
        { a: "forward", b: "centre", c: "back" },
      ),
    ).toBe(true);
  });

  it("returns false when any label diverges", () => {
    expect(
      isPositionLinkedChipConfig(
        { a: "Forward", b: "Mid", c: "Back" }, // typo: Mid vs Centre
        { a: "forward", b: "centre", c: "back" },
      ),
    ).toBe(false);
  });

  it("returns false when any mode diverges (e.g. RL B=back)", () => {
    expect(
      isPositionLinkedChipConfig(
        { a: "Forward", b: "Centre", c: "Back" },
        { a: "forward", b: "back", c: "back" }, // wrong: should be "centre"
      ),
    ).toBe(false);
  });
});

describe("RUGBY_LEAGUE_POSITION_LINKED_PRESET", () => {
  it("has Forward / Back labels (no Centre) with chip C cleared", () => {
    expect(RUGBY_LEAGUE_POSITION_LINKED_PRESET.labels).toEqual({
      a: "Forward",
      b: "Back",
      c: null,
    });
    expect(RUGBY_LEAGUE_POSITION_LINKED_PRESET.modes).toEqual({
      a: "forward",
      b: "back",
      c: "split",
    });
  });
});

describe("isRugbyLeaguePositionLinkedChipConfig", () => {
  it("returns true for the canonical RL preset", () => {
    expect(
      isRugbyLeaguePositionLinkedChipConfig(
        { a: "Forward", b: "Back", c: null },
        { a: "forward", b: "back", c: "split" },
      ),
    ).toBe(true);
  });

  it("accepts an empty-string chip-C label (legacy clear)", () => {
    // The DB CHECK column stores null when cleared via the UI;
    // older rows might carry "" from a pre-rework save. Treat
    // both as cleared so the linked-to-positions branch still
    // wins for those teams.
    expect(
      isRugbyLeaguePositionLinkedChipConfig(
        { a: "Forward", b: "Back", c: "" },
        { a: "forward", b: "back", c: "split" },
      ),
    ).toBe(true);
  });

  it("returns false when chip C has a non-empty label", () => {
    // RL hides chip C from the UI; if the team is on this
    // preset, chip-C must be cleared. Anything else means the
    // team is on Custom (or transitioning).
    expect(
      isRugbyLeaguePositionLinkedChipConfig(
        { a: "Forward", b: "Back", c: "Centre" },
        { a: "forward", b: "back", c: "split" },
      ),
    ).toBe(false);
  });

  it("returns false when chip-C mode isn't split", () => {
    expect(
      isRugbyLeaguePositionLinkedChipConfig(
        { a: "Forward", b: "Back", c: null },
        { a: "forward", b: "back", c: "back" },
      ),
    ).toBe(false);
  });

  it("returns false for the AFL/netball 3-zone preset", () => {
    expect(
      isRugbyLeaguePositionLinkedChipConfig(
        { a: "Forward", b: "Centre", c: "Back" },
        { a: "forward", b: "centre", c: "back" },
      ),
    ).toBe(false);
  });
});
