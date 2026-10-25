import type { MetadataRoute } from "next";
import { MARKETING_SPORTS, sportPagePath } from "@/lib/sports/marketing-sports";

// ─── Public routes: what's indexed, what's private ───────────
// One list feeds sitemap.ts, robots.ts and the Google Analytics gate
// (src/lib/analytics/ga-routes.ts), so the three can't drift apart.
// src/lib/__tests__/publicRoutes.test.ts walks src/app and fails if a
// page is in none of the lists below, so a new page has to pick one.

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

/** When the sport pages last changed. */
const SPORT_PAGES_LAST_MODIFIED = "2026-10-25";

export interface IndexableRoute {
  path: string;
  priority: number;
  changeFrequency: ChangeFrequency;
  /** When the page's content last changed (YYYY-MM-DD). Bump it with
   *  a substantive content change so search engines see lastmod move. */
  lastModified: string;
}

/** Public pages we want found. Each is a sitemap entry. */
export const INDEXABLE_ROUTES: readonly IndexableRoute[] = [
  { path: "/", priority: 1.0, changeFrequency: "monthly", lastModified: "2026-10-25" },
  { path: "/demo", priority: 0.9, changeFrequency: "monthly", lastModified: "2026-10-25" },
  { path: "/why-siren", priority: 0.8, changeFrequency: "monthly", lastModified: "2026-10-21" },

  // One page per sport (/netball, /afl, …), from the marketing sports.
  ...MARKETING_SPORTS.map((sport) => ({
    path: sportPagePath(sport),
    priority: 0.9,
    changeFrequency: "monthly" as const,
    lastModified: SPORT_PAGES_LAST_MODIFIED,
  })),

  // Help hub
  { path: "/help", priority: 0.8, changeFrequency: "monthly", lastModified: "2026-10-21" },
  { path: "/help/getting-started", priority: 0.7, changeFrequency: "monthly", lastModified: "2026-10-21" },
  { path: "/help/teams", priority: 0.6, changeFrequency: "monthly", lastModified: "2026-10-14" },
  { path: "/help/squads", priority: 0.6, changeFrequency: "monthly", lastModified: "2026-10-14" },
  { path: "/help/games", priority: 0.6, changeFrequency: "monthly", lastModified: "2026-10-14" },
  { path: "/help/rotations", priority: 0.6, changeFrequency: "monthly", lastModified: "2026-10-18" },
  { path: "/help/live-game", priority: 0.6, changeFrequency: "monthly", lastModified: "2026-10-18" },
  { path: "/help/track-scoring", priority: 0.6, changeFrequency: "monthly", lastModified: "2026-10-18" },
  { path: "/help/stats", priority: 0.6, changeFrequency: "monthly", lastModified: "2026-10-14" },
  { path: "/help/faq", priority: 0.7, changeFrequency: "monthly", lastModified: "2026-10-21" },
  { path: "/help/troubleshooting", priority: 0.6, changeFrequency: "monthly", lastModified: "2026-10-21" },

  // Transactional landing pages — useful for brand search.
  { path: "/contact", priority: 0.5, changeFrequency: "yearly", lastModified: "2026-05-16" },
  { path: "/support", priority: 0.5, changeFrequency: "yearly", lastModified: "2026-05-16" },

  // Legal
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly", lastModified: "2026-10-22" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly", lastModified: "2026-04-22" },
];

/**
 * Public pages left out of the sitemap: crawlable, not worth
 * indexing. /login is a form with little to read. /signup redirects to
 * /login under the unified email-first flow, so listing both is two
 * URLs for one page.
 */
export const UNLISTED_PUBLIC_PATHS: readonly string[] = [
  "/login",
  "/signup",
  "/forgot-password",
  "/offline",
];

/**
 * Path prefixes crawlers must stay out of: the signed-in app,
 * tokenised links (/run/<token> gives live control of a game,
 * /join/<token> is a team invite, /availability/<token> marks a
 * game's kids In or Out), auth flows and the API. robots.ts
 * disallows each one, and matching works the same way robots.txt
 * does — a plain prefix.
 */
/**
 * Public files for crawlers and link previews: no session needed, and
 * not pages, so not in the sitemap. The middleware lets them through;
 * anything not public in this file goes to /login.
 */
export const PUBLIC_FILE_PATHS: readonly string[] = [
  "/sitemap.xml",
  "/robots.txt",
  // A plain-text map of Siren for AI tools (src/app/llms.txt/route.ts).
  "/llms.txt",
  // Link-preview image (src/app/opengraph-image.tsx). WhatsApp,
  // Facebook and Slack fetch it with no session.
  "/opengraph-image",
];

/**
 * Unlisted pages Google Analytics still measures, beside the sitemap's
 * (src/lib/analytics/ga-routes.ts). Sign-in is where a marketing visit
 * ends, so the funnel needs it.
 */
export const UNLISTED_ANALYTICS_PATHS: readonly string[] = ["/login"];

export const PRIVATE_PATH_PREFIXES: readonly string[] = [
  "/api/",
  "/auth/",
  "/account",
  "/availability/",
  "/admin",
  "/dashboard",
  "/join/",
  "/join-team",
  "/run/",
  "/teams/",
  "/welcome",
  "/reset",
];

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
