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
 *                 bonus; fairness can still override. Once
 *                 mandatory rotations age out (AFL U11+) some
 *                 kids settle naturally into a position; this
 *                 encodes that without per-quarter Lock-to-zone.
 *   - "centre"  — prefer chip-mates in midfield / centre (AFL).
 *   - "back"    — prefer chip-mates in defensive zones.
 *
 * The three zone modes rotate WITHIN the family — a forward-
 * chipped AFL U13 may play fwd one quarter and hfwd the next; a
 * forward-chipped netball player rotates GS/GA/WA across quarters
 * via the existing same-position penalty. Rugby league has only
 * forwards + backs, no centre — RL teams just don't use centre.
 */
export type ChipMode = "split" | "group" | "forward" | "centre" | "back";
export const CHIP_MODES: ChipMode[] = [
  "split",
  "group",
  "forward",
  "centre",
  "back",
];

/**
 * Modes the Custom chip configurator surfaces. The three zone
 * modes (forward / centre / back) are intentionally excluded —
 * coaches who want zone preference should use the dedicated
 * "Linked to positions" option in CohortChipsSettings, which
 * applies the canonical Forward/Centre/Back preset in one tap.
 * Keeping zone modes in the Custom dropdown was confusing post-
 * rework: two paths to the same destination. Steve 2026-05-20.
 */
export const CUSTOM_CHIP_MODES: ChipMode[] = ["split", "group"];

export const CHIP_ZONE_MODES = ["forward", "centre", "back"] as const;
export type ChipZoneMode = (typeof CHIP_ZONE_MODES)[number];

/**
 * Type guard — narrows a ChipMode to one of the three zone-
 * preference modes. Used by the suggesters to decide whether the
 * chip carries a zone preference, AND by tile / picker components
 * to decide whether to render the F / C / B letter inside the
 * chip dot.
 */
export function isChipZoneMode(
  mode: ChipMode | undefined,
): mode is ChipZoneMode {
  return mode === "forward" || mode === "centre" || mode === "back";
}

/**
 * Canonical normaliser for chip mode strings on the way INTO the
 * database. Any value not in the ChipMode union falls back to
 * "split" so a future enum extension at the DB level (or a stale
 * client posting an unknown value) can't corrupt the column.
 * Steve 2026-05-20: extracted from settings/actions.ts after the
 * original inline normaliser silently collapsed every mode to
 * "split"|"group", which silently dropped every zone-preference
 * (forward / centre / back) pick before it reached the DB.
 * Single canonical version now — every write path that persists
 * a chip mode MUST funnel through this.
 */
const VALID_CHIP_MODES: ReadonlySet<ChipMode> = new Set(CHIP_MODES);
export function normalizeChipMode(v: string | null | undefined): ChipMode {
  if (typeof v !== "string") return "split";
  return VALID_CHIP_MODES.has(v as ChipMode) ? (v as ChipMode) : "split";
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

/**
 * Zone-mode palette — used when a chip's mode is `forward` /
 * `centre` / `back`. The dot recolours to match the in-game zone
 * tokens (bg-zone-f / bg-zone-c / bg-zone-b — see tailwind.config)
 * so coaches reading the chip in the squad list or lineup picker
 * see the same orange-vermillion / fuchsia / royal-blue triad the
 * field tiles use. Steve 2026-05-20: the position-linked
 * configuration is now the default coach flow, so the visual
 * connection between chip and zone needs to be immediate.
 */
export const ZONE_CHIP_COLORS: Record<ChipZoneMode, ChipPalette> = {
  forward: {
    dot: "bg-zone-f",
    selectedBorder: "border-zone-f",
    selectedBg: "bg-zone-f/10",
    selectedText: "text-zone-f",
  },
  centre: {
    dot: "bg-zone-c",
    selectedBorder: "border-zone-c",
    selectedBg: "bg-zone-c/10",
    selectedText: "text-zone-c",
  },
  back: {
    dot: "bg-zone-b",
    selectedBorder: "border-zone-b",
    selectedBg: "bg-zone-b/10",
    selectedText: "text-zone-b",
  },
};

/**
 * Resolve the right palette for a chip render. When the chip's
 * mode is a zone mode (forward / centre / back) the zone palette
 * wins — visual connection to the in-game zone colours overrides
 * the A/B/C convention. Falls back to CHIP_COLORS[chipKey] for
 * split / group modes (custom cohorts like older/younger or
 * mates-stay-together where no zone is implied).
 */
export function chipPalette(key: ChipKey, mode?: ChipMode): ChipPalette {
  if (isChipZoneMode(mode)) return ZONE_CHIP_COLORS[mode];
  return CHIP_COLORS[key];
}

/**
 * Canonical "linked to positions" preset — chip A→Forward,
 * chip B→Centre, chip C→Back. When the team's chip settings
 * match this preset exactly, the settings UI surfaces a
 * simplified position-linked summary instead of the 3-card
 * custom configurator. The Forward-Centre-Back ordering is
 * fixed (matches the field render: top of screen → bottom).
 *
 * Rugby League uses its OWN preset (Forward / Back, chip-C unused)
 * — see CohortChipsSettings for the RL-specific render path.
 */
export const POSITION_LINKED_PRESET: {
  labels: Record<ChipKey, string>;
  modes: Record<ChipKey, ChipMode>;
} = {
  labels: { a: "Forward", b: "Centre", c: "Back" },
  modes: { a: "forward", b: "centre", c: "back" },
};

/**
 * True iff the team's chip configuration matches the
 * position-linked preset (Forward / Centre / Back labels +
 * forward / centre / back modes). Used by CohortChipsSettings
 * to decide which UI branch to render on first paint.
 */
export function isPositionLinkedChipConfig(
  labels: { a: string | null; b: string | null; c: string | null },
  modes: { a: ChipMode; b: ChipMode; c: ChipMode },
): boolean {
  return (
    labels.a === POSITION_LINKED_PRESET.labels.a &&
    labels.b === POSITION_LINKED_PRESET.labels.b &&
    labels.c === POSITION_LINKED_PRESET.labels.c &&
    modes.a === POSITION_LINKED_PRESET.modes.a &&
    modes.b === POSITION_LINKED_PRESET.modes.b &&
    modes.c === POSITION_LINKED_PRESET.modes.c
  );
}
