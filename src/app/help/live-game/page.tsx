// Screenshots referenced on this page:
//   /help-screenshots/live-game-lineup-picker.png
//   /help-screenshots/live-game-field.png
//   /help-screenshots/live-game-scoring.png
//   /help-screenshots/live-game-sub-due.png
//   /help-screenshots/live-game-quarter-end.png
//   /help-screenshots/live-game-quarter-break.png

import Link from "next/link";
import { HelpPage, HelpFigure, HelpCallout } from "@/components/help/HelpPage";

export const metadata = {
  title: "Live Game · Help · Siren",
  description:
    "Running a game: the on-area view, scoring, subs, and quarter breaks.",
  alternates: { canonical: "/help/live-game" },
};

export default function LiveGamePage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Live game</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-dim">
        The live game screen is your sideline companion. It shows the current
        lineup laid out on the playing area, a countdown clock, suggested
        rotations (when applicable), and a scoreboard, all in one view.
        Here&apos;s how to use it.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-dim">
        The exact controls vary slightly by sport. Football&apos;s rolling-sub
        model surfaces a sub timer and SwapCard mid-quarter; netball&apos;s
        period-break model shows the next-quarter reshuffle at every break
        instead. Both share the same lineup picker, scoring controls, and
        player-actions sheet.
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Before the game: the lineup picker</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          After marking availability, you&apos;re taken to the lineup picker.
          The app auto-suggests a starting lineup based on each player&apos;s
          cumulative position minutes from previous games this season.
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            Review the suggested lineup. Players are placed across your
            sport&apos;s position layout — football zones (FORWARD / CENTRE /
            BACK and the half-zones), or netball positions (GS / GA / WA / C
            / WD / GD / GK), with the rest on the{" "}
            <strong className="text-ink">Bench</strong>.
          </li>
          <li>
            Tap any two players to swap them — even between positions or to
            and from the bench.
          </li>
          <li>
            When you&apos;re happy, tap{" "}
            <strong className="text-ink">Start Q1</strong>.
          </li>
        </ol>

        <HelpFigure
          src="/help-screenshots/live-game-lineup-picker.png"
          alt="The lineup picker showing players arranged across positions with a Start Q1 button"
          caption="Review and adjust the auto-suggested starting lineup before tapping Start Q1."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">The on-area view</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Once the quarter starts you see:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Header</strong>: your team&apos;s
            score on the left, a dark clock pill in the centre, opponent
            score on the right. Tap the clock pill to pause or resume.
          </li>
          <li>
            <strong className="text-ink">SwapCard</strong> (football only): a
            dark card above the playing area showing suggested rotations and
            a countdown ring. Tap it to expand the details. See{" "}
            <Link href="/help/rotations" className="font-medium underline">
              Rotations
            </Link>{" "}
            for how suggestions work.
          </li>
          <li>
            <strong className="text-ink">Playing area</strong>: position rows
            running top to bottom (FORWARD / BACK for football; ATTACK /
            CENTRE / DEFENCE thirds for netball), each showing players as
            tiles with their first name and position label.
          </li>
          <li>
            <strong className="text-ink">Bench</strong>: players not currently
            on the area, shown below.
          </li>
        </ul>

        <HelpFigure
          src="/help-screenshots/live-game-field.png"
          alt="The live game view showing players in their position rows with the scoreboard header at the top"
          caption="The on-area view during a live quarter."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Recording scores</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          This flow requires the{" "}
          <Link href="/help/track-scoring" className="font-medium underline">
            Track scoring
          </Link>{" "}
          toggle to be on.
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            Tap a scoring player on the playing area to select them. For
            football this is any player; for netball it&apos;s only GS or GA
            (the shooter positions).
          </li>
          <li>
            Tap the scoring action that appears —{" "}
            <strong className="text-ink">Goal</strong> (and{" "}
            <strong className="text-ink">Behind</strong> for football).
          </li>
          <li>
            A toast notification confirms the score. Tap{" "}
            <strong className="text-ink">Undo</strong> in the toast within
            8 seconds if you made a mistake.
          </li>
          <li>
            For opponent scores, use the small{" "}
            <strong className="text-ink">+G</strong> button (and{" "}
            <strong className="text-ink">+B</strong> for football) below the
            opponent name in the header.
          </li>
        </ol>

        <HelpFigure
          src="/help-screenshots/live-game-scoring.png"
          alt="A selected player tile with scoring action buttons visible"
          caption="Tap a player to select them, then tap the scoring action."
        />

        <HelpCallout type="tip">
          Football scores show as goals·behinds with the total points (goals
          × 6 + behinds) in large numerals, like a real scoreboard. Netball
          shows a single goals tally — every goal is worth one point.
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Making a manual substitution</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          To manually swap a player without waiting for a suggestion:
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-dim">
          <li>Tap a player on the playing area. They get a selection ring.</li>
          <li>Tap a player on the bench.</li>
          <li>
            A confirmation dialog shows the pair. Tap{" "}
            <strong className="text-ink">Confirm</strong> to commit or tap
            outside (or the backdrop) to cancel.
          </li>
        </ol>
        <HelpCallout type="tip">
          Tapping the backdrop or pressing Escape cancels a pending selection
          without making a swap.
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">The Sub Due modal (rolling subs)</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          For football&apos;s rolling-sub model, when the sub interval timer
          reaches zero the SwapCard pulses with a{" "}
          <strong className="text-ink">NOW</strong> countdown and expands
          automatically to show the suggested swaps. The sub interval is set
          on your team settings page.
        </p>
        <p className="mt-2 text-sm text-ink-dim">
          You can tap <strong className="text-ink">Do</strong> next to any
          individual pair to apply just that one swap, or tap{" "}
          <strong className="text-ink">Do all N swaps</strong> to apply
          everything at once. After any swap is committed, the card collapses
          automatically and the timer resets.
        </p>
        <p className="mt-2 text-sm text-ink-dim">
          Netball doesn&apos;t use a rolling sub timer — rotations happen at
          the quarter break instead (see below).
        </p>

        <HelpFigure
          src="/help-screenshots/live-game-sub-due.png"
          alt="The sub due swap card expanded showing swap pairs with Do buttons and a Do all swaps button"
          caption="The Sub Due state: the card expands with suggested pairs and a Do all swaps button."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Player actions: lock, injury, loan</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Long-press any player tile to open the{" "}
          <strong className="text-ink">Player actions</strong> sheet:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Lock to area</strong> (football only):
            the player is never subbed out. Good for a player who needs extra
            game time.
          </li>
          <li>
            <strong className="text-ink">Lock to position</strong>: the
            player can rotate off temporarily but always returns to the same
            position. For netball this presents as &quot;Keep at{" "}
            <em>position</em> next break&quot;.
          </li>
          <li>
            <strong className="text-ink">Mark injured</strong>: moves the
            player to the bench and excludes them from rotation suggestions.
            Their tile shows an <strong className="text-ink">INJ</strong>{" "}
            badge. Tap <strong className="text-ink">Mark recovered</strong>{" "}
            to return them.
          </li>
          <li>
            <strong className="text-ink">Lend to opposition</strong>: marks
            the player as lent (common in junior teams when numbers are
            uneven). Shows a <strong className="text-ink">LENT</strong>{" "}
            badge. Loan minutes are tracked separately. Tap{" "}
            <strong className="text-ink">Bring back</strong> to return them.
          </li>
        </ul>
        <HelpCallout type="note">
          Injured and lent players are parked on the bench and excluded from
          the rotation algorithm. They will not appear in the lineup when a
          new quarter starts.
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Ending a quarter</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            Tap <strong className="text-ink">End Q{"{n}"}</strong> when the
            umpire&apos;s siren or whistle sounds. A confirmation dialog
            appears.
          </li>
          <li>Tap <strong className="text-ink">End quarter</strong> to confirm.</li>
          <li>
            The quarter-break screen appears for Q1–Q3. For Q4, the game is
            marked complete.
          </li>
        </ol>
        <p className="mt-2 text-sm text-ink-dim">
          When the clock runs past the set quarter duration, the time display
          turns orange to flag overtime, but it keeps counting up so you can
          see total elapsed time.
        </p>

        <HelpFigure
          src="/help-screenshots/live-game-quarter-end.png"
          alt="The quarter end confirmation dialog asking to confirm ending the current quarter"
          caption="Confirm to end the quarter and move to the break screen."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Quarter breaks</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Between quarters, the app shows a{" "}
          <strong className="text-ink">Set positions for Q{"{n}"}</strong>{" "}
          screen. This is your chance to adjust who plays where in the next
          quarter. For netball this is the primary moment of substitution; for
          football it&apos;s an optional reshuffle on top of the rolling subs
          you made during the quarter.
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            A <strong className="text-ink">Fairness</strong> score (0–100)
            shows how evenly time is distributed across the squad so far. 100
            is perfectly even; aim for a high score by the end of the season,
            not every game.
          </li>
          <li>
            The <strong className="text-ink">✓ Using suggested reshuffle</strong>{" "}
            button is on by default. The algorithm has already placed players
            in the fairest possible positions. Tap it to toggle back to last
            quarter&apos;s positions if you prefer.
          </li>
          <li>
            Tap any two players to swap them — even across positions or to and
            from the bench.
          </li>
          <li>
            <strong className="text-ink">INJ</strong> and{" "}
            <strong className="text-ink">LENT</strong> players are greyed out
            and cannot be moved onto the playing area.
          </li>
        </ul>
        <p className="mt-3 text-sm text-ink-dim">
          When you&apos;re ready, tap{" "}
          <strong className="text-ink">Start Q{"{n}"}</strong>.
        </p>

        <HelpFigure
          src="/help-screenshots/live-game-quarter-break.png"
          alt="The quarter break screen showing players grouped by position with a fairness score and suggested reshuffle button"
          caption="The quarter break screen. Review positions, make any manual tweaks, then tap Start."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">The walkthrough</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          The first time you open a live game, a walkthrough modal guides you
          through the key features for your sport: positions, bench, making a
          sub, reading swap suggestions, and the alerts that apply. You can
          skip it or step through it; it only shows once per team.
        </p>
      </section>

      <div className="mt-8 rounded-lg border border-hairline bg-surface-alt px-4 py-3 text-sm text-ink-dim">
        <p>
          <strong className="text-ink">Related topics:</strong>{" "}
          <Link href="/help/rotations" className="font-medium text-brand-600 hover:underline">
            Rotations
          </Link>{" "}
          ·{" "}
          <Link href="/help/track-scoring" className="font-medium text-brand-600 hover:underline">
            Track Scoring
          </Link>{" "}
          ·{" "}
          <Link href="/help/stats" className="font-medium text-brand-600 hover:underline">
            Stats
          </Link>
        </p>
      </div>
    </HelpPage>
  );
}
