// Screenshots referenced on this page:
//   /help-screenshots/rotations-swap-card.png
//   /help-screenshots/rotations-player-tile.png
//   /help-screenshots/rotations-zone-bar.png

import Link from "next/link";
import { HelpPage, HelpFigure, HelpCallout } from "@/components/help/HelpPage";

export const metadata = {
  title: "Rotations · Help · Siren Footy",
  description:
    "How suggested rotations work, pair badges, zone colours, and player locks.",
};

export default function RotationsPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Rotations</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-dim">
        The rotation engine watches how much time every player has spent in each
        zone, both in the current game and across the whole season, and suggests
        swaps that balance things out. You never have to do the maths yourself.
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">How the algorithm works</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Every time the clock ticks, the app tracks which zone each player is in.
          When the sub timer is due, it ranks all possible field ↔ bench swaps by
          how much they would improve overall fairness, considering:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Season zone minutes</strong>:time in each
            zone across all completed games this year
          </li>
          <li>
            <strong className="text-ink">Current-game minutes</strong>:time accrued
            so far in this game
          </li>
          <li>
            <strong className="text-ink">Recent arrival pinning</strong>:players
            who only just came on are not immediately swapped back off (pinned for
            ~3 minutes)
          </li>
          <li>
            <strong className="text-ink">Player locks</strong>:field-locked players
            never leave; zone-locked players stay in their assigned zone
          </li>
        </ul>
        <p className="mt-3 text-sm text-ink-dim">
          The algorithm produces a set of swap pairs (typically one or two at a
          time) targeting the zone where the imbalance is greatest.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">The SwapCard</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Suggested swaps appear in the dark{" "}
          <strong className="text-ink">SwapCard</strong> above the field. It has two
          states:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Collapsed</strong>:shows a sparkle icon (or
            countdown ring), the number of suggested swaps, and a one-line summary
            (e.g. <em>Alex→Sam · Jordan→Blake</em>). Tap to expand.
          </li>
          <li>
            <strong className="text-ink">Expanded</strong>:shows each pair in a row
            with the zone label colour-coded, a <strong className="text-ink">Do</strong>{" "}
            button per pair, and a <strong className="text-ink">Do all N swaps</strong>{" "}
            button at the bottom.
          </li>
        </ul>
        <p className="mt-3 text-sm text-ink-dim">
          After you commit a swap (via <strong className="text-ink">Do</strong> or{" "}
          <strong className="text-ink">Do all</strong>), the card collapses
          automatically and the sub timer resets.
        </p>

        <HelpFigure
          src="/help-screenshots/rotations-swap-card.png"
          alt="The SwapCard expanded showing two swap pairs with zone labels, Do buttons, and a Do all 2 swaps button"
          caption="The SwapCard expanded. Zone labels are colour-coded: orange = Forward, purple = Centre, blue = Back."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">The countdown ring and NOW badge</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          The SwapCard header includes a circular progress ring that fills as the
          sub interval counts down. When it reaches zero:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-dim">
          <li>
            The ring turns orange and the counter displays{" "}
            <strong className="text-ink">NOW</strong> with a pulse animation.
          </li>
          <li>The card gets an orange ring highlight.</li>
          <li>The card expands automatically to show the suggestions.</li>
        </ul>
        <HelpCallout type="tip">
          You can make a swap at any time, not just when the timer fires. Tapping
          any field + bench player pair opens the confirmation dialog and resets the
          timer on commit.
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Player tiles and badges</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Each player tile on the field shows:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Jersey number</strong> in a small green
            circle
          </li>
          <li>
            <strong className="text-ink">First name</strong> and last initial
          </li>
          <li>
            <strong className="text-ink">Zone label</strong> (FWD / H-FWD / CEN /
            H-BCK / BCK) in small caps at the top
          </li>
          <li>
            A <strong className="text-ink">zone-minute bar</strong> at the bottom:
            a thin horizontal bar colour-coded by zone showing how much time this
            player has spent where (blue = back, purple = centre, orange = forward)
          </li>
        </ul>
        <p className="mt-3 text-sm text-ink-dim">
          When a player is part of a pending swap suggestion:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-dim">
          <li>
            A <strong className="text-ink">↓</strong> badge marks the player coming
            off the field
          </li>
          <li>
            A <strong className="text-ink">↑</strong> badge marks the player coming
            on from the bench
          </li>
          <li>Both tiles show a pair number so you can match them up</li>
        </ul>

        <HelpFigure
          src="/help-screenshots/rotations-player-tile.png"
          alt="A player tile showing jersey number, name, zone label, up/down badges, and a zone-minute bar at the bottom"
          caption="Player tile anatomy: jersey number, zone label, swap badges, and zone-minute bar."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Zone colour coding</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Colours are consistent across every zone indicator in the app:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-dim">
          <li>
            <span className="font-semibold text-zone-f">Orange</span>:Forward /
            H-Forward
          </li>
          <li>
            <span className="font-semibold text-zone-c">Purple</span>:Centre
          </li>
          <li>
            <span className="font-semibold text-zone-b">Blue</span>:Back / H-Back
          </li>
        </ul>

        <HelpFigure
          src="/help-screenshots/rotations-zone-bar.png"
          alt="Zone-minute bars on several player tiles showing the orange, purple, and blue colour coding"
          caption="Zone bars use the same colours across the field and the Stats tab."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Player locks</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Long-press any player to open the{" "}
          <strong className="text-ink">Player actions</strong> sheet. Two lock options
          are available:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Lock to field</strong>:the player is
            excluded from all rotation suggestions and never leaves the field for the
            rest of the game.
          </li>
          <li>
            <strong className="text-ink">Lock to zone</strong>:the player can rotate
            off temporarily (e.g. for water) but the algorithm will always put them
            back into the same zone. Tap <strong className="text-ink">Unlock player</strong>{" "}
            to remove the lock.
          </li>
        </ul>
        <HelpCallout type="note">
          Field-locked and zone-locked players are pinned in the quarter-break
          reshuffle too. The algorithm keeps them in their current zone.
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">The fairness score</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          The quarter-break screen shows a <strong className="text-ink">Fairness</strong>{" "}
          score from 0 to 100. It measures how evenly zone minutes are spread across
          the whole squad. 100 is perfectly equal; lower means some kids have had
          noticeably more or less time in certain positions.
        </p>
        <p className="mt-2 text-sm text-ink-dim">
          Aim for a high score by the end of the season, not every single game.
          Individual games often sit lower; that&apos;s normal and expected.
        </p>
        <p className="mt-2 text-sm text-ink-dim">
          The{" "}
          <Link href="/help/stats" className="font-medium text-brand-600 hover:underline">
            Stats tab
          </Link>{" "}
          shows per-player zone minute breakdowns for the full season.
        </p>
      </section>
    </HelpPage>
  );
}
