// The public site's words for each sport: its homepage tile, its line
// in the header's Sports menu, and its page (/netball, /afl, …), tour
// included. The copy is content/marketing/sports.json (checked against
// the facts by src/lib/__tests__/sirenFacts.test.ts); the sport's
// colour, surface and screenshots are src/lib/sports/marketing-sports.ts.

import type { TitleParts } from "@/lib/sports/brand-copy";
import { TOUR_SHOTS, type TourShot } from "@/lib/sports/marketing-sports";
import type { SportId } from "@/lib/sports/types";
import rawCopy from "../../../content/marketing/sports.json";

/** One moment of a sport page's tour, over that moment's screenshot. */
export interface TourStepCopy {
  /** The moment in the game, as a coach would say it: "Quarter time". */
  stamp: string;
  title: TitleParts;
  body: string;
  /** What the screenshot shows, for anyone who can't see it. */
  alt: string;
}

export interface SportPageCopy {
  /** One line under the sport's name on the homepage tile. */
  tileLine: string;
  /** A few words under the sport's name in the Sports menu. */
  menuLine: string;
  /** The format, " · " between its parts: the plates over the H1. */
  eyebrow: string;
  heroTitle: TitleParts;
  heroSubtitle: string;
  metaTitle: string;
  metaDescription: string;
  /** Three things Siren knows about the sport's junior rules. */
  knows: ReadonlyArray<{ stat: string; title: string; body: string }>;
  /** The tour's heading: "From the first bounce to the stats." */
  tourHeading: TitleParts;
  /** The tour: one game, a step per screenshot, in TOUR_SHOTS order. */
  tour: Record<TourShot, TourStepCopy>;
}

const COPY = rawCopy as Record<SportId, SportPageCopy>;

export function sportPageCopy(sport: SportId): SportPageCopy {
  return COPY[sport];
}

/** A sport's tour, step by step, in the order a game goes. */
export function sportTour(sport: SportId): SportPageCopy["tour"] {
  return COPY[sport].tour;
}

export { TOUR_SHOTS };

/** One of the six things Siren does in every sport, shown in one. */
export interface SharedFeature {
  title: string;
  body: string;
  /** The sport the screenshot shows, or null for one that's the same in all. */
  shownIn: SportId | null;
  image: string;
  imageAlt: string;
}

const SHOTS = "/marketing/screenshots";

/**
 * The homepage's six features, each over a different sport's screen
 * (live v3, scripts/capture-marketing-v3.mjs), so the section shows the
 * range without a sport picker.
 */
export const SHARED_FEATURES: readonly SharedFeature[] = [
  {
    title: "Fair time, by position",
    body: "Not just minutes. Siren balances where every kid plays, through each period and across the season.",
    shownIn: "afl",
    image: `${SHOTS}/afl/stats.png`,
    imageAlt: "AFL stats: everyone within a quarter of even, and each kid's minutes forward, in the centre and back",
  },
  {
    title: "A turn in every spot",
    body: "Keeper, goal shooter, guard: every kid gets a go at each, and nobody is forced in goal.",
    shownIn: "soccer",
    image: `${SHOTS}/soccer/live.png`,
    imageAlt: "Football (soccer) live game: the keeper in goal and the defenders, midfield and attack in their lines",
  },
  {
    title: "Subs on the clock",
    body: "Siren says who comes off, who goes on, and when. One tap and the swaps are done.",
    shownIn: "basketball",
    image: `${SHOTS}/basketball/pairs.png`,
    imageAlt: "Basketball subs: each pair, who comes off and who goes on, and one button to make them all",
  },
  {
    title: "Curveballs, handled",
    body: "Late arrivals, injuries, a kid lent to the other side. Tap a player, then More, and play on.",
    shownIn: "rugby_league",
    image: `${SHOTS}/rugby-league/actions.png`,
    imageAlt: "Rugby league: one kid picked on the field, with switch, mark injured, went home and lend to the other team",
  },
  {
    title: "Hand it to a parent",
    body: "Send a link and a parent runs the game from the sideline. No app, no account.",
    shownIn: null,
    image: `${SHOTS}/netball/runner.png`,
    imageAlt: "A parent's phone on the game-day link, scoring for the team: the live court and the score, with no sign-in",
  },
  {
    title: "The season, balanced",
    body: "See who has played where across the season, and fix it before next week.",
    shownIn: "netball",
    image: `${SHOTS}/netball/stats.png`,
    imageAlt: "Netball stats: everyone within a quarter of even, and each kid's minutes in attack, centre and defence",
  },
];
