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
}

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
  },
  {
    id: "league",
    code: "NRL",
    short: "League",
    label: "Rugby League",
    modeWord: "league",
    periods: "2 halves",
    accent: "#B23A3A",
    accentSoft: "#F4E0E0",
    fieldTintOpacity: 0.10,
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
  },
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
