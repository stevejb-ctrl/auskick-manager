// Screenshots referenced on this page:
//   /help-screenshots/rotations-swap-card.png
//   /help-screenshots/rotations-player-tile.png
//   /help-screenshots/rotations-zone-bar.png

import Link from "next/link";
import { HelpPage, HelpFigure, HelpCallout } from "@/components/help/HelpPage";

export const metadata = {
  title: "Rotations · Help · Siren",
  description:
    "How suggested rotations work, badges, position colours, and locks.",
  alternates: { canonical: "/help/rotations" },
};

export default function RotationsPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Rotations</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-dim">
        The rotation engine watches how much time every player has spent in
        each position, both in the current game and across the whole season,
        and suggests swaps that balance things out. You never have to do the
        maths yourself.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-dim">
        How rotations are <em>applied</em> depends on your sport. Football
        teams rotate continuously: the app prompts a swap each time the sub
        timer fires. Netball teams rotate at quarter breaks: the app suggests
        a fresh lineup at every break, with optional mid-quarter subs if
        you&apos;d rather not wait. The fairness algorithm is the same — only
        the moment of action differs.
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">How the algorithm works</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Whenever the app needs to suggest a lineup, it ranks all possible
          placements by how much they would improve overall fairness,
          considering:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Season position minutes</strong>:
            time in each position area across all completed games this year
          </li>
          <li>
            <strong className="text-ink">Current-game minutes</strong>: time
            accrued so far in this game
          </li>
          <li>
            <strong className="text-ink">Recent arrival pinning</strong>:
            players who only just came on are not immediately swapped back
            off (football only — pinned for ~3 minutes during rolling subs)
          </li>
          <li>
            <strong className="text-ink">Player locks</strong>: always-on
            locked players never leave; position-locked players stay in their
            assigned position
          </li>
          <li>
            <strong className="text-ink">Player chips</strong>: optional
            coloured tags that either spread chip-mates across zones (mix
            older with younger) or keep them together (a kid who needs to
            stay paired with familiar teammates). See the{" "}
            <Link href="/help/squads" className="font-medium underline">
              Squads
            </Link>{" "}
            help page for setup.
          </li>
        </ul>
        <p className="mt-3 text-sm text-ink-dim">
          The result is a small set of swap pairs (usually one or two at a
          time during football&apos;s rolling subs) or a complete next-quarter
          lineup (for netball at the break).
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">The SwapCard (rolling subs)</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          On football&apos;s rolling-sub model, suggested swaps appear in the
          dark <strong className="text-ink">SwapCard</strong> above the
          playing area. It has two states:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Collapsed</strong>: shows a sparkle
            icon (or countdown ring), the number of suggested swaps, and a
            one-line summary (e.g. <em>Alex→Sam · Jordan→Blake</em>). Tap to
            expand.
          </li>
          <li>
            <strong className="text-ink">Expanded</strong>: shows each pair
            in a row with the position label colour-coded, a{" "}
            <strong className="text-ink">Do</strong> button per pair, and a{" "}
            <strong className="text-ink">Do all N swaps</strong> button at
            the bottom.
          </li>
        </ul>
        <p className="mt-3 text-sm text-ink-dim">
          After you commit a swap (via <strong className="text-ink">Do</strong>{" "}
          or <strong className="text-ink">Do all</strong>), the card collapses
          automatically and the sub timer resets.
        </p>

        <HelpFigure
          src="/help-screenshots/rotations-swap-card.png"
          alt="The SwapCard expanded showing two swap pairs with position labels, Do buttons, and a Do all 2 swaps button"
          caption="The SwapCard expanded. Position labels are colour-coded — see the colour key below."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">The countdown ring and NOW badge</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          On rolling subs, the SwapCard header includes a circular progress
          ring that fills as the sub interval counts down. When it reaches
          zero:
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
          You can make a swap at any time, not just when the timer fires.
          Tapping any on-area + bench player pair opens the confirmation
          dialog and resets the timer on commit.
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Quarter-break rotation (netball)</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          For netball, the rotation engine runs at the break instead. When a
          quarter ends, the app shows a <strong className="text-ink">Set
          positions for Q{"{n}"}</strong> screen with the suggested next
          lineup already in place. The reshuffle is weighted by who&apos;s
          played least, who hasn&apos;t had a turn at their preferred
          position, and the rules of play (which positions each player can
          enter). Tap two players to swap them, or accept the suggestion and
          start the quarter.
        </p>
        <p className="mt-2 text-sm text-ink-dim">
          Netball teams that prefer to sub mid-quarter can do that too — the
          app supports both models.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Player tiles and badges</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Each player tile shows:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Jersey number</strong> in a small
            chip (football only — netball squads typically don&apos;t use
            them)
          </li>
          <li>
            <strong className="text-ink">First name</strong> and last initial
          </li>
          <li>
            <strong className="text-ink">Position label</strong> at the top
            (e.g. FWD / CEN / BCK for football, GS / GA / WA / C / WD / GD /
            GK for netball)
          </li>
          <li>
            A <strong className="text-ink">time bar</strong> at the bottom: a
            thin horizontal bar colour-coded by area showing how much time
            this player has spent where
          </li>
        </ul>
        <p className="mt-3 text-sm text-ink-dim">
          When a player is part of a pending swap suggestion (rolling subs):
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-dim">
          <li>
            A <strong className="text-ink">↓</strong> badge marks the player
            coming off
          </li>
          <li>
            A <strong className="text-ink">↑</strong> badge marks the player
            coming on from the bench
          </li>
          <li>Both tiles show a pair number so you can match them up</li>
        </ul>

        <HelpFigure
          src="/help-screenshots/rotations-player-tile.png"
          alt="A player tile showing jersey number, name, position label, up/down badges, and a time bar at the bottom"
          caption="Player tile anatomy: number (where used), position label, swap badges, and time bar."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Position colour coding</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Colours are consistent across every position indicator in the app.
          The exact palette differs by sport (each is tuned to the sport&apos;s
          identity), but within a sport the same colour means the same
          position area everywhere — the live tile, the time bar, the stats
          cards.
        </p>

        <HelpFigure
          src="/help-screenshots/rotations-zone-bar.png"
          alt="Time bars on several player tiles showing the per-position colour coding"
          caption="Time bars use the same colours across the playing area and the Stats tab."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Player locks</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Long-press any player to open the{" "}
          <strong className="text-ink">Player actions</strong> sheet. Lock
          options are available there:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Always-on lock</strong>: the player
            is excluded from rotation suggestions and never leaves the playing
            area for the rest of the game (football&apos;s &quot;lock to
            field&quot;).
          </li>
          <li>
            <strong className="text-ink">Position lock</strong>: the player
            can rotate off temporarily but the algorithm always returns them
            to the same position. For netball this presents as &quot;Keep at{" "}
            <em>position</em> next break&quot;.
          </li>
        </ul>
        <HelpCallout type="note">
          Locked players are pinned in the quarter-break reshuffle too. The
          algorithm keeps them in their assigned position.
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">The fairness score</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          The quarter-break screen shows a{" "}
          <strong className="text-ink">Fairness</strong> score from 0 to 100.
          It measures how evenly time is spread across the whole squad. 100 is
          perfectly equal; lower means some kids have had noticeably more or
          less time in certain positions.
        </p>
        <p className="mt-2 text-sm text-ink-dim">
          Aim for a high score by the end of the season, not every single
          game. Individual games often sit lower; that&apos;s normal and
          expected.
        </p>
        <p className="mt-2 text-sm text-ink-dim">
          The{" "}
          <Link href="/help/stats" className="font-medium text-brand-600 hover:underline">
            Stats tab
          </Link>{" "}
          shows per-player position breakdowns for the full season.
        </p>
      </section>
    </HelpPage>
  );
}
