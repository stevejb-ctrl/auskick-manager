// ─── The colour pairs the app paints, and the contrast each needs ───
//
// Every foreground / background pairing of palette tokens that the app
// actually puts on screen. The contrast test checks each one in both
// themes and for both brand ladders, so a token change that sinks one
// fails `npm test` rather than shipping.
//
//   - text: words, 4.5:1 (WCAG 1.4.3 AA). Small bold chips count as
//     body text, not large text.
//   - ui: rings, bars, dots and lines a coach reads to work the screen,
//     3:1 (WCAG 1.4.11).
//
// A side is a token role ("text:ink", "fill:surface"), a brand step
// ("text:brand-700"), a fixed colour ("#FFFFFF"), or a token laid at
// some alpha over another ({ over, alpha, under }), the way
// `bg-zone-f/15` paints.

import type { BrandName, Role } from "./palette";

export type Side = `${Role}:${string}` | `#${string}` | { over: Side; alpha: number; under: Side };

export interface Pair {
  fg: Side;
  bg: Side;
  kind: "text" | "ui";
  /** Where it's painted. */
  where: string;
  /**
   * A light-theme shortfall that predates the dark theme and needs a
   * design call, not a token nudge. The test holds light to this floor
   * (so it can't get worse) and still holds dark to the full minimum.
   */
  lightFloor?: { min: number; brand?: BrandName; why: string };
}

const WHITE = "#FFFFFF" as const;

const pages = ["fill:warm", "fill:surface", "fill:surface-alt"] as const;

const textOn = (fg: Side, bgs: readonly Side[], where: string): Pair[] => bgs.map((bg) => ({ fg, bg, kind: "text", where }));
const uiOn = (fg: Side, bgs: readonly Side[], where: string): Pair[] => bgs.map((bg) => ({ fg, bg, kind: "ui", where }));

