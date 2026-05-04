// Cohort chip metadata — keys, default colors, and Tailwind class
// shortcuts for the dot/pill rendering. Coach-facing labels live on
// the team row (chip_a_label etc) and are passed in by callers.

export const CHIP_KEYS = ["a", "b", "c"] as const;
export type ChipKey = (typeof CHIP_KEYS)[number];

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
