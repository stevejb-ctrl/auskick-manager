export interface HelpPage {
  slug: string;
  title: string;
  description: string;
  href: string;
}

// Sport-neutral copy: this registry is the single source of truth for help-page
// titles and descriptions across every brand (sirenfooty.com.au and
// sirennetball.com.au). Avoid sport-specific wording — pages themselves cover
// both football and netball mechanics in unified prose.
export const HELP_PAGES: HelpPage[] = [
  {
    slug: "overview",
    title: "Overview",
    description: "Introduction to Siren and quick links to key topics.",
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
    description: "Creating and managing teams, age groups, admin roles, and settings.",
    href: "/help/teams",
  },
  {
    slug: "squads",
    title: "Squads",
    description: "Adding players, editing details, managing availability.",
    href: "/help/squads",
  },
  {
    slug: "games",
    title: "Games",
    description: "Creating games, editing details, and tracking game status.",
    href: "/help/games",
  },
  {
    slug: "live-game",
    title: "Live Game",
    description: "Running a game: the on-area view, scoring, subs, and quarter breaks.",
    href: "/help/live-game",
  },
  {
    slug: "rotations",
    title: "Rotations",
    description: "How suggested rotations work, badges, position colours, and locks.",
    href: "/help/rotations",
  },
  {
    slug: "stats",
    title: "Stats",
    description: "Per-player stats, minutes equity, combinations, chemistry, and more.",
    href: "/help/stats",
  },
  {
    slug: "track-scoring",
    title: "Track Scoring",
    description: "The Track scoring toggle and what it unlocks.",
    href: "/help/track-scoring",
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
