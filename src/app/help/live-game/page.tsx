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
    "Running a game: the on-area view, scoring, subs, and the breaks between quarters or halves.",
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
        The exact controls vary by sport. AFL, league, union, football
        (soccer) and basketball use rolling subs, so a sub timer and a swap card suggest who
        comes on during play. Netball subs at the breaks, so it shows the
        next-quarter reshuffle at every break instead. League also tracks its
        junior laws: FR and DH vests, goal-kick turns and kickoff turns; union
        has none of them. Football keeps its keeper in goal for the whole
        half: at half-time Siren plans the next half, starting with who takes
        the keeper top, and <strong className="text-ink">Replace keeper</strong>{" "}
        (long-press the keeper) changes it mid-half. Basketball subs at a dead
        ball through the table, tracks each kid&apos;s fouls (five and
        they&apos;re out), and its clock waits at 0:00 for the real hooter,
        since the stadium clock stops in the last minutes. Every sport has a lineup
        picker, scoring buttons and a long-press player-actions sheet.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-dim">
        Futsal runs on football&apos;s live screen, drawn on a court, with
        futsal&apos;s words: the back, the wings and the front. Its keeper
        can be swapped mid-half, as in football.
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Before the game: the lineup picker</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          After marking availability, you&apos;re taken to the lineup picker.
          The app auto-suggests a starting lineup based on how much time each
          player has had in each spot in previous games this season.
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            Review the suggested lineup. Players are placed across your
            sport&apos;s layout — AFL lines (FORWARD / CENTRE / BACK), netball
            positions (GS / GA / WA / C / WD / GD / GK), or league Forwards
            and Backs — with the rest on the{" "}
            <strong className="text-ink">Bench</strong>.
          </li>
          <li>
            Tap any two players to swap them — even between positions or to
            and from the bench.
          </li>
          <li>
            League from Under 8: long-press a player on the field and tap{" "}
            <strong className="text-ink">Make First Receiver</strong> (or{" "}
            <strong className="text-ink">Make Dummy Half</strong> from Under
            9) to pick who wears the vest first. The{" "}
            <strong className="text-ink">Vest rotation plan</strong> fills in
            the later periods for you.
          </li>
          <li>
            When you&apos;re happy, tap{" "}
            <strong className="text-ink">Start Q1</strong>. League teams from
            Under 10 play halves, so their button reads{" "}
            <strong className="text-ink">Start H1</strong>.
          </li>
        </ol>

        <HelpFigure
          src="/help-screenshots/live-game-lineup-picker.png"
          alt="An AFL lineup with players arranged across the field and the bench below"
          caption="Review and adjust the auto-suggested starting lineup before you start the game."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">The on-area view</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Once the first quarter or half starts you see:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Scoreboard</strong>: pinned to the
            bottom of the screen. Your team&apos;s score is on the left, a
            dark clock pill in the centre, and the opponent&apos;s score on
            the right. Tap the clock to pause, resume or end the quarter (or
            half) early.
          </li>
          <li>
            <strong className="text-ink">Swap card</strong> (AFL and league):
            a dark card above the playing area showing suggested rotations
            and a countdown ring. Tap it to expand the details. See{" "}
            <Link href="/help/rotations" className="font-medium underline">
              Rotations
            </Link>{" "}
            for how suggestions work.
          </li>
          <li>
            <strong className="text-ink">Playing area</strong>: AFL shows
            FORWARD at the top, CENTRE in the middle and BACK at the bottom.
            Netball shows the ATTACK, CENTRE and DEFENCE thirds. League shows
            a pitch with the Forwards at the top and the Backs at the bottom.
            Each player is a tile with their name and, where your sport uses
            them, a position label.
          </li>
          <li>
            <strong className="text-ink">Bench</strong>: players not currently
            on the area, shown below.
          </li>
          <li>
            <strong className="text-ink">League extras</strong> (Under 8 to
            Under 12): a <strong className="text-ink">Kickoff</strong> card
            at the start of each period, and FR / DH badges on the players
            wearing the vests.
          </li>
        </ul>

        <HelpFigure
          src="/help-screenshots/live-game-field.png"
          alt="An AFL live game with players in their lines and the scoreboard"
          caption="The on-area view during a live quarter (AFL shown)."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Recording scores</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          This needs scoring switched on for your team. See{" "}
          <Link href="/help/track-scoring" className="font-medium underline">
            Track scoring
          </Link>
          .
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            Tap a scoring player on the playing area to select them. In AFL,
            league and union this is any player on the field; in netball it&apos;s
            only GS or GA (the shooter positions).
          </li>
          <li>
            Tap the scoring button that appears. AFL:{" "}
            <strong className="text-ink">+ Goal</strong> or{" "}
            <strong className="text-ink">+ Behind</strong>. Netball:{" "}
            <strong className="text-ink">+ Goal</strong>. League:{" "}
            <strong className="text-ink">+ Try</strong>, plus{" "}
            <strong className="text-ink">+ Penalty goal</strong> and{" "}
            <strong className="text-ink">+ Field goal</strong> from Under 13.
            Union: <strong className="text-ink">+ Try</strong>, plus{" "}
            <strong className="text-ink">+ Penalty goal</strong> and{" "}
            <strong className="text-ink">+ Drop goal</strong> from Under 10.
          </li>
          <li>
            League and union from Under 8: after a try, the conversion picker
            opens.
            Pick the kicker, then tap <strong className="text-ink">Made</strong>{" "}
            or <strong className="text-ink">Missed</strong>.
          </li>
          <li>
            Made a mistake? Tap <strong className="text-ink">Undo</strong> on
            the strip just above the scoreboard to take back the latest score.
          </li>
          <li>
            Each team also has small score buttons beside its score: AFL{" "}
            <strong className="text-ink">+G</strong> and{" "}
            <strong className="text-ink">+B</strong>, netball{" "}
            <strong className="text-ink">+G</strong>, league{" "}
            <strong className="text-ink">+T</strong> and{" "}
            <strong className="text-ink">+C</strong> (plus{" "}
            <strong className="text-ink">+PG</strong> and{" "}
            <strong className="text-ink">+FG</strong> from Under 13), union{" "}
            <strong className="text-ink">+T</strong>,{" "}
            <strong className="text-ink">+C</strong>,{" "}
            <strong className="text-ink">+PG</strong> and{" "}
            <strong className="text-ink">+DG</strong>. On your
            side they ask who scored; on the opponent&apos;s side they add the
            score straight away.
          </li>
        </ol>

        <HelpFigure
          src="/help-screenshots/live-game-scoring.png"
          alt="A selected AFL player tile with scoring action buttons visible"
          caption="Tap a player to select them, then tap the scoring action."
        />

        <HelpCallout type="tip">
          AFL scores show as goals·behinds with the total points (goals × 6 +
          behinds) in large numerals, like a real scoreboard. Netball shows a
          single goals tally — every goal is worth one point. League shows the
          total points with a tries·conversions breakdown (try 4, conversion
          2), and penalty goals (2) and field goals (1) once there are any.
          Union shows the same, in its points (try 5, conversion 2, penalty
          and drop goals 3).
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Making a manual substitution</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          In AFL and league, to swap a player without waiting for a
          suggestion:
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-dim">
          <li>Tap a player on the playing area. They get a selection ring.</li>
          <li>Tap a player on the bench.</li>
          <li>
            AFL shows a confirmation dialog with the pair. Tap{" "}
            <strong className="text-ink">Confirm</strong> to commit or{" "}
            <strong className="text-ink">Cancel</strong> to back out. League
            makes the swap straight away.
          </li>
        </ol>
        <p className="mt-2 text-sm text-ink-dim">
          Netball subs at the quarter break. If your team has turned on{" "}
          <strong className="text-ink">Allow mid-quarter subs</strong> (Team ›
          How we play), long-press a player on court, tap{" "}
          <strong className="text-ink">Switch player</strong>, then pick who
          comes on.
        </p>
        <HelpCallout type="tip">
          In AFL, tapping the backdrop or pressing Escape closes the
          confirmation without making a swap.
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">The Sub Due alert (rolling subs)</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          In AFL and league, when the sub interval timer reaches zero the swap
          card shows <strong className="text-ink">NOW</strong> and expands
          automatically to show the suggested swaps, and a banner under the
          top bar reminds you it&apos;s time to rotate. It doesn&apos;t
          block the screen, so you can still record a score; tap{" "}
          <strong className="text-ink">Got it</strong> to clear it. The sub interval (1 to 10 minutes) is set
          under <strong className="text-ink">Game settings</strong> on the
          lineup screen, or with the Game settings button below the field
          during the game.
        </p>
        <p className="mt-2 text-sm text-ink-dim">
          You can tap <strong className="text-ink">Make swap</strong> next to
          any individual pair to apply just that one swap, or tap{" "}
          <strong className="text-ink">Make all N swaps</strong> to apply
          everything at once. After any swap is committed, the card collapses
          automatically and the timer resets.
        </p>
        <p className="mt-2 text-sm text-ink-dim">
          Netball doesn&apos;t use a rolling sub timer — rotations happen at
          the quarter break instead (see below).
        </p>

        <HelpFigure
          src="/help-screenshots/live-game-sub-due.png"
          alt="The AFL swap card expanded showing swap pairs with Make swap buttons and a Make all swaps button"
          caption="The Sub Due state (AFL shown): the card expands with suggested pairs and a Make all swaps button."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Player actions: keep on, injury, loan</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Long-press a player tile to open the player-actions sheet (or tap
          the player, then <strong className="text-ink">Player actions</strong>).
          What&apos;s on it depends on your sport:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Switch player</strong>: selects the
            player so your next tap makes the swap. In netball it only
            appears when mid-quarter subs are allowed.
          </li>
          <li>
            <strong className="text-ink">Keep on field</strong> (AFL only):
            the player is never subbed out. Good for a player who needs extra
            game time.
          </li>
          <li>
            <strong className="text-ink">Keep in a zone</strong> (AFL): the
            player can rotate off temporarily but always returns to the same
            line. Netball&apos;s version is &quot;Keep in{" "}
            <em>position</em> next break&quot;. League has neither — give a
            player the <strong className="text-ink">Keep on</strong> role
            (Squad › Role) instead, and the suggestions won&apos;t take them
            off.
          </li>
          <li>
            <strong className="text-ink">Replace First Receiver</strong> /{" "}
            <strong className="text-ink">Replace Dummy Half</strong> (league,
            on the player wearing the vest): pick a different player to take
            the vest for the rest of the period.
          </li>
          <li>
            <strong className="text-ink">Mark injured</strong>: takes the
            player out of the rotation. If they&apos;re on the field, AFL and
            league ask who comes on in their place; in netball their position
            empties and a picker asks who fills it. Their tile shows an{" "}
            <strong className="text-ink">INJ</strong> badge. Tap{" "}
            <strong className="text-ink">Back on</strong> to return them.
          </li>
          <li>
            <strong className="text-ink">Lend to opposition</strong>: marks
            the player as lent (common in junior teams when numbers are
            uneven). Shows a <strong className="text-ink">LENT</strong>{" "}
            badge. AFL shows each player&apos;s season total of loan minutes.
            Tap <strong className="text-ink">Bring back</strong> to return
            them.
          </li>
        </ul>
        <HelpCallout type="note">
          Injured and lent players are parked on the bench and left out of the
          rotation suggestions, so they aren&apos;t auto-placed when a new
          quarter or half starts. To bring a lent player back: in AFL, use the{" "}
          <strong className="text-ink">Lent to the other team</strong> strip
          at any quarter break or before the game in the lineup picker; in
          league, the same strip stays on the live screen all game; in netball,
          long-press them in the <strong className="text-ink">Sidelined</strong>{" "}
          strip at the next break. They drop onto your bench, ready to field.
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Ending a quarter or half</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            When the clock runs out, the quarter (or half) ends by itself and
            the clock stops. In AFL a{" "}
            <strong className="text-ink">Quarter complete</strong> card lets
            you add a score that landed on the siren before you move on.
          </li>
          <li>
            If the siren beats the clock, tap the clock and choose{" "}
            <strong className="text-ink">End Q{"{n}"} now</strong> (league
            from Under 10: <strong className="text-ink">End H{"{n}"} now</strong>).
          </li>
          <li>
            Tap <strong className="text-ink">End Q{"{n}"}</strong> (or{" "}
            <strong className="text-ink">End H{"{n}"}</strong>) to confirm.
            Players on the field are credited the full period.
          </li>
          <li>
            The break screen appears between periods. AFL, netball and league
            Under 6 to Under 9 play four quarters; league from Under 10 plays
            two halves. After the last one, the full-time review opens: check
            the score, then tap <strong className="text-ink">Finish game</strong>.
          </li>
        </ol>

        <HelpFigure
          src="/help-screenshots/live-game-quarter-end.png"
          alt="The confirmation dialog asking to end the current quarter"
          caption="Confirm to end the quarter (or half) and move to the break screen."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Breaks between quarters or halves</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          In AFL and netball, the app shows a{" "}
          <strong className="text-ink">Lineup for Q{"{n}"}</strong>{" "}
          screen at each quarter break. This is your chance to adjust who plays
          where in the next quarter. For netball this is the main moment of
          substitution; for AFL it&apos;s an optional reshuffle on top of the
          rolling subs you made during the quarter.
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Suggested</strong> is on by default:
            the algorithm has already placed players in the fairest positions.
            You can switch to <strong className="text-ink">Keep last quarter</strong>{" "}
            or <strong className="text-ink">Set manually</strong>. AFL also
            offers <strong className="text-ink">Rotate lines</strong>, which
            moves everyone one line along.
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
          <li>
            <strong className="text-ink">Game settings</strong> (collapsed)
            is where you lend a player or mark an injury. AFL also lets you
            change the on-field size there.
          </li>
        </ul>
        <p className="mt-3 text-sm text-ink-dim">
          When you&apos;re ready, tap{" "}
          <strong className="text-ink">Start Q{"{n}"}</strong>.
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          League has no separate break screen. The live screen shows the score
          and a <strong className="text-ink">Start Q{"{n}"}</strong> button
          (<strong className="text-ink">Start H{"{n}"}</strong> from Under
          10). From
          Under 8 to Under 12, a vest card asks who wears the FR (and DH) vest
          next. Under <strong className="text-ink">Manage availability</strong>{" "}
          you can add a player who&apos;s turned up, mark a player out (a
          bench player comes on in their place) or mark someone injured. You
          can still tap players to swap them before you start.
        </p>

        <HelpFigure
          src="/help-screenshots/live-game-quarter-break.png"
          alt="An AFL game at the end of the first quarter, with players in their lines"
          caption="The end of an AFL quarter. At the break, review positions, make any manual tweaks, then tap Start."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">The walkthrough</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          The first time you set up a lineup, Siren offers a walkthrough of
          the key features for your sport: positions, bench, making a sub,
          reading swap suggestions, scoring and the alerts that apply. League
          adds steps for vests, goal kicks and the unbroken-period rule where
          they apply. You can skip it or step through it, and tap the{" "}
          <strong className="text-ink">?</strong> at the top of the live
          screen to open it again.
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
