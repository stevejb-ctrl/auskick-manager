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

        // Accent — field green (the primary action colour)
        brand: {
          50:  "#E4EEE4",
          100: "#CDDFCD",
          200: "#A7C7A7",
          300: "#7CAA7D",
          400: "#568C57",
          500: "#357840",
          600: "#2F6B3E",   // the design token
          700: "#275834",
          800: "#1F4528",
          900: "#183420",
        },

        // Signals
        alarm:          "#D9442D",   // siren-red — brand mark, pulse indicator
        "alarm-soft":   "#FBE7DF",   // tinted alarm for soft chips / surfaces
        warn:           "#C8751F",   // ochre — sub timer firing, NEXT chip
        "warn-soft":    "#F5E5D2",
        danger:         "#B4393A",
        ok:             "#4C8B63",

        // Per-sport accent — read from CSS variables set by
        // SportThemeProvider so /(footy) and /netball can reskin the
        // same marketing components without forking. Defaults to the
        // alarm-orange footy hue when no provider is mounted (the
        // bare `bg-warm` body still renders sensibly).
        accent:        "var(--sport-accent, #D9442D)",
        "accent-soft": "var(--sport-accent-soft, #FBE7DF)",
        "accent-ink":  "var(--sport-accent-ink, #FFFFFF)",

        // Domain
        field:          "#3C8050",
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
      },
      fontFamily: {
        // `--font-geist-sans` / `--font-geist-mono` are published by the
        // `geist` package on the <html> element (see app/layout.tsx).
        // Fallbacks are kept so SSR / no-JS renders pick up a system
        // sans before Geist hydrates.
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
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
      },
      animation: {
        // Used by GameSummaryCard to announce itself at full time.
        "slide-up":   "slideUp 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both",
        // Used by PulseMark — the siren-red halo ripple.
        "pulse-halo": "pulseHalo 1.8s ease-out infinite",
      },
      letterSpacing: {
        tightest: "-0.02em",
        display: "-0.03em",  // hero h1 — tighter than tightest so the
                              // big display lockup hugs itself
        section: "-0.035em", // section h2 — even tighter at clamp() scale
        micro: "0.16em",     // for MICRO caps labels
        banner: "0.08em",    // marketing banner mono caps
      },
    },
  },
  plugins: [],
};

export default config;
