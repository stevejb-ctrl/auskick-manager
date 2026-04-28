// Screenshots referenced on this page:
//   /help-screenshots/overview-landing.png

import Link from "next/link";
import { HelpFigure } from "@/components/help/HelpPage";
import { HELP_PAGES } from "@/lib/help/pages";

export const metadata = {
  title: "Help · Siren Footy",
  description: "Guides and documentation for Siren Footy.",
};

const QUICK_LINKS = [
  { slug: "getting-started", emoji: "🚀" },
  { slug: "live-game", emoji: "🏈" },
  { slug: "rotations", emoji: "🔄" },
  { slug: "stats", emoji: "📊" },
  { slug: "faq", emoji: "❓" },
];

export default function HelpOverviewPage() {
  const quickPages = QUICK_LINKS.map(({ slug, emoji }) => {
    const page = HELP_PAGES.find((p) => p.slug === slug)!;
    return { ...page, emoji };
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink">Siren Footy Help</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-dim">
          Siren Footy helps coaches run their junior AFL season, from setting up
          squads and scheduling games, to running rotations live on the sideline and
          reviewing fairness stats after the game. Use the topics on the left (or the
          menu above on mobile) to find what you need.
        </p>
      </div>

      {/* CTA */}
      <div className="rounded-lg border border-brand-200 bg-brand-50 px-5 py-4">
        <p className="text-sm font-semibold text-brand-700">New to Siren Footy?</p>
        <p className="mt-1 text-sm text-brand-600">
          Start with the Getting Started guide. It walks you through signing in,
          creating your team, adding players, and running your first game.
        </p>
        <Link
          href="/help/getting-started"
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Start here →
        </Link>
      </div>

      <HelpFigure
        src="/help-screenshots/overview-landing.png"
        alt="Siren Footy dashboard showing your team cards and recent games"
        caption="The dashboard, your home screen once signed in."
      />

      {/* Quick links */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-ink">Most-used topics</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {quickPages.map((page) => (
            <li key={page.slug}>
              <Link
                href={page.href}
                className="flex items-start gap-3 rounded-lg border border-hairline bg-surface px-4 py-3 shadow-card transition-colors duration-fast hover:bg-surface-alt"
              >
                <span className="text-xl">{page.emoji}</span>
                <div>
                  <p className="font-semibold text-ink">{page.title}</p>
                  <p className="mt-0.5 text-sm text-ink-dim">{page.description}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* All topics */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-ink">All topics</h2>
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface shadow-card">
          {HELP_PAGES.filter((p) => p.slug !== "overview").map((page) => (
            <li key={page.slug}>
              <Link
                href={page.href}
                className="flex items-center justify-between px-4 py-3 transition-colors duration-fast hover:bg-surface-alt"
              >
                <div>
                  <p className="font-medium text-ink">{page.title}</p>
                  <p className="text-sm text-ink-dim">{page.description}</p>
                </div>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="shrink-0 text-ink-mute"
                  aria-hidden
                >
                  <path
                    d="M9 18l6-6-6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
