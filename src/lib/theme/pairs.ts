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

const pages = ["fill:warm", "fill:surface", "fill:surface-alt", "fill:sheet"] as const;

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
  // A swap row on the sub card lifts the chrome with white at 6%.
  ...textOn("fill:zone-f-dark", [{ over: "#FFFFFF", alpha: 0.06, under: "fill:ink" }], "FWD label in a sub card swap row"),
  ...textOn("fill:zone-c-dark", [{ over: "#FFFFFF", alpha: 0.06, under: "fill:ink" }], "CEN label in a sub card swap row"),
  ...textOn("fill:zone-b-dark", [{ over: "#FFFFFF", alpha: 0.06, under: "fill:ink" }], "BACK label in a sub card swap row"),

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
  ...textOn({ over: "text:warm", alpha: 0.9, under: "fill:danger" }, ["fill:danger"], "the line under Mark injured (LockModal)"),
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
  ...textOn("text:alarm-ink", ["fill:surface", "fill:alarm-soft"], "Live badge, a loss on Home (round 9)"),
  ...textOn("text:warn-ink", ["fill:warm", "fill:surface", "fill:warn-soft"], "warn notices on the tint (round 9)"),
  ...textOn(WHITE, ["fill:alarm-ink"], "Back to live game button (round 9)"),
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
  // A tile is white in light; in dark it is the dark surface, edged in
  // tile-edge (shadow-lift-field / -court) so it doesn't sink into the grass.
  ...uiOn("fill:tile-edge", ["fill:field", "fill:court", "fill:wood"], "a player tile's edge against the field"),

  // ── Chalk on grass (live v3) ──────────────────────────────────
  // Names in chalk on the grass, court and boards, bare or on the
  // faint chalk plate (`bg-mark/[0.07]`).
  ...textOn("fill:mark", ["fill:field", "fill:court", "fill:wood"], "kid names on the field, court, boards"),
  ...textOn("fill:mark", [
    { over: "fill:mark", alpha: 0.07, under: "fill:field" },
    { over: "fill:mark", alpha: 0.07, under: "fill:court" },
    { over: "fill:mark", alpha: 0.07, under: "fill:wood" },
  ], "kid names on their plate"),
  // A selected kid: the plate fills with chalk, the name turns ink.
  ...textOn("fill:mark-ink", ["fill:mark"], "selected kid on the grass (ink on chalk, both themes)"),
  // Zone words on the grass.
  ...textOn("fill:zone-f-on-field", ["fill:field", { over: "fill:mark", alpha: 0.07, under: "fill:field" }], "FWD on the grass"),
  ...textOn("fill:zone-c-on-field", ["fill:field", { over: "fill:mark", alpha: 0.07, under: "fill:field" }], "CEN on the grass"),
  ...textOn("fill:zone-b-on-field", ["fill:field", { over: "fill:mark", alpha: 0.07, under: "fill:field" }], "BACK on the grass"),
  // The bench: ink on chalk on its plate (`bg-ink/[0.045]`).
  ...textOn("text:ink", [{ over: "fill:ink", alpha: 0.045, under: "fill:warm" }], "bench kid names on their plate"),
  ...textOn("text:ink-mute", [{ over: "fill:ink", alpha: 0.045, under: "fill:warm" }], "bench kid words"),
  // The bright fills carry their own ink, in both themes.
  ...textOn("fill:hivis-ink", ["fill:hivis"], "act now: due clock, \"On now\" chip, due badge"),
  ...textOn("fill:sun-ink", ["fill:sun"], "under-minimum chip"),
  ...textOn("fill:sky-ink", ["fill:sky"], "notice line"),
  ...textOn(WHITE, ["fill:blood"], "injured chip"),
  ...textOn("fill:mark", ["fill:blood"], "injured chip (chalk words)"),
  // Words on the tints, which go dark at night: ink or the signal's
  // own text tone (the *-ink colours are for the bright fills only).
  ...textOn("text:ink", ["fill:hivis-soft", "fill:sun-soft", "fill:sky-soft", "fill:blood-soft"], "words on a signal tint"),
  ...textOn("text:hivis", ["fill:warm", "fill:surface", "fill:hivis-soft"], "act-now words on the page"),
  ...textOn("text:sun", ["fill:warm", "fill:surface", "fill:sun-soft"], "under-minimum words on the page"),
  ...textOn("text:sky", ["fill:warm", "fill:surface", "fill:sky-soft"], "back-line words on the page"),
  ...textOn("text:blood", ["fill:warm", "fill:surface", "fill:blood-soft"], "injured words"),
  // The filled primary, and its inverse at night.
  ...textOn("text:on-primary", ["fill:primary"], "the filled primary button"),
  ...uiOn("fill:primary", ["fill:warm", "fill:surface", "fill:surface-alt"], "the filled primary, the selected segment on its track"),
  // The switch (ui/Toggle): an ink-mute track when off, chalk knob.
  ...uiOn("fill:ink-mute", ["fill:warm", "fill:surface", "fill:sheet"], "a switch that's off"),
  ...uiOn("fill:mark", ["fill:ink-mute", "fill:brand-600"], "the switch's knob"),
  // Ink-mute on the chalk page (about 6:1).
  ...textOn("text:ink-mute", ["fill:well", "fill:brand-50"], "hints on a score button or a brand tint"),
  // Rings on the grass and on the bench.
  ...uiOn("fill:hivis", ["fill:field", "fill:court", "fill:wood"], "due kid's edge on the grass"),
  ...uiOn("fill:mark", ["fill:field", "fill:court", "fill:wood"], "chalk pair badge, the dashed empty slot"),
  ...uiOn("line:hivis", ["fill:warm", "fill:surface"], "due kid's edge on the bench"),
  ...uiOn("line:sun", ["fill:warm", "fill:surface", { over: "fill:ink", alpha: 0.045, under: "fill:warm" }], "under-minimum ring on the bench"),
  ...uiOn("fill:zone-f-on-field", ["fill:field"], "under-minimum ring on the grass"),
  ...uiOn("line:blood", ["fill:warm", "fill:surface"], "injured outline"),
  ...uiOn("fill:mint", ["fill:warm", "fill:surface"], "running-clock dot on the chalk header"),

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
