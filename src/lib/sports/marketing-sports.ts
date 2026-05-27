// Multi-sport homepage data — independent of the brand resolver
// (lib/brand.ts) and the in-app sport configs (lib/sports/index.ts).
// The brand resolver is host-based ("which Siren am I?"); this file
// powers the interactive sport-picker on the marketing homepage
// ("Show me Siren in a different sport").
//
// Stays a tiny pure-data module so client + server can both import
// without pulling React. Order here is the order the sports render
// in the picker on the homepage.

export type MarketingSportId = "afl" | "league" | "union" | "netball";

export interface MarketingSportConfig {
  id: MarketingSportId;
  /** Small uppercase code that runs above each picker-card name
   *  ("AFL" / "NRL" / "RU" / "NB"). */
  code: string;
  /** Short label used in pill / chip labels. */
  short: string;
  /** Full sport name shown as the picker-card headline. */
  label: string;
  /** Lowercase word that drops into "See Siren in __ mode." */
  modeWord: string;
  /** Period descriptor for the small top-right "AFL · 4 QUARTERS"
   *  label inside the dark section. */
  periods: string;
  /** Hex accent — the only colour that changes when this sport is
   *  picked. Cascades to picker active-fill, headline word, and any
   *  consumer reading `var(--sport-accent)`. */
  accent: string;
  /** Soft accent (light pill backgrounds, etc.) — exported for
   *  parity with the design handoff. */
  accentSoft: string;
  /** Field tint opacity on the picker-card background. 0.10 default
   *  — quiet enough that the field reads as decoration, loud enough
   *  to telegraph "this is a different sport". */
  fieldTintOpacity: number;
  /** Phone-mock screenshot path for the hero carousel. `null` when
   *  a sport-specific screenshot doesn't exist yet — HeroCarousel
   *  falls back to a placeholder card matching Claude Design's
   *  "real <sport> screenshot lands here" pattern. */
  heroScreenshot: string | null;
  /** Alt text for the hero screenshot when present. */
  heroScreenshotAlt: string;
  /**
   * Sport hasn't shipped yet. Picker renders a disabled card with a
   * "Coming soon" subtitle; HeroCarousel filters the sport out of
   * its rotation entirely (no pagination dot, never auto-advances
   * to it); MultiSportHomeContent ignores a localStorage value
   * that resolves to a coming-soon sport and falls back to the
   * default. Flip to `false` (or omit) once the sport launches.
   */
  comingSoon?: boolean;
}

// Hero headline / subtitle / trust line + per-sport eyebrows live in
// content/marketing/home.json (CMS-editable via Pages CMS). See
// @/lib/marketing/homeContent for the typed loader.

export const MARKETING_SPORTS: readonly MarketingSportConfig[] = [
  {
    id: "afl",
    code: "AFL",
    short: "AFL",
    label: "AFL",
    modeWord: "afl",
    periods: "4 quarters",
    // Brand's alarm-orange — matches `bg-brand-600` (#D9442D) so the
    // AFL accent reads as the existing Siren brand colour.
    accent: "#D9442D",
    accentSoft: "#FBE7DF",
    fieldTintOpacity: 0.10,
    heroScreenshot: "/marketing/screenshots/live-game.png",
    heroScreenshotAlt: "AFL live game view — Fitzroy Falcons rotation",
  },
  {
    id: "league",
    code: "NRL",
    short: "League",
    label: "Rugby League",
    modeWord: "league",
    periods: "2 halves",
    // Junior rugby league leafy green — distinct from AFL alarm
    // orange and netball purple. Note Union below is also green
    // (darker forest); the two read similarly side-by-side but
    // Union is coming-soon (disabled card) so they don't actively
    // compete for the eye. If Union launches with a similar
    // palette, retint one of the two.
    accent: "#2F8C45",
    accentSoft: "#DEEFE3",
    fieldTintOpacity: 0.10,
    heroScreenshot: "/marketing/screenshots/league/live-game.png",
    heroScreenshotAlt:
      "Rugby League live game — Bangles JRL U10 vs Stockton Seahawks, half 1",
  },
  // Netball sits in slot 3 so the three shipped sports (AFL,
  // League, Netball) cluster in positions 1-3 and the coming-soon
  // Union card lands in slot 4 — the disabled/dimmed card is the
  // visual "last in the row" rather than a gap in the middle of
  // the active sports. Reorder if Union's order shifts post-launch.
  {
    id: "netball",
    code: "NB",
    short: "Netball",
    label: "Netball",
    modeWord: "netball",
    periods: "4 quarters",
    accent: "#7C3F8C",
    accentSoft: "#EFE2F2",
    fieldTintOpacity: 0.10,
    heroScreenshot: "/marketing/screenshots/netball/live-game.png",
    heroScreenshotAlt: "Netball live court view — Bondi Bandits Q4",
  },
  {
    id: "union",
    code: "RU",
    short: "Union",
    label: "Rugby Union",
    modeWord: "union",
    periods: "2 halves",
    accent: "#2F6B3E",
    accentSoft: "#DFEAE0",
    fieldTintOpacity: 0.12,
    heroScreenshot: null,
    heroScreenshotAlt: "Rugby union live game view",
    comingSoon: true,
  },
] as const;

export function getMarketingSport(id: MarketingSportId): MarketingSportConfig {
  const s = MARKETING_SPORTS.find((m) => m.id === id);
  if (!s) {
    // Defensive fallback — shouldn't happen since id is type-narrowed
    // to MarketingSportId, but a future SSR + bad localStorage read
    // could land here. AFL is always safe.
    return MARKETING_SPORTS[0];
  }
  return s;
}

export const DEFAULT_MARKETING_SPORT: MarketingSportId = "afl";

/** Used by the picker to validate values read from localStorage. */
export function isMarketingSportId(value: unknown): value is MarketingSportId {
  return MARKETING_SPORTS.some((s) => s.id === value);
}
