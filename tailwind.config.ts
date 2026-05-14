import type { Config } from "tailwindcss";

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
      colors: {
        // Surfaces & neutral ink
        warm:           "#F7F5F1",   // page background (warm off-white)
        surface:        "#FFFFFF",   // cards, modals, tiles
        "surface-alt":  "#EFECE6",   // inset / track / subtle container
        ink:            "#1A1E1A",   // primary text + primary button bg
        "ink-dim":      "#5E6860",   // secondary text
        "ink-mute":     "#8A948C",   // tertiary / hints
        hairline:       "#E3DFD7",   // hairlines / subtle borders

        // Accent — brand ladder. Values come from CSS variables
        // declared in globals.css. The :root block defines the AFL
        // field-green defaults; [data-brand="netball"] flips them to
        // the court-blue ladder. Components keep `bg-brand-600` etc.
        // and the value flips at runtime per domain.
        brand: {
          50:  "var(--brand-50)",
          100: "var(--brand-100)",
          200: "var(--brand-200)",
          300: "var(--brand-300)",
          400: "var(--brand-400)",
          500: "var(--brand-500)",
          600: "var(--brand-600)",   // the design token
          700: "var(--brand-700)",
          800: "var(--brand-800)",
          900: "var(--brand-900)",
        },

        // Signals
        alarm:          "#D9442D",   // siren-red — brand mark, pulse indicator
        "alarm-soft":   "#FBE7DF",   // tinted background for alarm pills
        warn:           "#C8751F",   // ochre — sub timer firing, NEXT chip
        "warn-soft":    "#F5E5D2",
        danger:         "#B4393A",
        ok:             "#4C8B63",

        // Game results — used by Game-detail final hero, Form line on Home,
        // and the W/L/D ResultChip atom. Same hue family as the win/ok and
        // danger tokens but slightly desaturated for the chip backgrounds.
        win:            "#2F6B3E",
        "win-soft":     "#E4EEE4",
        loss:           "#9A2B2B",
        "loss-soft":    "#F4DCDC",
        draw:           "#8A6F2A",
        "draw-soft":    "#F2E8C9",

        // Domain — playing-surface fills. `field` is AFL oval green;
        // `court` is netball community-court sky blue. Both come from
        // CSS vars so a future "darker turf" variant could flip them
        // without touching the components that consume them.
        field:          "var(--field)",
        court:          "var(--court)",
        "court-line":   "var(--court-line)",
        // Colourblind-safe zone palette — three hue families roughly
        // 70–80° apart (orange / fuchsia / blue) so adjacent zones stay
        // distinguishable. Violet (#6D28D9) was too close on the hue
        // wheel to royal blue and collapsed into a single purple-ish
        // family; fuchsia-700 is a warm purple that separates cleanly
        // from both orange and blue. All three pass WCAG AA (>=4.5)
        // against white for text use.
        "zone-f":       "#C2410C",   // forward — deep vermillion / burnt orange
        "zone-c":       "#A21CAF",   // centre — fuchsia / warm purple
        "zone-b":       "#1D4ED8",   // back — royal blue

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
      },
      transitionTimingFunction: {
        "out-quart": "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "200ms",
        slow: "320ms",
      },
      keyframes: {
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
      },
      animation: {
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
        "sheet-up":   "sheetUp 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
      },
      letterSpacing: {
        tightest: "-0.02em",
        micro: "0.16em",    // for MICRO caps labels
      },
    },
  },
  plugins: [],
};

export default config;
