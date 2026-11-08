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
        (soccer) and basketball use rolling subs, so a Next sub line counts down
        and Siren suggests who comes on during play. Netball subs at the breaks, so it shows the
        next-quarter reshuffle at every break instead. League also tracks its
        junior laws: FR and DH vests, goal-kick turns and kickoff turns; union
        has none of them. Football keeps its keeper in goal for the whole
        half: at half-time Siren plans the next half, starting with who takes
        the keeper top, and <strong className="text-ink">Replace keeper</strong>{" "}
        (tap the keeper, then More) changes it mid-half. Basketball subs at a dead
        ball through the table, tracks each kid&apos;s fouls (five and
        they&apos;re out), and its clock waits at 0:00 for the real hooter,
        since the stadium clock stops in the last minutes. Touch football and
        Oztag roll subs on and off whenever you like (make the change when you
        have the ball), and a mixed team keeps its cap on boys, shrinking the
        field when it&apos;s short of girls; see{" "}
        <Link href="/help/rotations#touch-and-oztag" className="text-brand-700 underline">
          Rotations
        </Link>
        . Every sport has the same live screen: the score and clock at the
        top, the field, the bench, and a bar at the bottom for scoring and for
        the kid you&apos;ve tapped.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-dim">
        Futsal runs on football&apos;s live screen, drawn on a court, with
        futsal&apos;s words: the back, the wings and the front. Its keeper
        can be swapped mid-half, as in football.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-dim">
        Hockey runs on it too, on a hockey pitch, in halves or quarters.
        Its keeper changes only at a break: two minutes before one, Siren
        names who&apos;s in goal next so they can kit up.
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
            When you&apos;re happy, tap <strong className="text-ink">Ready</strong>.
            The live screen opens with{" "}
            <strong className="text-ink">Start Q1</strong> on the bar at the
            bottom: tap it, then <strong className="text-ink">Start Q1 now</strong>{" "}
            when the game starts. Sports in halves read{" "}
            <strong className="text-ink">Start H1</strong>. Changed your mind
            before then? <strong className="text-ink">⋯</strong> ›{" "}
            <strong className="text-ink">Edit lineup</strong> takes you back.
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
            <strong className="text-ink">The score</strong>, at the top: your
            team on the left, the clock in the middle, the opponent on the
            right. Tap the clock to pause, resume or end the quarter (or half)
            early. Tap the score to fix it.
          </li>
          <li>
            <strong className="text-ink">The Next sub line</strong> (rolling
            subs): under the score, it counts down to the next sub and says
            how many swaps (&quot;Next sub 2:10 · 3 swaps&quot;). Tap it to see
            the pairs. See{" "}
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
            Each kid is their name in chalk, with at most one line of words
            under it: their part in the next sub (&quot;Off next&quot;,
            &quot;On next → FWD&quot;), or INJ or LENT.
          </li>
          <li>
            <strong className="text-ink">Bench</strong>: kids not on the area,
            under it, three across.
          </li>
          <li>
            <strong className="text-ink">League extras</strong> (Under 8 to
            Under 12): a <strong className="text-ink">Kickoff</strong> card
            at the start of each period, and small FR / DH flags on the players
            wearing the vests.
          </li>
          <li>
            <strong className="text-ink">The bar</strong>, at the bottom: the
            scoring buttons, or Start before a period, or{" "}
            <strong className="text-ink">Make all swaps</strong> when a sub is
            due. Tap a kid and it becomes their bar.
          </li>
          <li>
            <strong className="text-ink">⋯</strong> at the top: late arrivals,
            game settings, scores and fixes, the walkthrough, feedback and the
            game-day link (so another parent can run the clock).
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
            Tap the score button on the bar at the bottom and pick who scored,
            or tap a kid first and score from their bar. In AFL, league and
            union any player on the field can score; in netball only GS or GA
            (the shooter positions).
          </li>
          <li>
            The buttons are your sport&apos;s. AFL:{" "}
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
            the line under the score to take back the latest score, or tap the
            score itself to open <strong className="text-ink">Scores and fixes</strong>{" "}
            and take off or add any score this game.
          </li>
          <li>
            The other team has small score buttons on the bar: AFL{" "}
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
            <strong className="text-ink">+DG</strong>. They add the score
            straight away.
          </li>
        </ol>

        <HelpFigure
          src="/help-screenshots/live-game-scoring.png"
          alt="An AFL live game with the score buttons on the bar at the bottom"
          caption="Tap + Goal on the bar and pick who scored, or tap a kid first."
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
          In the sports with rolling subs, to swap a player without waiting
          for a suggestion:
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-dim">
          <li>Tap a kid on the playing area. Their bar opens at the bottom.</li>
          <li>Tap a kid on the bench (or another field kid to swap lines).</li>
          <li>
            The swap happens straight away, and a note says who went off and
            who came on. Picked the wrong pair? Tap{" "}
            <strong className="text-ink">Undo</strong> on the note within a few
            seconds to put them back.
          </li>
        </ol>
        <p className="mt-2 text-sm text-ink-dim">
          Netball subs at the quarter break. If your team has turned on{" "}
          <strong className="text-ink">Allow mid-quarter subs</strong> (Team ›
          How we play), tap a player on court, then a bench player, and the
          swap happens straight away, as in the other sports.
        </p>
        <HelpCallout type="tip">
          Touch and Oztag ask first when a swap would break your mixed
          team&apos;s rule: tap <strong className="text-ink">Swap anyway</strong>{" "}
          or <strong className="text-ink">Pick someone else</strong>.
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">When a sub is due (rolling subs)</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          While the Next sub line counts down, the kids in the next sub say{" "}
          <strong className="text-ink">Off next</strong> or{" "}
          <strong className="text-ink">On next</strong>, with the same number
          on both kids of a pair. When the countdown reaches zero the clock
          turns orange, the kids say <strong className="text-ink">Off now</strong>{" "}
          and <strong className="text-ink">On now</strong>, and the bar at the
          bottom shows <strong className="text-ink">Make all N swaps</strong>{" "}
          and <strong className="text-ink">Pairs</strong>. Nothing blocks the
          screen, so you can still record a score. The sub interval (1 to 10
          minutes) is set under <strong className="text-ink">Game settings</strong>{" "}
          on the lineup screen, or under <strong className="text-ink">⋯</strong>{" "}
          during the game.
        </p>
        <p className="mt-2 text-sm text-ink-dim">
          Tap <strong className="text-ink">Make all N swaps</strong> to do
          everything at once, with Undo for a few seconds after. Tap{" "}
          <strong className="text-ink">Pairs</strong> (or the Next sub line) to
          see the pairs first: make just one, or change who comes on. The
          timer then starts again.
        </p>
        <p className="mt-2 text-sm text-ink-dim">
          Netball doesn&apos;t use a rolling sub timer — rotations happen at
          the quarter break instead (see below).
        </p>

        <HelpFigure
          src="/help-screenshots/live-game-sub-due.png"
          alt="An AFL live game with a sub due: the kids say Off now and On now, and the bar shows Make all swaps"
          caption="A sub due (AFL shown): the pairs are numbered on the kids, and Make all swaps is on the bar."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Tap a kid: keep on, injury, loan</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Tap a kid and the bar at the bottom becomes theirs: their minutes
          and share of the game, scoring for them,{" "}
          <strong className="text-ink">Injured</strong>, and{" "}
          <strong className="text-ink">More</strong> for the rest. Tap × to put
          them down. What&apos;s under More depends on your sport:
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
            <strong className="text-ink">Injured</strong> (on the kid&apos;s
            bar) or <strong className="text-ink">Mark injured</strong>: takes
            the player out of the rotation. If they&apos;re on the field, AFL and
            league ask who comes on in their place; in netball their position
            empties and a picker asks who fills it. Their name shows{" "}
            <strong className="text-ink">INJ</strong>. Tap{" "}
            <strong className="text-ink">Back on</strong> to return them.
          </li>
          <li>
            <strong className="text-ink">Lend to opposition</strong>: marks
            the player as lent (common in junior teams when numbers are
            uneven). Their name shows <strong className="text-ink">LENT</strong>.
            AFL shows each player&apos;s season total of loan minutes.
            Tap <strong className="text-ink">Bring back</strong> to return
            them.
          </li>
        </ul>
        <HelpCallout type="note">
          Injured and lent players are parked on the bench and left out of the
          rotation suggestions, so they aren&apos;t auto-placed when a new
          quarter or half starts. To bring one back, tap them on the bench and
          tap <strong className="text-ink">Back on</strong> or{" "}
          <strong className="text-ink">Bring back</strong>. They stay on your
          bench, ready for the next sub.
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
            <strong className="text-ink">End H{"{n}"}</strong>) to make sure.
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
          League&apos;s break shows the score and the next lineup, with{" "}
          <strong className="text-ink">Start Q{"{n}"}</strong>{" "}
          (<strong className="text-ink">Start H{"{n}"}</strong> from Under
          10) at the bottom. From
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
          they apply. You can skip it or step through it, and open it again
          from <strong className="text-ink">⋯</strong> ›{" "}
          <strong className="text-ink">How the live screen works</strong>.
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
