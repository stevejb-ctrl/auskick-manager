// Screenshots referenced on this page:
//   /help-screenshots/stats-overview.png
//   /help-screenshots/stats-minutes-equity.png
//   /help-screenshots/stats-combinations.png

import Link from "next/link";
import { HelpPage, HelpFigure, HelpCallout } from "@/components/help/HelpPage";

export const metadata = {
  title: "Stats · Help · Siren Footy",
  description:
    "Per-player stats, minutes equity, combinations, chemistry, and more.",
  alternates: { canonical: "/help/stats" },
};

export default function StatsPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Stats</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-dim">
        The Stats tab builds up over the course of your season. It draws on every
        completed game to show how fairly the squad is being used, which player
        combinations win, and much more.
      </p>
      <p className="mt-2 text-sm text-ink-dim">
        Stats only appear for <strong className="text-ink">completed</strong> games
        (all four quarters ended). In-progress game data is excluded.
      </p>

      <HelpFigure
        src="/help-screenshots/stats-overview.png"
        alt="The Stats tab overview showing multiple stat cards including minutes equity and player stats table"
        caption="The Stats tab. Cards fill in as you complete more games."
      />

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Player stats</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          A table showing every player&apos;s totals across the season:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-dim">
          <li>Total games played</li>
          <li>Total field minutes (excluding bench time)</li>
          <li>Minutes per zone (FORWARD, H-FWD, CENTRE, H-BCK, BACK)</li>
          <li>Goals and behinds (if scoring was tracked)</li>
        </ul>
        <p className="mt-3 text-sm text-ink-dim">
          <strong className="text-ink">Needs:</strong> At least one completed game.
          Scoring columns only populate if{" "}
          <Link href="/help/track-scoring" className="font-medium underline">
            Track goals &amp; behinds
          </Link>{" "}
          was on.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Minutes equity</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          A visual breakdown of how total field minutes are distributed across the
          squad. An even spread means every player is getting similar court time.
          The coloured bars match the zone colour coding (orange = forward, purple =
          centre, blue = back).
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          <strong className="text-ink">Needs:</strong> At least one completed game
          with rotation data (games that were started and ended properly).
        </p>

        <HelpFigure
          src="/help-screenshots/stats-minutes-equity.png"
          alt="The minutes equity chart showing stacked zone-minute bars for each player"
          caption="Minutes equity: each bar shows a player's zone breakdown for the season."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Winning combinations</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Shows which player groupings have the best win rate when on the field
          together in the same zone. Combinations are ranked by zone and filtered
          to pairs/trios that have played enough together to be meaningful.
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          <strong className="text-ink">Needs:</strong> Multiple completed games with
          scoring tracked, so the app has enough win/loss data per combination.
        </p>

        <HelpFigure
          src="/help-screenshots/stats-combinations.png"
          alt="The winning combinations card showing player pairs ranked by win rate per zone"
          caption="Winning combinations by zone: who plays well together in each position."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Player chemistry</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Measures how often two players are on the field at the same time and how
          the team performs during those stints. High chemistry scores suggest a
          pairing that works well together.
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          <strong className="text-ink">Needs:</strong> Multiple games with rotation
          and scoring data.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Position fit</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Rates each player&apos;s effectiveness in each zone, based on how the team
          performs while they&apos;re there. Use this to identify which players
          thrive in which positions.
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          <strong className="text-ink">Needs:</strong> Multiple completed games with
          scoring enabled.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Head-to-head</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Compare any two players directly: their zone minute split, goals, behinds,
          and win rate when on the field together vs. apart.
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          <strong className="text-ink">Needs:</strong> At least two completed games
          involving both players.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Quarter-by-quarter scoring</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          A breakdown of how your team&apos;s scoring changed across each quarter of
          the season. Useful for identifying patterns. For example, if you
          consistently leak goals in Q3.
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          <strong className="text-ink">Needs:</strong> Completed games with scoring
          tracked.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Attendance</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          A table showing each player&apos;s attendance record across the season:
          how many games they were marked available and how many they missed.
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          <strong className="text-ink">Needs:</strong> At least one completed game
          with availability marked.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Season selector</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          At the top of the Stats tab, a season selector lets you switch between
          years if you have game data from multiple seasons.
        </p>
      </section>

      <HelpCallout type="tip">
        Stats that depend on scoring (combinations, chemistry, position fit,
        quarter scoring) require the{" "}
        <Link href="/help/track-scoring" className="font-medium underline">
          Track goals &amp; behinds
        </Link>{" "}
        toggle to be on for those games.
      </HelpCallout>
    </HelpPage>
  );
}
