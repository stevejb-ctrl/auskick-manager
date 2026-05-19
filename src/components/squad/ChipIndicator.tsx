// ─── ChipIndicator ───────────────────────────────────────────
// Small coloured dot representing a player's cohort chip, with
// an optional zone-mode letter overlaid inside the dot when the
// chip is configured to preference a zone (forward / centre /
// back — Steve 2026-05-20).
//
// Modes that don't carry a zone preference (split, group,
// missing) render as a plain dot — same as the pre-chip-zone
// behaviour, so call sites that don't supply `mode` get the
// legacy look unchanged.
//
// Size variants:
//   - md (default): 12px circle, 7px letter. Used in settings,
//     chip picker, lineup-picker player rows, Q-break tile.
//   - lg: 16px circle, 9px letter. Reserved for surfaces that
//     want the indicator to read at glance distance.
//
// Skip the letter at sub-md sizes (e.g. the 6px tile dot in
// PlayerTile) — it just won't be legible. Bumping those callers
// to md is a separate decision because tile space is tight.

import { CHIP_COLORS, isChipZoneMode, type ChipKey, type ChipMode } from "@/lib/chips";

interface ChipIndicatorProps {
  chipKey: ChipKey;
  /**
   * Active chip mode for THIS key. When zone-X, surfaces the
   * F/C/B letter; otherwise the indicator is just a colour
   * dot. Optional so legacy callers (and the squad-row
   * indicator that doesn't know team settings) can render
   * without mode-awareness.
   */
  mode?: ChipMode;
  size?: "md" | "lg";
  className?: string;
  /** Native browser tooltip (used by squad-row hover for chip label). */
  title?: string;
}

const SIZE = {
  md: { circle: "h-3 w-3", letter: "text-[7px]" },
  lg: { circle: "h-4 w-4", letter: "text-[9px]" },
} as const;

export function ChipIndicator({
  chipKey,
  mode,
  size = "md",
  className = "",
  title,
}: ChipIndicatorProps) {
  const isZone = isChipZoneMode(mode);
  // Single-letter mnemonic for the zone modes — first letter of
  // the mode name, uppercase. "forward" → F, "centre" → C,
  // "back" → B. Easy to scan and matches how coaches verbally
  // refer to positions.
  const letter = isZone && mode ? mode[0].toUpperCase() : null;
  const dim = SIZE[size];
  return (
    <span
      aria-hidden
      title={title}
      className={`inline-flex items-center justify-center rounded-full ${dim.circle} ${CHIP_COLORS[chipKey].dot} ${className}`}
    >
      {letter && (
        <span
          className={`font-bold leading-none text-warm ${dim.letter}`}
        >
          {letter}
        </span>
      )}
    </span>
  );
}
