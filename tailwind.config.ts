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
        warn:           "#C8751F",   // ochre — sub timer firing, NEXT chip
        "warn-soft":    "#F5E5D2",
        danger:         "#B4393A",
        ok:             "#4C8B63",

        // Domain
        field:          "#3C8050",
        "zone-f":       "#D47A2E",   // forward (warm orange)
        "zone-c":       "#A87336",   // centre (warm ochre)
        "zone-b":       "#2F6B3E",   // back (green)
      },
      fontFamily: {
        sans: ["var(--font-geist)", "system-ui", "sans-serif"],
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
      letterSpacing: {
        tightest: "-0.02em",
        micro: "0.16em",    // for MICRO caps labels
      },
    },
  },
  plugins: [],
};

export default config;
