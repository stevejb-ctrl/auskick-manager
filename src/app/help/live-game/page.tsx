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
  title: "Live Game — Help — Siren Footy",
  description: "Running a game: the on-field view, scoring, subs, and quarter breaks.",
};

export default function LiveGamePage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Live Game</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-dim">
        The live game screen is your sideline companion. It shows the current field
        layout, a countdown clock, suggested rotations, and a scoreboard — all in
        one view. Here&apos;s how to use it.
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Before the game: the lineup picker</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          After marking availability, you&apos;re taken to the lineup picker. The app
          auto-suggests a starting lineup based on each player&apos;s cumulative zone
          minutes from previous games this season.
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            Review the suggested lineup. Players are placed across{" "}
            <strong className="text-ink">FORWARD</strong>,{" "}
            <strong className="text-ink">H-FWD</strong>,{" "}
            <strong className="text-ink">CENTRE</strong>,{" "}
            <strong className="text-ink">H-BCK</strong>,{" "}
            <strong className="text-ink">BACK</strong>, and{" "}
            <strong className="text-ink">Bench</strong>.
          </li>
          <li>
            Tap any two players to swap them — even between zones or to and from the
            bench.
          </li>
          <li>
            When you&apos;re happy, tap{" "}
            <strong className="text-ink">Start Q1</strong>.
          </li>
        </ol>

        <HelpFigure
          src="/help-screenshots/live-game-lineup-picker.png"
          alt="The lineup picker showing players arranged across zones with a Start Q1 button"
          caption="Review and adjust the auto-suggested starting lineup before tapping Start Q1."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">The on-field view</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Once the quarter starts you see:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Header</strong> — your team&apos;s score on the
            left, a dark clock pill in the centre, opponent score on the right. Tap
            the clock pill to pause or resume.
          </li>
          <li>
            <strong className="text-ink">SwapCard</strong> — a dark card above the
            field showing suggested rotations and a countdown ring. Tap it to expand
            the details. See{" "}
            <Link href="/help/rotations" className="font-medium underline">
              Rotations
            </Link>{" "}
            for how suggestions work.
          </li>
          <li>
            <strong className="text-ink">Field</strong> — five zone rows (FORWARD at
            the top, BACK at the bottom) showing each player as a tile with their
            jersey number and first name.
          </li>
          <li>
            <strong className="text-ink">Bench</strong> — players not currently on
            the field, shown below the field.
          </li>
        </ul>

        <HelpFigure
          src="/help-screenshots/live-game-field.png"
          alt="The live game field view showing players in Forward, H-Fwd, Centre, H-Back, and Back zones with the scoreboard header at the top"
          caption="The on-field view during a live quarter. Zones run top to bottom: FORWARD to BACK."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Scoring goals and behinds</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          This flow requires the{" "}
          <Link href="/help/track-scoring" className="font-medium underline">
            Track goals &amp; behinds
          </Link>{" "}
          toggle to be on.
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            Tap a player on the field to select them (they get a highlighted ring).
          </li>
          <li>
            Action buttons appear — tap <strong className="text-ink">Goal</strong> or{" "}
            <strong className="text-ink">Behind</strong>.
          </li>
          <li>
            A toast notification confirms the score. Tap{" "}
            <strong className="text-ink">Undo</strong> in the toast within 8 seconds
            if you made a mistake.
          </li>
          <li>
            For opponent scores, use the small{" "}
            <strong className="text-ink">+G</strong> and{" "}
            <strong className="text-ink">+B</strong> buttons below the opponent name
            in the header.
          </li>
        </ol>

        <HelpFigure
          src="/help-screenshots/live-game-scoring.png"
          alt="A selected player tile with Goal and Behind action buttons visible"
          caption="Tap a player to select them, then tap Goal or Behind."
        />

        <HelpCallout type="tip">
          Scores are shown as goals·behinds with the total points (goals × 6 +
          behinds) in large numerals, just like a real scoreboard. A goal is worth
          6 points; a behind is worth 1 point.
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Making a manual substitution</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          To manually swap a player without waiting for a suggestion:
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-dim">
          <li>Tap a player on the field. They get a selection ring.</li>
          <li>Tap a player on the bench.</li>
          <li>
            A confirmation dialog shows the pair. Tap{" "}
            <strong className="text-ink">Confirm</strong> to commit or tap outside
            (or the backdrop) to cancel.
          </li>
        </ol>
        <HelpCallout type="tip">
          Tapping the backdrop or pressing Escape cancels a pending selection without
          making a swap.
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">The Sub Due modal</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          When the sub interval timer reaches zero, the SwapCard pulses with a{" "}
          <strong className="text-ink">NOW</strong> countdown and expands automatically
          to show the suggested swaps. The sub interval is set on your team settings
          page.
        </p>
        <p className="mt-2 text-sm text-ink-dim">
          You can also tap <strong className="text-ink">Do</strong> next to any
          individual pair to apply just that one swap, or tap{" "}
          <strong className="text-ink">Do all N swaps</strong> to apply everything at
          once. After any swap is committed, the card collapses automatically and the
          timer resets.
        </p>

        <HelpFigure
          src="/help-screenshots/live-game-sub-due.png"
          alt="The sub due swap card expanded showing swap pairs with Do buttons and a Do all swaps button"
          caption="The Sub Due state: the card expands with suggested pairs and a Do all swaps button."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Player actions: injury and loan</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Long-press any player tile to open the <strong className="text-ink">Player actions</strong> sheet:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Lock to field</strong> — the player is never
            subbed out. Good for a player who needs extra game time.
          </li>
          <li>
            <strong className="text-ink">Lock to zone</strong> — the player can rotate
            off temporarily but always returns to the same zone.
          </li>
          <li>
            <strong className="text-ink">Mark injured</strong> — moves the player to
            the bench and excludes them from rotation suggestions. Their tile shows
            an <strong className="text-ink">INJ</strong> badge. Tap{" "}
            <strong className="text-ink">Mark recovered</strong> to return them.
          </li>
          <li>
            <strong className="text-ink">Lend to opposition</strong> — marks the player
            as lent (common in U10s when numbers are uneven). Shows a{" "}
            <strong className="text-ink">LENT</strong> badge. Loan minutes are tracked
            separately. Tap <strong className="text-ink">Bring back</strong> to return
            them.
          </li>
        </ul>
        <HelpCallout type="note">
          Injured and lent players are parked on the bench and excluded from the
          rotation algorithm. They will not appear in the lineup when a new quarter
          starts.
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Ending a quarter</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            Tap <strong className="text-ink">End Q{"{n}"}</strong> when the quarter
            siren sounds. A confirmation dialog appears.
          </li>
          <li>Tap <strong className="text-ink">End quarter</strong> to confirm.</li>
          <li>
            The quarter-break screen appears for Q1–Q3. For Q4, the game is marked
            complete.
          </li>
        </ol>
        <p className="mt-2 text-sm text-ink-dim">
          When the clock runs past the set quarter duration, the time display turns
          orange to flag overtime — but it keeps counting up so you can see total
          elapsed time.
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
          <strong className="text-ink">Set zones for Q{"{n}"}</strong> screen. This
          is your chance to adjust who plays where in the next quarter.
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            A <strong className="text-ink">Fairness</strong> score (0–100) shows how
            evenly zone minutes are distributed across the squad so far. 100 is
            perfectly even; aim for a high score by the end of the season, not every
            game.
          </li>
          <li>
            The <strong className="text-ink">✓ Using suggested reshuffle</strong>{" "}
            button is on by default — the algorithm has already placed players in the
            fairest possible zones. Tap it to toggle back to last quarter&apos;s
            positions if you prefer.
          </li>
          <li>
            Tap any two players to swap them — even across zones or to and from the
            bench.
          </li>
          <li>
            <strong className="text-ink">INJ</strong> and{" "}
            <strong className="text-ink">LENT</strong> players are greyed out and
            cannot be moved onto the field.
          </li>
        </ul>
        <p className="mt-3 text-sm text-ink-dim">
          When you&apos;re ready, tap <strong className="text-ink">Start Q{"{n}"}</strong>.
        </p>

        <HelpFigure
          src="/help-screenshots/live-game-quarter-break.png"
          alt="The quarter break screen showing players grouped by zone with a fairness score and suggested reshuffle button"
          caption="The quarter break screen. Review zones, make any manual tweaks, then tap Start."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">The walkthrough</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          The first time you open a live game, a walkthrough modal guides you through
          the key features: zones, bench, making a sub, reading the swap suggestions,
          and the sub due alert. You can skip it or step through it — it only shows
          once per team.
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
