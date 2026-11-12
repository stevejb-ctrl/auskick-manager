// The sports as the public site shows them: the homepage's sport
// directory and hero chips, the header's Sports menu, the footer, the
// sport pages (/netball, /afl, …) and the demo picker.
//
// Pure data, so client and server components (and the middleware, via
// public-routes.ts) can import it without pulling in the sport engines.
// Each sport's words for its page live in content/marketing/sports.json
// (src/lib/marketing/sportPages.ts), its tour's too; its screenshots
// in public/marketing/screenshots/<slug>/.
//
// Order is Steve's popularity order (25 Oct 2026), used everywhere the
// site lists sports: netball, AFL, rugby league, football (soccer),
// basketball, rugby union, touch football, Oztag, hockey, futsal.

import type { SportId } from "@/lib/sports/types";

export type MarketingSportId =
  | "netball"
  | "afl"
  | "league"
  | "football"
  | "basketball"
  | "union"
  | "touch"
  | "oztag"
  | "hockey"
  | "futsal";

export interface MarketingSportConfig {
  /** The site's id for the sport: the demo form's value and the test ids. */
  id: MarketingSportId;
  /** The app's sport. Its facts come from src/lib/siren-facts.ts. */
  sport: SportId;
  /** The sport page's path, without the slash: /netball. */
  slug: string;
  /** Small uppercase code on the demo cards ("AFL", "RL"). Not "NRL":
   *  that's the league's trade mark, and Siren isn't affiliated. */
  code: string;
  /** The sport's name as a heading or a menu item. */
  label: string;
  /** Short name for chips: "Football", "Touch". */
  short: string;
  /** The sport's colour: its dot, its page's accent word and field
   *  drawing. Text in it is large type only (some are under 4.5:1). */
  accent: string;
  /**
   * The sport's playing surface, as the live screen draws it: grass,
   * court or boards. The site's field bands are painted in it.
   */
  surface: MarketingSurface;
  /** The demo picker (/demo) can start a game in this sport. */
  hasDemo: boolean;
}

/** The live screen's surfaces (FieldLines): grass, court, boards. */
export type MarketingSurface = "field" | "court" | "wood";

/**
 * The moments each sport page's tour shows, one screenshot each, in
 * the order a game goes (scripts/capture-marketing-v3.mjs shoots them).
 */
export const TOUR_SHOTS = ["live", "pairs", "scoring", "break", "fulltime", "stats"] as const;
export type TourShot = (typeof TOUR_SHOTS)[number];

/** A sport's screenshot of one moment: /marketing/screenshots/<slug>/<shot>.png. */
export function sportShot(sport: Pick<MarketingSportConfig, "slug">, shot: TourShot): string {
  return `/marketing/screenshots/${sport.slug}/${shot}.png`;
}

export const MARKETING_SPORTS: readonly MarketingSportConfig[] = [
  {
    id: "netball",
    surface: "court",
    sport: "netball",
    slug: "netball",
    code: "NB",
    label: "Netball",
    short: "Netball",
    accent: "#7C3F8C",
    hasDemo: true,
  },
  {
    id: "afl",
    surface: "field",
    sport: "afl",
    slug: "afl",
    code: "AFL",
    label: "AFL",
    short: "AFL",
    accent: "#D9442D",
    hasDemo: true,
  },
  {
    id: "league",
    surface: "field",
    sport: "rugby_league",
    slug: "rugby-league",
    code: "RL",
    label: "Rugby league",
    short: "Rugby league",
    accent: "#2F8C45",
    hasDemo: true,
  },
  {
    id: "football",
    surface: "field",
    sport: "soccer",
    slug: "soccer",
    code: "FB",
    label: "Football (soccer)",
    short: "Football",
    accent: "#1F5FA8",
    hasDemo: true,
  },
  {
    id: "basketball",
    surface: "wood",
    sport: "basketball",
    slug: "basketball",
    code: "BB",
    label: "Basketball",
    short: "Basketball",
    accent: "#B86E0F",
    hasDemo: true,
  },
  {
    id: "union",
    surface: "field",
    sport: "rugby_union",
    slug: "rugby-union",
    code: "RU",
    label: "Rugby union",
    short: "Rugby union",
    accent: "#2F6B3E",
    hasDemo: true,
  },
  {
    id: "touch",
    surface: "field",
    sport: "touch",
    slug: "touch-football",
    code: "TF",
    label: "Touch football",
    short: "Touch",
    accent: "#B0306A",
    hasDemo: true,
  },
  {
    id: "oztag",
    surface: "field",
    sport: "oztag",
    slug: "oztag",
    code: "OZ",
    label: "Oztag",
    short: "Oztag",
    accent: "#5E6B0F",
    hasDemo: true,
  },
  {
    id: "hockey",
    surface: "field",
    sport: "hockey",
    slug: "hockey",
    code: "HK",
    label: "Hockey",
    short: "Hockey",
    accent: "#3F4FB0",
    hasDemo: true,
  },
  {
    id: "futsal",
    surface: "court",
    sport: "futsal",
    slug: "futsal",
    code: "FS",
    label: "Futsal",
    short: "Futsal",
    accent: "#0E7C86",
    hasDemo: true,
  },
] as const;

export function getMarketingSport(id: MarketingSportId): MarketingSportConfig {
  return MARKETING_SPORTS.find((m) => m.id === id) ?? MARKETING_SPORTS[0];
}

/** The sport whose page is at /<slug>, if any. */
export function marketingSportBySlug(slug: string): MarketingSportConfig | undefined {
  return MARKETING_SPORTS.find((m) => m.slug === slug);
}

/** The sport page's path: "/netball". */
export function sportPagePath(sport: MarketingSportConfig): string {
  return `/${sport.slug}`;
}
