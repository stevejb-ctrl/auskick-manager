// The sports as the public site shows them: the homepage's sport
// directory and hero chips, the header's Sports menu, the footer, the
// sport pages (/netball, /afl, …) and the demo picker.
//
// Pure data, so client and server components (and the middleware, via
// public-routes.ts) can import it without pulling in the sport engines.
// Each sport's words for its page live in content/marketing/sports.json
// (src/lib/marketing/sportPages.ts); its long-form feature tour, where
// it has one, in content/marketing/brands/*.json.
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
  /** The same hue, pale: panels on the sport page. */
  accentSoft: string;
  /** A phone screenshot of the live game in this sport. */
  liveScreenshot: string;
  liveScreenshotAlt: string;
  /** The demo picker (/demo) can start a game in this sport. */
  hasDemo: boolean;
  /**
   * The sport page's feature tour:
   *  - "own": the brand JSON's features, each with its own screenshot;
   *  - "live": the brand JSON's features, over the sport's live
   *    screenshot (its feature images were borrowed from AFL);
   *  - "shared": no feature copy of its own yet, so the page shows the
   *    homepage's six features, each labelled with the sport it shows.
   */
  tour: "own" | "live" | "shared";
}

const SHOTS = "/marketing/screenshots";

export const MARKETING_SPORTS: readonly MarketingSportConfig[] = [
  {
    id: "netball",
    sport: "netball",
    slug: "netball",
    code: "NB",
    label: "Netball",
    short: "Netball",
    accent: "#7C3F8C",
    accentSoft: "#EFE2F2",
    liveScreenshot: `${SHOTS}/netball/live.png`,
    liveScreenshotAlt: "Netball live court, all seven positions filled, mid-game",
    hasDemo: true,
    tour: "own",
  },
  {
    id: "afl",
    sport: "afl",
    slug: "afl",
    code: "AFL",
    label: "AFL",
    short: "AFL",
    accent: "#D9442D",
    accentSoft: "#FBE7DF",
    liveScreenshot: `${SHOTS}/afl/live.png`,
    liveScreenshotAlt: "AFL live game on the oval, forwards, centres and backs with their time bars",
    hasDemo: true,
    tour: "own",
  },
  {
    id: "league",
    sport: "rugby_league",
    slug: "rugby-league",
    code: "RL",
    label: "Rugby league",
    short: "Rugby league",
    accent: "#2F8C45",
    accentSoft: "#DEEFE3",
    liveScreenshot: `${SHOTS}/rugby-league/live.png`,
    liveScreenshotAlt: "Rugby league live game, the field and the bench, mid-game",
    hasDemo: true,
    tour: "own",
  },
  {
    id: "football",
    sport: "soccer",
    slug: "soccer",
    code: "FB",
    label: "Football (soccer)",
    short: "Football",
    accent: "#1F5FA8",
    accentSoft: "#DFE8F4",
    liveScreenshot: `${SHOTS}/soccer/live.png`,
    liveScreenshotAlt: "Football (soccer) live game with the keeper in goal and suggested swaps",
    hasDemo: true,
    tour: "live",
  },
  {
    id: "basketball",
    sport: "basketball",
    slug: "basketball",
    code: "BB",
    label: "Basketball",
    short: "Basketball",
    accent: "#B86E0F",
    accentSoft: "#F6E7D3",
    liveScreenshot: `${SHOTS}/basketball/live.png`,
    liveScreenshotAlt: "Basketball live game, guards and forwards on the court and suggested swaps",
    hasDemo: false,
    tour: "live",
  },
  {
    id: "union",
    sport: "rugby_union",
    slug: "rugby-union",
    code: "RU",
    label: "Rugby union",
    short: "Rugby union",
    accent: "#2F6B3E",
    accentSoft: "#DFEAE0",
    liveScreenshot: `${SHOTS}/rugby-union/live.png`,
    liveScreenshotAlt: "Rugby union live game, the field and the bench, mid-game",
    hasDemo: true,
    tour: "live",
  },
  {
    id: "touch",
    sport: "touch",
    slug: "touch-football",
    code: "TF",
    label: "Touch football",
    short: "Touch",
    accent: "#B0306A",
    accentSoft: "#F6DFEA",
    liveScreenshot: `${SHOTS}/touch-football/live.png`,
    liveScreenshotAlt: "Touch football live game for a mixed team, mid-game",
    hasDemo: false,
    tour: "shared",
  },
  {
    id: "oztag",
    sport: "oztag",
    slug: "oztag",
    code: "OZ",
    label: "Oztag",
    short: "Oztag",
    accent: "#5E6B0F",
    accentSoft: "#ECEFD6",
    liveScreenshot: `${SHOTS}/oztag/live.png`,
    liveScreenshotAlt: "Oztag live game for a mixed team, mid-game",
    hasDemo: false,
    tour: "shared",
  },
  {
    id: "hockey",
    sport: "hockey",
    slug: "hockey",
    code: "HK",
    label: "Hockey",
    short: "Hockey",
    accent: "#3F4FB0",
    accentSoft: "#E3E6F5",
    liveScreenshot: `${SHOTS}/hockey/live.png`,
    liveScreenshotAlt: "Hockey live game with the keeper, mid-game",
    hasDemo: false,
    tour: "shared",
  },
  {
    id: "futsal",
    sport: "futsal",
    slug: "futsal",
    code: "FS",
    label: "Futsal",
    short: "Futsal",
    accent: "#0E7C86",
    accentSoft: "#DDF0F1",
    liveScreenshot: `${SHOTS}/futsal/live.png`,
    liveScreenshotAlt: "Futsal live game on the court with the keeper, mid-game",
    hasDemo: false,
    tour: "shared",
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
