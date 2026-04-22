// Screenshots referenced on this page:
//   /help-screenshots/track-scoring-toggle.png
//   /help-screenshots/track-scoring-player-tile.png

import Link from "next/link";
import { HelpPage, HelpFigure, HelpCallout } from "@/components/help/HelpPage";

export const metadata = {
  title: "Track Scoring — Help — Siren Footy",
  description: "The Track goals & behinds toggle and what it unlocks.",
};

export default function TrackScoringPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Track goals &amp; behinds</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-dim">
        Siren Footy can record which players kick goals and behinds during a
        game. This is optional — rotations and fairness tracking work perfectly
        without it — but turning it on unlocks richer stats.
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
            Toggle <strong className="text-ink">Track goals &amp; behinds</strong> on.
          </li>
          <li>
            The setting is saved immediately — you can change it before or during
            the game.
          </li>
        </ol>

        <HelpFigure
          src="/help-screenshots/track-scoring-toggle.png"
          alt="The game detail page with the Track goals and behinds toggle highlighted in the on position"
          caption="The Track goals & behinds toggle on the game detail page."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">What it changes during the live game</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          With scoring enabled:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            Tapping a field player selects them and shows{" "}
            <strong className="text-ink">Goal</strong> and{" "}
            <strong className="text-ink">Behind</strong> action buttons.
          </li>
          <li>
            Each player&apos;s tile shows a small{" "}
            <strong className="text-ink">G·B</strong> chip with their tally for the
            game.
          </li>
          <li>
            Opponent scoring buttons (<strong className="text-ink">+G</strong> and{" "}
            <strong className="text-ink">+B</strong>) appear below the opponent name
            in the header.
          </li>
          <li>
            The scoreboard in the header updates in real time showing goals·behinds
            and total points for both teams.
          </li>
          <li>
            An <strong className="text-ink">Undo</strong> toast appears for 8 seconds
            after each score event so you can immediately correct a mistake.
          </li>
        </ul>

        <HelpFigure
          src="/help-screenshots/track-scoring-player-tile.png"
          alt="A player tile during a scored game showing a G·B chip with the player's goal and behind tally"
          caption="When scoring is tracked, each player tile shows their current G·B tally."
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
            <strong className="text-ink">Player stats table</strong> — goals and
            behinds columns per player
          </li>
          <li>
            <strong className="text-ink">Winning combinations</strong> — which
            player groupings have the best win rate
          </li>
          <li>
            <strong className="text-ink">Player chemistry</strong> — how the team
            performs when specific pairs are on together
          </li>
          <li>
            <strong className="text-ink">Position fit</strong> — player effectiveness
            per zone
          </li>
          <li>
            <strong className="text-ink">Quarter-by-quarter scoring</strong> — your
            scoring pattern across the game
          </li>
          <li>
            <strong className="text-ink">Goal kickers</strong> — listed on the game
            detail page after the game
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">If you leave it off</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          All rotation and fairness features work exactly the same. Minutes equity,
          attendance, and player stats (excluding goals/behinds) are still recorded.
          The stats that depend on win/loss data won&apos;t populate for games where
          scoring wasn&apos;t tracked.
        </p>
        <HelpCallout type="note">
          You can mix scored and unscored games in the same season. Stats derived
          from scoring will only count the games where the toggle was on.
        </HelpCallout>
      </section>
    </HelpPage>
  );
}
