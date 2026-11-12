// Screenshots referenced on this page:
//   /help-screenshots/stats-overview.png
//   /help-screenshots/stats-minutes-equity.png
//   /help-screenshots/stats-combinations.png

import Link from "next/link";
import { HelpPage, HelpFigure, HelpCallout } from "@/components/help/HelpPage";

export const metadata = {
  title: "Stats · Help · Siren",
  description:
    "Per-player stats and season balance in every sport, and the cards each adds: AFL scoring, netball chemistry, rugby league laws, keepers, fouls and lanes.",
  alternates: { canonical: "/help/stats" },
};

export default function StatsPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Stats</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-dim">
        The Stats tab builds up over the course of your season. It draws on every
        finished game to show how fairly the squad is being used, who&apos;s
        scoring, and much more. Season balance and player stats are in every
        sport; the other cards differ by sport, showing what matters for its
        game.
      </p>
      <p className="mt-2 text-sm text-ink-dim">
        Stats only appear for <strong className="text-ink">finished</strong> games:
        every quarter or half played out, then{" "}
        <strong className="text-ink">Finish game</strong> tapped in the
        full-time review. In-progress game data is excluded.
      </p>

      <HelpFigure
        src="/help-screenshots/stats-overview.png"
        alt="The AFL Stats tab overview showing several stat cards"
        caption="The Stats tab (AFL shown). Cards fill in as you finish more games."
      />

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Player stats</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Every player&apos;s totals across the season:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-dim">
          <li>
            AFL: games played, total and average minutes, share of team time,
            goals and behinds, and a Fwd / Cen / Back split
          </li>
          <li>
            Netball: games, minutes, the Attack / Centre / Defence split with
            per-position percentages (e.g. GS 40% · GA 20%), and goals
          </li>
          <li>
            League: games played, tries and conversions (made / attempted).
            Under 6 to Under 12 also show turns in the FR and DH vests,
            kickoffs taken, and games where the unbroken-period rule was met;
            from Under 13 these are replaced by penalty goals and field goals.
            A row of team totals sits above the table: games, tries and
            points, conversions made and points conceded. Union shows the
            same, with penalty and drop goals
          </li>
          <li>
            Football, futsal and hockey: games, minutes, goals and time in goal,
            under totals for the season (games, goals, conceded, won · drawn ·
            lost)
          </li>
          <li>Basketball: the same totals, with points, fouls and guard / forward time</li>
          <li>Touch and Oztag: the same totals, with tries and time in each lane</li>
        </ul>
        <p className="mt-3 text-sm text-ink-dim">
          <strong className="text-ink">Needs:</strong> At least one finished
          game. Scoring columns only populate if{" "}
          <Link href="/help/track-scoring" className="font-medium underline">
            Track scoring
          </Link>{" "}
          was on.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Season balance</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Every sport has this card. It shows each player&apos;s minutes this
          season in each line or position, in your sport&apos;s words (AFL
          Fwd / Cen / Back; netball thirds or bibs; forwards and backs; keeper
          and lines; lanes) — and tints any spot where a kid is owed at least
          a quarter (or a half, in games of halves). The line at the
          top counts how many kids are within a quarter (or half) of even.
          Sort by <strong className="text-ink">Biggest gap</strong> to see
          who&apos;s owed the most.
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          <strong className="text-ink">Needs:</strong> At least one finished
          game.
        </p>

        <HelpFigure
          src="/help-screenshots/stats-minutes-equity.png"
          alt="The AFL Season balance card: kids owed time, how many are within a quarter of even, and each kid's minutes forward, centre and back"
          caption="Season balance (AFL shown). Tinted spots are where a kid is owed time."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Unbroken-period shortfalls (rugby league)</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          League Under 6 to Under 12 only. If any player has finished a game
          without banking the unbroken quarters or half that Junior Laws §6
          asks for, a panel lists them with how many games they missed out, so
          you can plan rotations so every player hits the minimum.
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          <strong className="text-ink">Needs:</strong> At least one finished
          game.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Player chemistry (netball)</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          The top pairs of players who&apos;ve spent the most minutes in the
          same third together this season. Handy for spotting duos who end up
          together week after week.
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          <strong className="text-ink">Needs:</strong> Finished games where
          players have shared a third for at least a quarter.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Position fit (AFL)</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Rates each player&apos;s effectiveness in each line, based on how
          the team scores while they&apos;re there. Use this to identify
          which players thrive where.
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          <strong className="text-ink">Needs:</strong> Multiple finished games
          with scoring enabled.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Head-to-head by opponent (AFL and netball)</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Your record against each team you&apos;ve played this season: games,
          wins, draws, losses, and scores for and against.
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          <strong className="text-ink">Needs:</strong> Finished games with
          scoring tracked.
        </p>

        <HelpFigure
          src="/help-screenshots/stats-combinations.png"
          alt="The AFL Head-to-head by opponent card, with wins, losses and scores against three teams, and the Quarter-by-quarter scoring card"
          caption="Head-to-head and Quarter-by-quarter scoring (AFL)."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Quarter-by-quarter scoring (AFL)</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Average goals scored and conceded in each quarter across the
          season. Useful for identifying patterns. For example, if you
          consistently leak goals in Q3.
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          <strong className="text-ink">Needs:</strong> Finished games with
          scoring tracked.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Attendance (AFL and netball)</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          A table showing each player&apos;s attendance record across the season:
          how many of the finished games they played, as a number and a
          percentage.
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          <strong className="text-ink">Needs:</strong> At least one finished
          game with availability marked.
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
        Stats that depend on scoring (AFL position fit and quarter-by-quarter
        scoring, head-to-head, and the scoring columns in every sport) need{" "}
        <Link href="/help/track-scoring" className="font-medium underline">
          scoring
        </Link>{" "}
        to be on for those games.
      </HelpCallout>
    </HelpPage>
  );
}
