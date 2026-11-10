import {
  MARKETING_SPORTS,
  marketingSportBySlug,
  type MarketingSportConfig,
} from "@/lib/sports/marketing-sports";
import type { SportId } from "@/lib/sports/types";

// ─── Sport help hubs: /help/<slug> ───────────────────────────
// One hub per sport, at the sport's marketing slug (/help/netball,
// /help/rugby-league, …). Pure data, so the help nav (a client
// component), the sitemap and the JSON-LD can all read it. The pages'
// words live in src/components/help/sport/.

/** A section of a sport hub: its anchor and its heading. */
export interface SportHelpSection {
  id: string;
  title: string;
}

export interface SportHelp {
  sport: MarketingSportConfig;
  /** The hub's path: /help/netball. */
  href: string;
  /** The sport in a sentence: "netball", "rugby league", "AFL". */
  name: string;
  /** The hub's title, as the nav and the breadcrumbs show it. */
  title: string;
  /** Meta description and the help index card's blurb. */
  description: string;
  /** The hub's sections, in page order (the nav lists them). */
  sections: SportHelpSection[];
}

/** The sections every hub has, in this order, with sport words where they differ. */
function sections(words: {
  positions: string;
  extra?: SportHelpSection;
  breaks?: string;
}): SportHelpSection[] {
  return [
    { id: "how-it-runs", title: "How Siren runs it" },
    { id: "live", title: "The live game" },
    { id: "positions", title: words.positions },
    { id: "scoring", title: "Scoring" },
    { id: "subs", title: "Subs" },
    ...(words.extra ? [words.extra] : []),
    { id: "breaks", title: words.breaks ?? "Breaks and full time" },
    { id: "rules", title: "Age groups and junior rules" },
    { id: "faq", title: "Questions" },
  ];
}

const HUBS: Record<MarketingSportConfig["id"], Omit<SportHelp, "sport" | "href">> = {
  netball: {
    name: "netball",
    title: "Netball",
    description:
      "Running a junior netball game in Siren: the seven bibs and the thirds, subs at the quarter break, goals from GS and GA, Set and Go formats, and How we play.",
    sections: sections({ positions: "Bibs and rotations", breaks: "Quarter breaks and full time" }),
  },
  afl: {
    name: "AFL",
    title: "AFL",
    description:
      "Running a junior AFL game in Siren: forward, centre and back lines, rolling subs on a timer, goals and behinds, quarter breaks, big fields and the junior rules by age.",
    sections: sections({ positions: "Lines and rotations", breaks: "Quarter breaks and full time" }),
  },
  league: {
    name: "rugby league",
    title: "Rugby league",
    description:
      "Running a junior rugby league game in Siren: forwards and backs, rolling subs, FR and DH vests, kickoff and goal-kick turns, unbroken periods, tries and conversions by age.",
    sections: sections({
      positions: "Forwards, backs and rotations",
      extra: { id: "junior-laws", title: "Vests, kicks and unbroken periods" },
    }),
  },
  football: {
    name: "football (soccer)",
    title: "Football (soccer)",
    description:
      "Running a junior football (soccer) game in Siren: keeper turns, defence, midfield and attack, rolling subs, goals, half-time and the MiniRoos formats by age.",
    sections: sections({
      positions: "Lines, shapes and rotations",
      extra: { id: "keeper", title: "The keeper" },
      breaks: "Half-time and full time",
    }),
  },
  basketball: {
    name: "basketball",
    title: "Basketball",
    description:
      "Running a junior basketball game in Siren: guards and forwards, subs through the table at a dead ball, +1, +2 and +3, fouls and foul-outs, halves or quarters by age.",
    sections: sections({
      positions: "Positions and rotations",
      extra: { id: "fouls", title: "Fouls" },
    }),
  },
  union: {
    name: "rugby union",
    title: "Rugby union",
    description:
      "Running a junior rugby union game in Siren: forwards and backs, numbered positions, front-row picks, rolling subs, tries, conversions, penalty and drop goals by age.",
    sections: sections({ positions: "Forwards, backs and positions", breaks: "Half-time and full time" }),
  },
  touch: {
    name: "touch football",
    title: "Touch football",
    description:
      "Running a junior touch football game in Siren: middles, links and wings, subs through the interchange, tries, mixed teams and the boys' cap, halves or one period.",
    sections: sections({
      positions: "Lanes and rotations",
      extra: { id: "mixed", title: "Mixed teams" },
    }),
  },
  oztag: {
    name: "Oztag",
    title: "Oztag",
    description:
      "Running a junior Oztag game in Siren: subs from the sub box, minutes evened out, tries and the girl's try in mixed games, the boys' cap, and the formats by age.",
    sections: sections({
      positions: "Lanes and rotations",
      extra: { id: "mixed", title: "Mixed teams and the girl's try" },
    }),
  },
  hockey: {
    name: "hockey",
    title: "Hockey",
    description:
      "Running a junior hockey game in Siren: keeper changes at the break, defenders, midfield and strikers, rolling subs, goals, halves or quarters, and the formats by age.",
    sections: sections({
      positions: "Lines, shapes and rotations",
      extra: { id: "keeper", title: "The keeper" },
    }),
  },
  futsal: {
    name: "futsal",
    title: "Futsal",
    description:
      "Running a junior futsal game in Siren: 5 a side with a keeper, flying subs, the back, wings and front, keeper swaps, goals, half-time and the formats by age.",
    sections: sections({
      positions: "Back, wings and front",
      extra: { id: "keeper", title: "The keeper" },
      breaks: "Half-time and full time",
    }),
  },
};

/** Every sport hub, in the site's sport order (popularity). */
export const SPORT_HELP: readonly SportHelp[] = MARKETING_SPORTS.map((sport) => ({
  sport,
  href: `/help/${sport.slug}`,
  ...HUBS[sport.id],
}));

/** The hub at /help/<slug>, if any. */
export function sportHelpBySlug(slug: string): SportHelp | undefined {
  const sport = marketingSportBySlug(slug);
  return sport ? SPORT_HELP.find((h) => h.sport.id === sport.id) : undefined;
}

/** The hub whose path is `pathname` (no anchor), if any. */
export function sportHelpByPath(pathname: string): SportHelp | undefined {
  return SPORT_HELP.find((h) => h.href === pathname);
}

/** A sport's hub path, for a team's sport: /help/rugby-league. */
export function sportHelpPath(sport: SportId): string {
  const hub = SPORT_HELP.find((h) => h.sport.sport === sport);
  return hub?.href ?? "/help";
}
