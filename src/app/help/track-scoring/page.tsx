// Screenshots referenced on this page:
//   /help-screenshots/track-scoring-toggle.png
//   /help-screenshots/track-scoring-player-tile.png

import Link from "next/link";
import { HelpPage, HelpFigure, HelpCallout } from "@/components/help/HelpPage";

export const metadata = {
  title: "Track Scoring · Help · Siren",
  description: "The Track scoring toggle and what it unlocks.",
  alternates: { canonical: "/help/track-scoring" },
};

export default function TrackScoringPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Track scoring</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-dim">
        Siren can record which players score during a game. This is optional
        (rotations and fairness tracking work perfectly without it) but turning
        it on unlocks richer stats.
      </p>
      <p className="mt-2 text-sm text-ink-dim">
        Football games record both goals and behinds; netball games record
        goals only. The toggle behaves the same way for both — flip it on per
        game, and the live screen reveals the right scoring controls for your
        sport.
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Turning it on</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            Open the game detail page (from the{" "}
            <Link href="/help/games" className="font-medium underline">
              Games
            </Link>{" "}
            tab).
          </li>
          <li>
            Toggle <strong className="text-ink">Track scoring</strong> on.
          </li>
          <li>
            The setting is saved immediately. You can change it before or
            during the game.
          </li>
        </ol>

        <HelpFigure
          src="/help-screenshots/track-scoring-toggle.png"
          alt="The game detail page with the Track scoring toggle highlighted in the on position"
          caption="The Track scoring toggle on the game detail page."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">What it changes during the live game</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          With scoring enabled:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            Tapping a player on the playing area selects them and reveals the
            scoring action(s) — <strong className="text-ink">Goal</strong>{" "}
            (and <strong className="text-ink">Behind</strong> for football).
            For netball, only the GS and GA shooter positions are tappable for
            attribution.
          </li>
          <li>
            Each player&apos;s tile shows a small chip with their tally for
            the game.
          </li>
          <li>
            Opponent scoring buttons appear below the opponent name in the
            header — <strong className="text-ink">+G</strong> for goals (and{" "}
            <strong className="text-ink">+B</strong> for behinds in football).
          </li>
          <li>
            The scoreboard in the header updates in real time. Football
            displays the standard goals·behinds with total points; netball
            shows a single goals tally.
          </li>
          <li>
            An <strong className="text-ink">Undo</strong> toast appears for
            8 seconds after each score event so you can immediately correct a
            mistake.
          </li>
        </ul>

        <HelpFigure
          src="/help-screenshots/track-scoring-player-tile.png"
          alt="A player tile during a scored game showing a chip with the player's score tally"
          caption="When scoring is tracked, each player tile shows their current tally."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">What it unlocks in Stats</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Games with scoring tracked contribute data to the following{" "}
          <Link href="/help/stats" className="font-medium underline">
            Stats
          </Link>{" "}
          views:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Player stats table</strong>: scoring
            columns per player
          </li>
          <li>
            <strong className="text-ink">Winning combinations</strong>: which
            player groupings have the best win rate
          </li>
          <li>
            <strong className="text-ink">Player chemistry</strong>: how the
            team performs when specific pairs are on together
          </li>
          <li>
            <strong className="text-ink">Position fit</strong>: player
            effectiveness per position
          </li>
          <li>
            <strong className="text-ink">Quarter-by-quarter scoring</strong>:
            your scoring pattern across the game
          </li>
          <li>
            <strong className="text-ink">Top scorers</strong>: listed on the
            game detail page after the game
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">If you leave it off</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          All rotation and fairness features work exactly the same. Minutes
          equity, attendance, and player stats (excluding scores) are still
          recorded. The stats that depend on win/loss data won&apos;t populate
          for games where scoring wasn&apos;t tracked.
        </p>
        <HelpCallout type="note">
          You can mix scored and unscored games in the same season. Stats
          derived from scoring will only count the games where the toggle was
          on.
        </HelpCallout>
      </section>
    </HelpPage>
  );
}
