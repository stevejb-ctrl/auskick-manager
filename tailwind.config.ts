import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import { BRAND_STEPS, TOKENS, cssVar, themeVars, type Role } from "./src/lib/theme/palette";

/** Every palette token (and the brand ladder) for one role, as Tailwind colours. */
function roleColors(role: Role) {
  const v = (name: string) => `rgb(var(${cssVar(name, role)}) / <alpha-value>)`;
  return {
    ...Object.fromEntries(Object.keys(TOKENS).map((name) => [name, v(name)])),
    brand: Object.fromEntries(BRAND_STEPS.map((step) => [step, v(`brand-${step}`)])),
  };
}

// The theme's CSS variables. Light on :root (AFL's ladder; netball's on
// [data-brand="netball"]). Dark when the phone is dark, unless Account →
// Theme says Light (<html data-theme="light">), or always with
// data-theme="dark". `.theme-light` pins a subtree to light (the
// marketing site). The inline script in app/layout.tsx sets data-theme
// before first paint.
const themes = plugin(({ addBase }) => {
  const dark = { ...themeVars("dark", "afl"), "color-scheme": "dark" };
  const netballDark = themeVars("dark", "netball");
  addBase({
    ":root": { ...themeVars("light", "afl"), "color-scheme": "light dark" },
    '[data-brand="netball"]': themeVars("light", "netball"),
    ':root[data-theme="light"]': { "color-scheme": "light" },
    "@media (prefers-color-scheme: dark)": {
      ':root:not([data-theme="light"])': dark,
      '[data-brand="netball"]:not([data-theme="light"])': netballDark,
    },
    ':root[data-theme="dark"]': dark,
    '[data-brand="netball"][data-theme="dark"]': netballDark,
    ".theme-light": { ...themeVars("light", "afl"), "color-scheme": "light", color: `rgb(var(${cssVar("ink", "text")}))` },
    '[data-brand="netball"] .theme-light': themeVars("light", "netball"),
  });
});

