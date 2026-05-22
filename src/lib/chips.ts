// Cohort chip metadata — keys, default colors, and Tailwind class
// shortcuts for the dot/pill rendering. Coach-facing labels live on
// the team row (chip_a_label etc) and are passed in by callers.

export const CHIP_KEYS = ["a", "b", "c"] as const;
export type ChipKey = (typeof CHIP_KEYS)[number];

/**
 * Per-chip behaviour. Five modes:
 *
 *   - "split"   — spread chip-mates across zones (default).
 *                 Useful for "mix older with younger".
 *   - "group"   — funnel chip-mates into the same zone where
 *                 possible. Pairs of teammates who stick together.
 *   - "forward" — prefer chip-mates in forward zones. Soft-strong
 *                 bonus; fairness can still override.
 *   - "centre"  — prefer chip-mates in midfield / centre (AFL only;
 *                 RL has no centre, but the type stays open so the
 *                 enum is shared across sports).
 *   - "back"    — prefer chip-mates in defensive zones.
 *
 * Steve 2026-05-20: introduced the zone modes for the F/B chip-
 * letter overlay on RL tiles (rugby league has Forwards + Backs,
 * no Centre). AFL's F/C/B overlay lands when main is merged —
 * the enum shape matches main on purpose so the merge is clean.
 */
export type ChipMode = "split" | "group" | "forward" | "centre" | "back";
export const CHIP_MODES: ChipMode[] = [
  "split",
  "group",
  "forward",
  "centre",
  "back",
];

export const CHIP_ZONE_MODES = ["forward", "centre", "back"] as const;
export type ChipZoneMode = (typeof CHIP_ZONE_MODES)[number];

/**
 * Type guard — narrows a ChipMode to one of the three zone-
 * preference modes. Used by tile / picker components to decide
 * whether to render the F / C / B letter inside the chip dot.
 */
export function isChipZoneMode(
  mode: ChipMode | undefined,
): mode is ChipZoneMode {
  return mode === "forward" || mode === "centre" || mode === "back";
}

/**
 * Canonical normaliser for chip mode strings on the way INTO the
 * database. Any value not in the ChipMode union falls back to
 * "split" so a stale client posting an unknown value can't
 * corrupt the column. Every write path that persists a chip
 * mode MUST funnel through this.
 */
const VALID_CHIP_MODES: ReadonlySet<ChipMode> = new Set(CHIP_MODES);
export function normalizeChipMode(v: string | null | undefined): ChipMode {
  if (typeof v !== "string") return "split";
  return VALID_CHIP_MODES.has(v as ChipMode) ? (v as ChipMode) : "split";
}

export interface ChipPalette {
  /** Filled dot for the chip swatch / inline rendering. */
  dot: string;
  /** Selected-state pill border (used by ChipPicker). */
  selectedBorder: string;
  /** Selected-state pill background. */
  selectedBg: string;
  /** Selected-state pill text. */
  selectedText: string;
}

export const CHIP_COLORS: Record<ChipKey, ChipPalette> = {
  a: {
    dot: "bg-brand-500",
    selectedBorder: "border-brand-500",
    selectedBg: "bg-brand-50",
    selectedText: "text-brand-800",
  },
  b: {
    dot: "bg-warn",
    selectedBorder: "border-warn/60",
    selectedBg: "bg-warn-soft",
    selectedText: "text-warn",
  },
  c: {
    dot: "bg-zone-c",
    selectedBorder: "border-zone-c/60",
    selectedBg: "bg-zone-c/10",
    selectedText: "text-zone-c",
  },
};

// ─── Zone palette ────────────────────────────────────────────
// Maps a zone mode to the same colour triad the field tiles use
// (orange forwards, fuchsia centre, blue backs) so the chip dot
// reads as the zone the player will be biased to. Falls back to
// the A/B/C brand palette for cluster modes (split / group) and
// for chips with no explicit mode.

const ZONE_PALETTE: Record<ChipZoneMode, ChipPalette> = {
  forward: {
    dot: "bg-zone-f",
    selectedBorder: "border-zone-f/60",
    selectedBg: "bg-zone-f/10",
    selectedText: "text-zone-f",
  },
  centre: {
    dot: "bg-zone-c",
    selectedBorder: "border-zone-c/60",
    selectedBg: "bg-zone-c/10",
    selectedText: "text-zone-c",
  },
  back: {
    dot: "bg-zone-b",
    selectedBorder: "border-zone-b/60",
    selectedBg: "bg-zone-b/10",
    selectedText: "text-zone-b",
  },
};

/**
 * Resolve a palette for a chip-key + mode combo. Zone modes get
 * the zone palette (so a forward-preference chip shows orange);
 * everything else falls back to the per-key brand palette.
 *
 * Optional `mode` so legacy callers that don't know team settings
 * still render the brand-palette dot — same look as before the
 * zone modes shipped.
 */
export function chipPalette(
  chipKey: ChipKey,
  mode?: ChipMode,
): ChipPalette {
  if (mode && isChipZoneMode(mode)) return ZONE_PALETTE[mode];
  return CHIP_COLORS[chipKey];
}
