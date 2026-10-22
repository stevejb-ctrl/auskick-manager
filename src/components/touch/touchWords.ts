// ─── Touch family's words ────────────────────────────────────
// Lines of copy and lane styles the touch and Oztag screens share,
// from the family's own rules. The lanes take AFL's zone palette
// (middles its centre, links its back, wings its forward), so a coach
// who runs both sports reads the colours the same way.

import type { TileLineStyle } from "@/components/live/LinePlayerTile";
import type { TouchLine, TouchStrategy } from "@/lib/sports/touch/types";

/** Each lane's short label, as the tile and the swap strip print it. */
export const TOUCH_LINE_SHORT: Record<TouchLine, string> = { middle: "M", link: "L", wing: "W", field: "" };

/** Each lane's name, for screen readers and sheets. */
export const TOUCH_LINE_LABEL: Record<TouchLine, string> = {
  middle: "Middles",
  link: "Links",
  wing: "Wings",
  field: "Field",
};

/** One lane's name in the singular ("middle spot"). */
export const TOUCH_LINE_ONE: Record<TouchLine, string> = { middle: "middle", link: "link", wing: "wing", field: "field" };

/** The lane styles a LinePlayerTile draws. */
export const TOUCH_TILE_STYLES: Record<TouchLine, TileLineStyle> = {
  middle: {
    short: "M",
    label: "Middles",
    textClass: "text-zone-c",
    fillClass: "bg-zone-c-fill",
    stripClass: "border-zone-c/40 bg-zone-c/15 text-zone-c",
  },
  link: {
    short: "L",
    label: "Links",
    textClass: "text-zone-b",
    fillClass: "bg-zone-b-fill",
    stripClass: "border-zone-b/40 bg-zone-b/15 text-zone-b",
  },
  wing: {
    short: "W",
    label: "Wings",
    textClass: "text-zone-f",
    fillClass: "bg-zone-f-fill",
    stripClass: "border-zone-f/40 bg-zone-f/15 text-zone-f",
  },
  field: {
    short: "",
    label: "Field",
    textClass: "text-ink-dim",
    fillClass: "bg-zone-c-fill",
    stripClass: "border-brand-700 bg-brand-600 text-white",
  },
};

/** The time bar's order: centre out. */
export const TOUCH_BAR_ORDER: readonly TouchLine[] = ["middle", "link", "wing", "field"];

/** Lane colours on the dark next-sub card, as the tiles colour them. */
export const TOUCH_CARD_LABEL_CLASS: Record<TouchLine, string> = {
  middle: "text-zone-c-dark",
  link: "text-zone-b-dark",
  wing: "text-zone-f-dark",
  field: "text-brand-200",
};

const STRATEGY_LABEL: Record<TouchStrategy, string> = {
  minutes: "Minutes only",
  "rotate-positions": "Rotate positions",
  "home-position": "Home position",
};

/** How we play's name for a rotation. */
export function touchStrategyLabel(strategy: TouchStrategy): string {
  return STRATEGY_LABEL[strategy];
}

/**
 * The sub-due banner's hint: no interchange after a turnover until the
 * next touch (TFA rule 17.7), and Oztag's junior championships allow
 * changes only in attack, so the change waits for the ball.
 */
export const TOUCH_SUB_DUE_HINT = "make the change next time you have the ball";

/** A tile's try chip ("2T"), or nothing. */
export function touchTryChip(tries: number | undefined): { text: string; label: string } | null {
  if (!tries || tries <= 0) return null;
  return { text: `${tries}T`, label: `${tries} ${tries === 1 ? "try" : "tries"}` };
}
