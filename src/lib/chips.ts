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
 *                 bonus; fairness can still override. Steve
 *                 2026-05-20: once mandatory rotations age out
 *                 (AFL U11+) some kids settle naturally into a
 *                 position; this encodes that without needing
 *                 per-quarter Lock-to-zone taps.
 *   - "centre"  — prefer chip-mates in midfield / centre.
 *   - "back"    — prefer chip-mates in defensive zones.
 *
 * The three zone modes rotate WITHIN the family — a forward-
 * chipped AFL U13 may play fwd one quarter and hfwd the next; a
 * forward-chipped netball player rotates GS/GA/WA across quarters
 * via the existing same-position penalty.
 */
export type ChipMode = "split" | "group" | "forward" | "centre" | "back";
export const CHIP_MODES: ChipMode[] = ["split", "group", "forward", "centre", "back"];

export const CHIP_ZONE_MODES = ["forward", "centre", "back"] as const;
export type ChipZoneMode = (typeof CHIP_ZONE_MODES)[number];

/**
 * Type guard — narrows a ChipMode to one of the three zone-
 * preference modes. Used by the AFL + netball suggesters to
 * decide whether the chip carries a zone preference vs the
 * existing cluster modes.
 */
export function isChipZoneMode(mode: ChipMode | undefined): mode is ChipZoneMode {
  return mode === "forward" || mode === "centre" || mode === "back";
}

/**
 * Human-readable label for each chip mode — used in settings
 * tooltips and any future surface that surfaces the active mode
 * in conversational copy.
 */
export const CHIP_MODE_LABEL: Record<ChipMode, string> = {
  split: "Split across zones",
  group: "Group together",
  forward: "Prefer forward",
  centre: "Prefer centre",
  back: "Prefer back",
};

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
