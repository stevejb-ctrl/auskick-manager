import { HELP_PAGES } from "@/lib/help/pages";
import { sportPageCopy } from "@/lib/marketing/sportPages";
import { INDEXABLE_ROUTES } from "@/lib/public-routes";
import { MARKETING_SPORTS, sportPagePath } from "@/lib/sports/marketing-sports";
import {
  APP_STORE_SINCE,
  FEATURES,
  MAKER,
  PLATFORMS,
  PRICE,
  PRIVACY_LINE,
  SIREN_SPORTS,
  sirenOneLiner,
} from "@/lib/siren-facts";

// ─── /llms.txt ───────────────────────────────────────────────
// A plain-text summary of Siren for AI tools, in the llmstxt.org
// shape: a title, a one-line summary, then sections of links. No major
// engine says it reads the file (Google's AI optimisation guide says
// Search ignores it), so it's cheap and built from what's already
// here: the facts in src/lib/siren-facts.ts and the sitemap's pages in
// src/lib/public-routes.ts, so it can't fall behind either.

/** Titles and blurbs for the sitemap's pages outside the help hub. */
const PAGE_BLURBS: Record<string, { title: string; blurb: string }> = {
  "/": { title: "Home", blurb: "What Siren does, sport by sport." },
  "/demo": { title: "Try a demo game", blurb: "A sped-up junior game in any sport, with no sign-up." },
  "/why-siren": {
    title: "Why Siren",
    blurb: "Why fair game time means time in every position, not just minutes.",
  },
  "/contact": { title: "Contact", blurb: "How to reach the maker." },
  "/support": { title: "Support", blurb: "Common questions, and deleting an account." },
  "/privacy": { title: "Privacy policy", blurb: "What Siren collects and where it's stored." },
  "/terms": { title: "Terms of service", blurb: "The terms of use." },
};

/** Where each sitemap page goes in the file. */
const SECTIONS = [
  { heading: "Pages", paths: ["/", "/demo", "/why-siren"] },
  { heading: "Sport pages", paths: MARKETING_SPORTS.map(sportPagePath) },
  { heading: "Help", paths: INDEXABLE_ROUTES.map((r) => r.path).filter((p) => p.startsWith("/help")) },
  { heading: "Optional", paths: ["/support", "/contact", "/privacy", "/terms"] },
];

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function linkLine(siteUrl: string, path: string): string {
  const help = HELP_PAGES.find((p) => p.href === path);
  const sport = MARKETING_SPORTS.find((s) => sportPagePath(s) === path);
  const page = help
    ? { title: help.title, blurb: help.description }
    : sport
      ? {
          title: `Junior ${SIREN_SPORTS.find((s) => s.id === sport.sport)?.name ?? sport.label}`,
          blurb: sportPageCopy(sport.sport).tileLine,
        }
      : PAGE_BLURBS[path];
  if (!page) throw new Error(`llms.txt: no title for ${path}`);
  return `- [${page.title}](${siteUrl}${path}): ${page.blurb}`;
}

/** The file, for the brand site at `siteUrl` (no trailing slash). */
export function buildLlmsTxt(siteUrl: string): string {
  const sports = SIREN_SPORTS.map((s) => {
    const name = s.name.charAt(0).toUpperCase() + s.name.slice(1);
    return `- ${name}${s.beta ? " (beta)" : ""}`;
  });
  const lines = [
    "# Siren",
    "",
    `> ${sirenOneLiner()}`,
    "",
    `${PRICE.line}. Siren is ${PLATFORMS.sentence}. It's made by ${MAKER.name}, a ${MAKER.role} in ${MAKER.country}, and has been on the App Store since ${formatDate(APP_STORE_SINCE)}. ${PRIVACY_LINE}`,
    "",
    "## Sports",
    "",
    ...sports,
    "",
    "## What it does",
    "",
    ...FEATURES.map((f) => `- ${f}`),
  ];
  for (const { heading, paths } of SECTIONS) {
    lines.push("", `## ${heading}`, "", ...paths.map((p) => linkLine(siteUrl, p)));
    if (heading === "Pages") {
      lines.push(`- [iPhone and iPad app](${PLATFORMS.ios.url}): The App Store listing.`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Every path the file links, so a test can check it covers the sitemap. */
export const LLMS_TXT_PATHS: readonly string[] = SECTIONS.flatMap((s) => s.paths);
