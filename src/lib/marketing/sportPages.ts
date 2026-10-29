// The public site's words for each sport: its homepage tile, its line
// in the header's Sports menu, and its page (/netball, /afl, …). The
// copy is content/marketing/sports.json (CMS-editable, and checked
// against the facts by src/lib/__tests__/sirenFacts.test.ts); the
// sport's colour, field and screenshot are src/lib/sports/marketing-sports.ts.

import type { TitleParts } from "@/lib/sports/brand-copy";
import type { SportId } from "@/lib/sports/types";
import rawCopy from "../../../content/marketing/sports.json";

export interface SportPageCopy {
  /** One line under the sport's name on the homepage tile. */
  tileLine: string;
  /** A few words under the sport's name in the Sports menu. */
  menuLine: string;
  /** Small caps over the sport page's H1. */
  eyebrow: string;
  heroTitle: TitleParts;
  heroSubtitle: string;
  metaTitle: string;
  metaDescription: string;
  /** Three things Siren knows about the sport's junior rules. */
  knows: ReadonlyArray<{ stat: string; title: string; body: string }>;
}

const COPY = rawCopy as Record<SportId, SportPageCopy>;

export function sportPageCopy(sport: SportId): SportPageCopy {
  return COPY[sport];
}

/** One of the six things Siren does in every sport, shown in one. */
export interface SharedFeature {
  title: string;
  body: string;
  /** The sport the screenshot shows, or null for one that's the same in all. */
  shownIn: SportId | null;
  image: string;
  imageAlt: string;
  /** CSS object-position, to frame the part of the phone that matters. */
  focus: string;
}

const SHOTS = "/marketing/screenshots";

/**
 * The homepage's six features, each over a different sport's screen,
 * so the section shows the range without a sport picker. Sport pages
 * without a feature tour of their own show these too.
 */
export const SHARED_FEATURES: readonly SharedFeature[] = [
  {
    title: "Fair time, by position",
    body: "Not just minutes. Siren balances where every kid plays, through each period and across the season.",
    shownIn: "afl",
    image: `${SHOTS}/afl/live.png`,
    imageAlt: "AFL live game: each kid's time in forward, centre and back",
    focus: "50% 12%",
  },
  {
    title: "A turn in every spot",
    body: "Keeper, goal shooter, guard: every kid gets a go at each, and nobody is forced in goal.",
    shownIn: "soccer",
    image: `${SHOTS}/soccer/live.png`,
    imageAlt: "Football (soccer) live game: the keeper and the defenders",
    focus: "50% 72%",
  },
  {
    title: "Subs on the clock",
    body: "Siren says who comes off, who goes on, and when. One tap and the swap is done.",
    shownIn: "basketball",
    image: `${SHOTS}/basketball/live.png`,
    imageAlt: "Basketball live game with the suggested swaps",
    focus: "50% 0%",
  },
  {
    title: "Curveballs, handled",
    body: "Late arrivals, injuries, a kid lent to the other side. Tap a player, then Player actions, and play on.",
    shownIn: "rugby_league",
    image: `${SHOTS}/rl-long-press.png`,
    imageAlt: "Rugby league player actions: switch player, mark injured, went home, or lend to the opposition",
    focus: "50% 50%",
  },
  {
    title: "Hand it to a parent",
    body: "Send a link and a parent runs the game from the sideline. No app, no account.",
    shownIn: null,
    image: `${SHOTS}/share.png`,
    imageAlt: "A parent's phone on the game-day link: the live field, scoring for their team, no login",
    focus: "50% 50%",
  },
  {
    title: "The season, balanced",
    body: "See who has played where across the season, and fix it before next week.",
    shownIn: "netball",
    image: `${SHOTS}/netball/stats.png`,
    imageAlt: "Netball season balance: everyone within a quarter of even, with minutes in attack, centre and defence",
    focus: "50% 4%",
  },
];
