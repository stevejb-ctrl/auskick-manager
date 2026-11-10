import { SPORT_HELP } from "@/lib/help/sports";

export interface HelpPage {
  slug: string;
  title: string;
  description: string;
  href: string;
}

// The global help topics: the features every sport shares. Sport-neutral
// copy on every brand (sirenfooty.com.au, sirennetball.com.au, …); each
// sport's own mechanics live in its hub (src/lib/help/sports.ts).
export const HELP_PAGES: HelpPage[] = [
  {
    slug: "overview",
    title: "Overview",
    description: "Introduction to Siren, the topics every sport shares, and a help page for each sport.",
    href: "/help",
  },
  {
    slug: "getting-started",
    title: "Getting Started",
    description: "Sign in, create your first team, add players, and schedule a game.",
    href: "/help/getting-started",
  },
  {
    slug: "teams",
    title: "Teams",
    description: "Creating a team, coaches, managers and parents, invites, the team code, and team settings.",
    href: "/help/teams",
  },
  {
    slug: "squads",
    title: "Squads",
    description: "Adding players, editing details, roles, and marking who's in for a game.",
    href: "/help/squads",
  },
  {
    slug: "games",
    title: "Games",
    description: "Creating and importing games, the game-day link, asking parents who's in, and game status.",
    href: "/help/games",
  },
  {
    slug: "live-game",
    title: "The Live Screen",
    description: "The live screen in every sport: the clock, pausing, undo, fixing scores, the ⋯ menu, late arrivals, injuries and loans.",
    href: "/help/live-game",
  },
  {
    slug: "breaks",
    title: "Breaks",
    description: "The break between quarters or halves: the next lineup, Suggested, Rotate, Repeat and Manual, and starting again.",
    href: "/help/breaks",
  },
  {
    slug: "rotations",
    title: "Rotations",
    description: "How Siren plans fair rotations: the next sub, How we play, season balance, game-time minimums and keeping a player on.",
    href: "/help/rotations",
  },
  {
    slug: "track-scoring",
    title: "Keeping Score",
    description: "Turning scoring on or off, recording and fixing scores, and what it adds to Stats.",
    href: "/help/track-scoring",
  },
  {
    slug: "stats",
    title: "Stats",
    description: "Season balance, per-player stats, the game summary, and the extra cards each sport has.",
    href: "/help/stats",
  },
  {
    slug: "account",
    title: "Your Account",
    description: "Your name, light or dark theme, animations, leaving a team, and deleting your account.",
    href: "/help/account",
  },
  {
    slug: "faq",
    title: "FAQ",
    description: "Quick answers to the most common questions.",
    href: "/help/faq",
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    description: "Common issues and how to fix them.",
    href: "/help/troubleshooting",
  },
];

/**
 * Any help page by its path: a global topic or a sport hub. The title
 * and blurb the breadcrumbs, the article JSON-LD and llms.txt use.
 */
export function helpPageByPath(pathname: string): HelpPage | undefined {
  const global = HELP_PAGES.find((p) => p.href === pathname);
  if (global) return global;
  const hub = SPORT_HELP.find((h) => h.href === pathname);
  return hub
    ? { slug: hub.sport.slug, title: hub.title, description: hub.description, href: hub.href }
    : undefined;
}

/** Every help page's path: the global topics, then the sport hubs. */
export const ALL_HELP_PATHS: readonly string[] = [
  ...HELP_PAGES.map((p) => p.href),
  ...SPORT_HELP.map((h) => h.href),
];
