import type { CSSProperties, ReactNode } from "react";

/**
 * Per-sport accent palette. Each sport contributes three values:
 *
 *   accent       — primary brand hue (CTAs, the "five" in the closer,
 *                  feature indices, pulse mark)
 *   accentSoft   — low-saturation tint of the same hue, used for
 *                  pill backgrounds and warn-style chips
 *   accentInk    — text that sits on top of `accent` (always #FFF for
 *                  AFL/Netball today, but tokenised so future sports
 *                  with a yellow accent can flip to dark ink)
 *
 * Driven by SportThemeProvider via CSS custom properties, so the same
 * marketing components reskin between /(footy) and /netball without
 * touching the tree.
 */
export const SPORT_THEMES = {
  footy: {
    label: "AFL",
    eyebrow: "Built for junior AFL",
    accent: "#357840",      // brand-500 — footy field green
    accentSoft: "#CDDFCD",  // brand-100 — slightly darker than the mint body bg
    accentInk: "#FFFFFF",
  },
  netball: {
    label: "netball",
    eyebrow: "Built for junior netball",
    accent: "#7C3F8C",      // plum
    accentSoft: "#EFE2F2",
    accentInk: "#FFFFFF",
  },
} as const;

export type SportId = keyof typeof SPORT_THEMES;

interface SportThemeProviderProps {
  sport: SportId;
  children: ReactNode;
}

/**
 * Wraps a marketing page tree and publishes the sport's accent palette
 * via CSS variables. The wrapped tree can then use `bg-accent`,
 * `text-accent`, `bg-accent-soft`, etc. (defined in tailwind.config.ts)
 * and pick up the right colour.
 *
 * Server-component-safe — no hooks, no state.
 */
export function SportThemeProvider({ sport, children }: SportThemeProviderProps) {
  const t = SPORT_THEMES[sport];
  const style: CSSProperties = {
    // Cast required because React's CSSProperties doesn't know about
    // custom CSS variable keys.
    ["--sport-accent" as string]: t.accent,
    ["--sport-accent-soft" as string]: t.accentSoft,
    ["--sport-accent-ink" as string]: t.accentInk,
  };
  return (
    <div data-sport={sport} style={style}>
      {children}
    </div>
  );
}