// Design tokens from the "Field Sunday" direction
// (see design_handoff_junior_afl_manager/README.md).
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        // A short screen: a phone held sideways (844×390), or a short
        // browser window. The live bars and footers go compact (UX round
        // 3, e4: in landscape they took 205–232 of 390 px).
        short: { raw: "(max-height: 500px)" },
      },
      // Every semantic colour comes from src/lib/theme/palette.ts, by
      // role: fills here, words in textColor, borders and rings in
      // borderColor / ringColor / divideColor / outlineColor below. Each
      // is a CSS variable holding channels ("26 30 26"), emitted per
      // theme by the plugin at the bottom, so the dark theme swaps the
      // values without a class changing and opacity modifiers
      // (`bg-warn/15`) keep working. The zone palette's colourblind
      // rationale and every value's history live in palette.ts.
      colors: {
        ...roleColors("fill"),
        // Lines on the court: 70% white, the same in both themes.
        "court-line": "var(--court-line)",

        // Thirds (netball domain language). Additive — not a rename
        // of the zone-* AFL tokens. Centre is violet (not fuchsia)
        // so the trio still satisfies the colourblind-safe constraint
        // when paired with the new netball court-blue brand.
        "third-a":      "var(--third-a)",
        "third-c":      "var(--third-c)",
        "third-d":      "var(--third-d)",
        "third-a-soft": "var(--third-a-soft)",
        "third-c-soft": "var(--third-c-soft)",
        "third-d-soft": "var(--third-d-soft)",

        // Bib namespace — marketing illustration only. Each position
        // is a `{ fill, ink }` pair so a Tailwind class like
        // `bg-bib-gs-fill text-bib-gs-ink` paints the chip with the
        // tuned-for-AA pairing. The 7-step ladder runs A → D in
        // lightness/hue so the bench reads left-to-right as a
        // position spectrum, with C centred.
        bib: {
          gs: { fill: "var(--bib-gs-fill)", ink: "var(--bib-gs-ink)" },
          ga: { fill: "var(--bib-ga-fill)", ink: "var(--bib-ga-ink)" },
          wa: { fill: "var(--bib-wa-fill)", ink: "var(--bib-wa-ink)" },
          c:  { fill: "var(--bib-c-fill)",  ink: "var(--bib-c-ink)"  },
          wd: { fill: "var(--bib-wd-fill)", ink: "var(--bib-wd-ink)" },
          gd: { fill: "var(--bib-gd-fill)", ink: "var(--bib-gd-ink)" },
          gk: { fill: "var(--bib-gk-fill)", ink: "var(--bib-gk-ink)" },
        },
      },
      textColor: roleColors("text"),
      placeholderColor: roleColors("text"),
      textDecorationColor: roleColors("text"),
      // A bare `border` is a hairline (was Tailwind's gray-200, which
      // glared on the dark page).
      borderColor: { ...roleColors("line"), DEFAULT: "rgb(var(--l-hairline) / <alpha-value>)" },
      divideColor: roleColors("line"),
      ringColor: roleColors("line"),
      outlineColor: roleColors("line"),
      fontFamily: {
        sans: ["var(--font-geist)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        // Decorative serif for round numerals on the Games list and game
        // heroes — used italic only. Falls back to Georgia which has a
        // similar warm, slightly editorial flavour.
        serif: ["var(--font-instrument-serif)", "Georgia", "serif"],
      },
      borderRadius: {
        xs: "4px",
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "22px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(26,30,26,0.06)",
        pop:  "0 4px 12px rgba(26,30,26,0.08)",
        modal:"0 12px 32px rgba(26,30,26,0.12)",
        // Elevation for cards that sit ON a playing surface — a
        // hairline border vanishes on green / blue, a lift doesn't.
        "lift-field": "0 1px 0 rgba(0,0,0,0.12), 0 2px 6px rgba(15,45,25,0.18)",
        "lift-court": "0 1px 0 rgba(0,0,0,0.12), 0 4px 10px rgba(8,40,70,0.28)",
      },
      transitionTimingFunction: {
        // Also the re-skin's --ease-snap.
        "out-quart": "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "200ms",
        slow: "320ms",
        // Re-skin motion tokens.
        tap: "80ms",
        move: "240ms",
        confirm: "600ms",
      },
      keyframes: {
        // ── In-game re-skin motion (design session 17 Oct 2026) ──
        // Slot roll for scorebug numbers: old out the top, new in from
        // below (reversed for a decrease). Transform only.
        "roll-out-up":   { from: { transform: "translateY(0)" },     to: { transform: "translateY(-100%)" } },
        "roll-in-up":    { from: { transform: "translateY(100%)" },  to: { transform: "translateY(0)" } },
        "roll-out-down": { from: { transform: "translateY(0)" },     to: { transform: "translateY(100%)" } },
        "roll-in-down":  { from: { transform: "translateY(-100%)" }, to: { transform: "translateY(0)" } },
        // Reduced-motion stand-in for rolls and slides.
        "xfade-in":      { from: { opacity: "0" }, to: { opacity: "1" } },
        // '+6' / '+1' rising off the score button.
        "ghost-rise": {
          "0%":   { opacity: "0", transform: "translateY(0)" },
          "15%":  { opacity: "1", transform: "translateY(-4px)" },
          "100%": { opacity: "0", transform: "translateY(-20px)" },
        },
        "ghost-fade": {
          "0%":   { opacity: "0" },
          "15%":  { opacity: "1" },
          "100%": { opacity: "0" },
        },
        // OFF n → ✓ chip on a committed swap.
        "chip-pop": {
          "0%":   { opacity: "0", transform: "scale(0.6)" },
          "65%":  { opacity: "1", transform: "scale(1.15)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "chip-out": { from: { opacity: "1" }, to: { opacity: "0" } },
        // The next period's label rising into the clock pill.
        "rise-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        // The sub card folding away after a swap.
        "collapse-y": {
          from: { maxHeight: "640px", opacity: "1" },
          to:   { maxHeight: "0px", opacity: "0" },
        },
        slideUp: {
          from: { transform: "translateY(72px)", opacity: "0" },
          to:   { transform: "translateY(0)",    opacity: "1" },
        },
        pulseHalo: {
          "0%":   { transform: "scale(1)",   opacity: "0.55" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        // Ring halo around a rectangular CTA. Used by PulseRing for the
        // kickoff window pulse on "Open game", the LIVE chip indicator,
        // and any future "moment that just happened around a button"
        // signal. `currentColor` lets the consumer set the hue via
        // `text-alarm` / `text-warn` on the wrapper — mirroring how
        // `siren-pulse` inherits its colour stops from
        // `--siren-pulse-from / --siren-pulse-to` brand variables. The
        // opacity property fades the box-shadow as it spreads so the
        // ring reads as a halo rather than a solid frame.
        pulseRipple: {
          "0%":   { boxShadow: "0 0 0 0 currentColor",  opacity: "0.55" },
          "100%": { boxShadow: "0 0 0 22px currentColor", opacity: "0" },
        },
        // Modal / sheet entrance. 8px slide-up + opacity 0→1. The
        // slide is intentionally subtle — modals are content-
        // dominant, not motion-dominant, so anything beyond ~10px
        // reads as decoration. Paired with `animate-fade-in` on the
        // backdrop so the card lands first (220ms) and the backdrop
        // catches up (350ms). Reduced-motion users get instant final
        // state via the `motion-safe:` modifier on the consumer.
        sheetUp: {
          from: { transform: "translateY(8px)", opacity: "0" },
          to:   { transform: "translateY(0)",   opacity: "1" },
        },
        // Bottom-anchored sheet entrance — the WHOLE sheet slides
        // up from below the viewport edge. Used by SlotFillSheet on
        // mobile (`items-end`). Distinct from `sheetUp` above which
        // is a subtle nudge for centered modals; this one is the
        // full iOS-style action-sheet rise.
        sheetUpMobile: {
          from: { transform: "translateY(100%)" },
          to:   { transform: "translateY(0)" },
        },
        // Centered-modal entrance with a slight scale-and-fade.
        // Used by SlotFillSheet on `sm:` and above (where the sheet
        // is centered rather than bottom-anchored). Stripe-pattern
        // pop — readable as "this just appeared with intent" rather
        // than as a snap. Scale starts at 0.96 to avoid a noticeable
        // size jump.
        popIn: {
          from: { transform: "scale(0.96)", opacity: "0" },
          to:   { transform: "scale(1)",    opacity: "1" },
        },
        // Background-tint flash. Used as an absolutely-positioned
        // overlay that briefly tints a row/card after a successful
        // write, confirming the action landed. The consumer sets
        // the colour via Tailwind (e.g. `bg-ok/15`); this keyframe
        // just fades the opacity out. 400ms is short enough that
        // the flash doesn't compete with the user's next tap but
        // long enough to be perceptible. P1-2 in
        // MICRO-INTERACTIONS-PLAN.md.
        bgFlash: {
          "0%":   { opacity: "1" },
          "100%": { opacity: "0" },
        },
        // List-row arrival — 50px translateX + opacity 0→1. Used by
        // FillInRow when a new row appears in the AvailabilityList
        // (and reusable for other list-adds: late arrivals, new
        // squad members, etc.). The +50px starts the row slightly
        // off to the right; ease-out-quart settles it into place.
        // P1-3 in MICRO-INTERACTIONS-PLAN.md.
        slideInRight: {
          from: { transform: "translateX(50px)", opacity: "0" },
          to:   { transform: "translateX(0)",    opacity: "1" },
        },
        // Mirror of slideInRight — content arrives from the LEFT.
        // Used by the WalkthroughModal when the user taps Back so
        // the directional flow reads as "I went backwards" (content
        // slides in from the left, the opposite of the Next direction).
        // P2-7 in MICRO-INTERACTIONS-PLAN.md.
        slideInLeft: {
          from: { transform: "translateX(-50px)", opacity: "0" },
          to:   { transform: "translateX(0)",     opacity: "1" },
        },
        // Jersey-number swap on Guernsey. The new digit drops in from
        // 8px above with a brief opacity ramp. Reads as "the number
        // just updated" without a hard cut. P2-4 in
        // MICRO-INTERACTIONS-PLAN.md.
        digitFlip: {
          "0%":   { transform: "translateY(-8px) scale(0.85)", opacity: "0" },
          "60%":  { transform: "translateY(0) scale(1.05)",    opacity: "1" },
          "100%": { transform: "translateY(0) scale(1)",       opacity: "1" },
        },
        // Bottom-up entry — 40px translateY + opacity 0→1. Used by
        // the swap-applied toast and the sticky-bottom-bar in
        // LiveGame. The toast is transient (220ms entry, lives 2.5s);
        // the sticky bar is persistent (180ms entry, stays mounted
        // for the rest of the quarter). Sharing one keyframe at two
        // durations keeps the visual language coherent. P1-6 + P1-14
        // in MICRO-INTERACTIONS-PLAN.md.
        slideInBottom: {
          from: { transform: "translateY(40px)", opacity: "0" },
          to:   { transform: "translateY(0)",    opacity: "1" },
        },
      },
      animation: {
        // Re-skin motion — durations from the tap/move/confirm tokens,
        // the out-quart (ease-snap) curve.
        "roll-out-up":   "roll-out-up 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "roll-in-up":    "roll-in-up 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "roll-out-down": "roll-out-down 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "roll-in-down":  "roll-in-down 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "xfade-in":      "xfade-in 120ms ease-out both",
        "ghost-rise":    "ghost-rise 600ms ease-out 100ms both",
        "ghost-fade":    "ghost-fade 600ms ease-out 100ms both",
        "chip-pop":      "chip-pop 120ms ease-out both",
        "chip-out":      "chip-out 200ms ease-out 1200ms both",
        "rise-in":       "rise-in 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "collapse-y":    "collapse-y 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        // Used by GameSummaryCard to announce itself at full time.
        "slide-up":   "slideUp 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both",
        // Used by PulseMark — the siren-red halo ripple.
        "pulse-halo": "pulseHalo 1.8s ease-out infinite",
        // Used by the mobile features overlay card (350ms ease-out per
        // the design handoff's crossfade timing).
        "fade-in":    "fadeIn 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        // PulseRing variants. Single `pulseRipple` keyframe driven at
        // three cadences:
        //   `steady` (1.6s) — running status indicators (LIVE chip).
        //   `slow`   (2.6s) — sustained urgency (kickoff window CTA,
        //                     final 10 sec of a quarter).
        //   `burst`  (1.4s × 3) — moment-that-just-happened halos
        //                         (siren end, full-time, goal scored).
        // `burst` ends with `forwards` so the final transparent state
        // sticks; the other two loop indefinitely.
        "pulse-ripple":       "pulseRipple 1.6s ease-out infinite",
        "pulse-ripple-slow":  "pulseRipple 2.6s ease-out infinite",
        "pulse-ripple-burst": "pulseRipple 1.4s ease-out 3 forwards",
        // Modal / sheet entrance — used by Modal.tsx + (in PR 6,
        // P0-5) SlotFillSheet.tsx. 220ms is the project's
        // "sheet/modal entry" speed budget per the plan.
        "sheet-up":        "sheetUp 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        // SlotFillSheet variants. Mobile sheets ride up from the
        // bottom edge at 240ms (the slightly longer duration is
        // earned by the much larger geometric travel — 100% of the
        // sheet height vs an 8px nudge). Desktop sheets pop in
        // place at 200ms.
        "sheet-up-mobile": "sheetUpMobile 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "pop-in":          "popIn 200ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        // Soft post-write confirmation flash — used as an overlay
        // tint that fades over 400ms after a successful state
        // change (availability toggle, list-row commit).
        "bg-flash":        "bgFlash 400ms ease-out both",
        // List-row arrival entry — used on list items that mount as
        // a result of a user action (fill-in added, late arrival
        // joined). 220ms is the project's "small surface change"
        // speed budget.
        "slide-in-right":  "slideInRight 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "slide-in-left":   "slideInLeft 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        // Jersey-number swap — 280ms is slightly longer than the
        // standard "small surface change" budget because the
        // overshoot (1.05 scale at 60%) needs a beat to settle.
        "digit-flip":      "digitFlip 280ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        // Bottom-up entries — toast at 220ms (matches list-add tempo),
        // sticky bar at 180ms (faster because the surface is large
        // and persistent — coach can't tap mid-slide if it lingers).
        "slide-in-bottom":      "slideInBottom 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "slide-in-bottom-fast": "slideInBottom 180ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
      },
      letterSpacing: {
        tightest: "-0.02em",
        micro: "0.16em",    // for MICRO caps labels
      },
    },
  },
  plugins: [themes],
};

export default config;
