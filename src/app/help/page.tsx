// Screenshots referenced on this page:
//   /help-screenshots/overview-landing.png

import Link from "next/link";
import { HelpFigure } from "@/components/help/HelpPage";
import { HELP_PAGES } from "@/lib/help/pages";
import { SPORT_HELP } from "@/lib/help/sports";
import { sportsInASentence } from "@/lib/sports/words";

export const metadata = {
  title: "Help · Siren",
  description:
    "How to use Siren, the game-day app for junior sport coaches: set up a team and squad, run a live game with fair rotations and subs, keep score and read season stats. Plus a help page for each of the ten sports, the FAQ and troubleshooting.",
  alternates: { canonical: "/help" },
};

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 text-ink-mute" aria-hidden>
      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function HelpOverviewPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink">Siren Help</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-dim">
          Siren helps coaches run their junior {sportsInASentence("or")} season, from setting up squads and scheduling
          games, to running rotations live on the sideline and reviewing fairness stats after the game.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          Teams, squads, games, the live screen and stats work the same in every sport: they&apos;re the topics below.
          Your sport&apos;s own field, scoring, subs and junior rules have a page each.
        </p>
      </div>

      <div className="rounded-lg border border-brand-200 bg-brand-50 px-5 py-4">
        <p className="text-sm font-semibold text-brand-700">New to Siren?</p>
        <p className="mt-1 text-sm text-brand-600">
          Start with the Getting Started guide. It walks you through signing in, creating your team, adding players,
          and running your first game.
        </p>
        <Link
          href="/help/getting-started"
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Start here →
        </Link>
      </div>

      <section aria-labelledby="your-sport">
        <h2 id="your-sport" className="mb-1 text-lg font-semibold text-ink">
          Your sport
        </h2>
        <p className="mb-3 text-sm text-ink-dim">How Siren runs each sport: its live game, scoring, subs, breaks and junior rules.</p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="help-sport-grid">
          {SPORT_HELP.map((h) => (
            <li key={h.href}>
              <Link
                href={h.href}
                className="flex min-h-[56px] items-center gap-3 rounded-lg border border-hairline bg-surface px-3 py-3 shadow-card transition-colors duration-fast hover:bg-surface-alt"
              >
                <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: h.sport.accent }} />
                <span className="font-semibold text-ink">{h.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <HelpFigure
        src="/help-screenshots/overview-landing.png"
        alt="Siren dashboard showing your team cards and recent games"
        caption="The dashboard, your home screen once signed in."
      />

      <section aria-labelledby="every-sport">
        <h2 id="every-sport" className="mb-3 text-lg font-semibold text-ink">
          Help for every sport
        </h2>
        <ul
          className="divide-y divide-hairline rounded-lg border border-hairline bg-surface shadow-card"
          data-testid="help-topic-list"
        >
          {HELP_PAGES.filter((p) => p.slug !== "overview").map((page) => (
            <li key={page.slug}>
              <Link
                href={page.href}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-fast hover:bg-surface-alt"
              >
                <div>
                  <p className="font-medium text-ink">{page.title}</p>
                  <p className="text-sm text-ink-dim">{page.description}</p>
                </div>
                <Chevron />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
