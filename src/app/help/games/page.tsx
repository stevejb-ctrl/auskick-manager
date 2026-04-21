// Screenshots referenced on this page:
//   /help-screenshots/games-list.png
//   /help-screenshots/games-create.png
//   /help-screenshots/games-detail.png

import Link from "next/link";
import { HelpPage, HelpFigure, HelpCallout } from "@/components/help/HelpPage";

export const metadata = {
  title: "Games — Help — Siren",
  description: "Creating games, editing details, and tracking game status.",
};

export default function GamesPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Games</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-dim">
        Each team has a games list where you can schedule upcoming matches, open
        the live game view on the day, and review past results.
      </p>

      <HelpFigure
        src="/help-screenshots/games-list.png"
        alt="The games list showing upcoming and completed games with round numbers and opponent names"
        caption="The Games tab lists all scheduled and completed matches."
      />

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Creating a game</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-dim">
          <li>Open your team and tap the <strong className="text-ink">Games</strong> tab.</li>
          <li>Tap <strong className="text-ink">New game</strong>.</li>
          <li>
            Fill in:
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-ink">Opponent</strong> — the other team&apos;s name
              </li>
              <li>
                <strong className="text-ink">Round</strong> — round number for the season
              </li>
              <li>
                <strong className="text-ink">Date and time</strong>
              </li>
              <li>
                <strong className="text-ink">Venue</strong> (optional)
              </li>
            </ul>
          </li>
          <li>
            Tap <strong className="text-ink">Save</strong>. The game appears as{" "}
            <em>Upcoming</em>.
          </li>
        </ol>

        <HelpFigure
          src="/help-screenshots/games-create.png"
          alt="The create game form with opponent, round, date, time, and venue fields"
          caption="Fill in game details and tap Save."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Game statuses</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Upcoming</strong> — game is scheduled but
            not yet started. Tap <strong className="text-ink">Start game</strong> to
            begin on game day.
          </li>
          <li>
            <strong className="text-ink">In progress</strong> — the game has been
            started. Tap <strong className="text-ink">Open live game</strong> to
            return to the live view.
          </li>
          <li>
            <strong className="text-ink">Completed</strong> — all four quarters have
            ended. Stats are now available in the Stats tab.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">The game detail page</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Tap any game in the list to open its detail page. From here you can:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-dim">
          <li>See the final or current score</li>
          <li>View goal kickers (if scoring was tracked)</li>
          <li>Start or re-enter the live game view</li>
          <li>Edit game details (opponent, round, date, etc.)</li>
          <li>Toggle the <strong className="text-ink">Track goals &amp; behinds</strong> setting</li>
        </ul>

        <HelpFigure
          src="/help-screenshots/games-detail.png"
          alt="The game detail page showing score, round, opponent, date, and action buttons"
          caption="The game detail page. Tap Start game or Open live game to jump into the live view."
        />

        <HelpCallout type="tip">
          The <strong>Track goals &amp; behinds</strong> toggle on the game detail page
          controls whether player goal tallies appear during the live game. See{" "}
          <Link href="/help/track-scoring" className="font-medium underline">
            Track Scoring
          </Link>{" "}
          for what this unlocks.
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Editing a game</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Open the game detail page and tap <strong className="text-ink">Edit</strong>. You
          can change the opponent name, round, date, time, and venue at any time —
          even after a game has started.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Deleting a game</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Open the game detail page, tap <strong className="text-ink">Edit</strong>, then
          scroll to <strong className="text-ink">Delete game</strong>. This removes all
          events recorded for that game and cannot be undone.
        </p>
        <HelpCallout type="warning">
          Deleting a game removes all recorded rotations, scores, and stats for it. Season
          fairness scores will be recalculated without that game.
        </HelpCallout>
      </section>
    </HelpPage>
  );
}