export const PAIRS: Pair[] = [
  // ── Body text on every surface ────────────────────────────────
  ...textOn("text:ink", [...pages, "fill:well", "fill:brand-50", "fill:brand-100"], "body text, titles"),
  ...textOn("text:ink-dim", [...pages, "fill:well"], "secondary text"),
  ...textOn("text:ink-mute", pages, "hints, nav labels (R6)"),
  ...textOn("text:ink", ["fill:warn-soft", "fill:alarm-soft", "fill:due-tint", "fill:win-soft", "fill:loss-soft", "fill:draw-soft"], "text on a tinted notice or tile"),

  // ── The dark chrome: clock pill, sub card, primary button ─────
  ...textOn("text:warm", ["fill:ink"], "clock pill, sub card, primary button, score chips"),
  ...textOn("fill:zone-f-dark", ["fill:ink"], "FWD label on the sub card"),
  ...textOn("fill:zone-c-dark", ["fill:ink"], "CEN label on the sub card"),
  ...textOn("fill:zone-b-dark", ["fill:ink"], "BACK label on the sub card"),
  ...textOn("fill:due-dark", ["fill:ink"], "amber words on the sub card"),
  ...uiOn("fill:mint", ["fill:ink"], "running-clock dot, countdown ring"),

  // ── White words on strong fills ───────────────────────────────
  ...textOn(WHITE, ["fill:brand-700"], "Confirm buttons"),
  {
    fg: WHITE,
    bg: "fill:brand-600",
    kind: "text",
    where: "Start / Make swap buttons",
    lightFloor: { min: 4.3, brand: "netball", why: "court blue #2E7FB8 carries white at 4.34:1; #2873A8 would pass, but it's the netball brand colour" },
  },
  {
    fg: WHITE,
    bg: "fill:warn",
    kind: "text",
    where: "LENT / sitting-out chips, the warn buttons",
    lightFloor: { min: 3.45, why: "ochre #C8751F carries white at 3.49:1; the chips could move to due (#A8590F, 5.1:1) or a darker warn fill" },
  },
  ...textOn(WHITE, ["fill:due"], "sub-due chip, hooter scorebug"),
  ...textOn(WHITE, ["fill:danger"], "INJ chip, Fix button"),
  ...textOn(WHITE, ["fill:ink-dim"], "Unavailable chip (availability)"),
  ...textOn("text:warm", ["fill:brand-700"], "accent button hover"),
  {
    fg: "text:warm",
    bg: "fill:brand-600",
    kind: "text",
    where: "accent button (SFButton accent)",
    lightFloor: { min: 3.95, brand: "netball", why: "court blue #2E7FB8 under warm words is 3.98:1 (see the white pair)" },
  },

  // ── Brand words ───────────────────────────────────────────────
  ...textOn("text:brand-700", ["fill:warm", "fill:surface", "fill:brand-50"], "links, selected labels"),
  ...textOn("text:brand-800", ["fill:surface", "fill:brand-50", "fill:brand-100"], "selected option text"),

  // ── Signal words ──────────────────────────────────────────────
  ...textOn("text:brand-700", ["fill:brand-100"], "game-manager badge"),
  ...textOn("text:warn", ["fill:warm", "fill:surface", "fill:warn-soft"], "warnings, NEXT, lent, the warn pill"),
  ...textOn("text:ok", [{ over: "fill:ok", alpha: 0.1, under: "fill:surface" }], "active badge (bg-ok/10)"),
  ...textOn("text:zone-c", [{ over: "fill:zone-c", alpha: 0.1, under: "fill:surface" }], "selected zone chip (bg-zone-c/10)"),
  ...textOn("text:danger", ["fill:warm", "fill:surface"], "errors, injured"),
  ...textOn("text:danger", [{ over: "fill:danger", alpha: 0.1, under: "fill:surface" }], "error notice (bg-danger/10)"),
  ...textOn("text:ok", ["fill:warm", "fill:surface"], "saved, break margin (R6)"),
  ...textOn("text:alarm", ["fill:surface", "fill:alarm-soft"], "live / alarm words"),
  ...textOn("text:win", ["fill:surface", "fill:win-soft"], "W chip, winning margin"),
  ...textOn("text:loss", ["fill:surface", "fill:loss-soft"], "L chip"),
  ...textOn("text:draw", ["fill:surface", "fill:draw-soft"], "D chip"),
  ...textOn("text:due", ["fill:surface", "fill:due-tint"], "due words on a tile"),

  // ── Zone words ────────────────────────────────────────────────
  ...textOn("text:zone-f", ["fill:surface"], "a tile's zone label"),
  ...textOn("text:zone-c", ["fill:surface"], "a tile's zone label"),
  ...textOn("text:zone-b", ["fill:surface"], "a tile's zone label"),
  ...textOn("text:zone-k-text", ["fill:surface"], "keeper slot label (break)"),
  ...textOn("text:zone-bench-text", ["fill:surface"], "bench label (break)"),
  ...textOn("text:zone-f-ink", [{ over: "fill:zone-f", alpha: 0.15, under: "fill:surface" }], "bench → FWD strip (R6)"),
  ...textOn("text:zone-c-ink", [{ over: "fill:zone-c", alpha: 0.15, under: "fill:surface" }], "bench → CEN strip (R6)"),
  ...textOn("text:zone-b-ink", [{ over: "fill:zone-b", alpha: 0.15, under: "fill:surface" }], "bench → BACK strip (R6)"),

  // ── Playing surfaces ──────────────────────────────────────────
  ...textOn(WHITE, ["fill:field", "fill:court"], "line headers on the field, court labels"),
  ...uiOn("fill:surface", ["fill:field", "fill:court"], "a player tile against the field"),

  // ── Rings, bars and lines ─────────────────────────────────────
  {
    fg: "fill:zone-f-fill",
    bg: "fill:bar-track",
    kind: "ui",
    where: "zone-time bar (FWD)",
    lightFloor: { min: 2.0, why: "the 17 Oct re-skin steps the bars light / mid / dark for greyscale, so FWD is the light step (2.0:1); the minutes are printed beside the bar" },
  },
  ...uiOn("fill:zone-c-fill", ["fill:bar-track"], "zone-time bar (CEN)"),
  ...uiOn("fill:zone-b-fill", ["fill:bar-track"], "zone-time bar (BACK)"),
  ...uiOn("line:brand-500", ["fill:surface", "fill:brand-50"], "selected tile / option ring"),
  ...uiOn("line:brand-600", ["fill:surface", "fill:warm"], "selected border"),
  ...uiOn("line:focus", ["fill:surface", "fill:warm", "fill:surface-alt", "fill:ink"], "keyboard focus ring (R6), page and chrome"),
  ...uiOn("line:due", ["fill:surface", "fill:due-tint"], "sub-due tile ring"),
  ...uiOn("line:ink", ["fill:surface", "fill:warm"], "selected segment border"),
];
