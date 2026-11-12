// Screenshots referenced on this page:
//   /help-screenshots/live-game-lineup-picker.png
//   /help-screenshots/live-game-field.png
//   /help-screenshots/live-game-sub-due.png
//   /help-screenshots/live-game-quarter-end.png

import { HelpPage, HelpFigure, HelpCallout } from "@/components/help/HelpPage";
import { B, H3, HelpLink, HelpSection, OL, P, Related, UL } from "@/components/help/prose";
import { SPORT_HELP } from "@/lib/help/sports";

export const metadata = {
  title: "The Live Screen · Help · Siren",
  description:
    "The live screen in every sport: the lineup, the clock, pausing and ending a period, undo, fixing scores, the ⋯ game menu, late arrivals, injuries, loans, offline, large text and dark mode.",
  alternates: { canonical: "/help/live-game" },
};

export default function LiveGamePage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">The live screen</h1>
      <P lead>
        The live screen is your sideline companion: the score and clock, your kids on the field or court, the bench,
        and a bar at the bottom for scoring and for the kid you&apos;ve tapped. It looks and works the same in every
        sport; only the field, the score buttons and the sub rules change.
      </P>
      <P>
        This page covers what every sport shares. For your sport&apos;s field, scoring, subs and rules, open its page:{" "}
        {SPORT_HELP.map((h, i) => (
          <span key={h.href}>
            {i > 0 && (i === SPORT_HELP.length - 1 ? " or " : ", ")}
            <HelpLink href={h.href}>{h.title}</HelpLink>
          </span>
        ))}
        .
      </P>

      <HelpSection id="lineup" title="Before the game: the lineup">
        <OL>
          <li>
            Mark who&apos;s in (see <HelpLink href="/help/squads">Squads</HelpLink>), then tap <B>Start game day</B> on
            the game (<B>Plan lineup</B> before the day).
          </li>
          <li>
            Siren suggests a starting lineup from each kid&apos;s time this season. Tap any two kids to swap them, across
            positions or to and from the bench.
          </li>
          <li>
            <B>Game settings</B> on the lineup screen sets the players on the field, the sub interval and, in some sports,
            the shape.
          </li>
          <li>
            Tap <B>Ready</B>. The live screen opens with <B>Start Q1</B> (or <B>Start H1</B>) on the bar: tap it, then{" "}
            <B>Start Q1 now</B> when play starts. Changed your mind first? ⋯ › <B>Edit lineup</B> goes back.
          </li>
        </OL>
        <HelpFigure
          src="/help-screenshots/live-game-lineup-picker.png"
          alt="An AFL lineup on the oval: each line's kids as tiles, with the bench and Ready below"
          caption="The suggested starting lineup (AFL shown), ready to tweak."
        />
      </HelpSection>

      <HelpSection id="screen" title="What's on the screen">
        <UL>
          <li>
            <B>The top bar</B>: <B>‹ Exit</B> back to the game page, who you&apos;re playing, and <B>⋯</B> for the game
            menu.
          </li>
          <li>
            <B>The score and clock</B>: your team on the left, the clock in the middle, the opponent on the right.
          </li>
          <li>
            <B>The info line</B> under the score: the next sub (&quot;Next sub 2:10 · 3 swaps&quot;), a rule to keep,
            or what to do now. Tap it to see the pairs.
          </li>
          <li>
            <B>The field or court</B>, drawn for your sport. Each kid is their name, with at most one line under it:
            their part in the next sub (<B>Off next</B>, <B>On next</B>), <B>Needs 6′ more</B>, or <B>INJ</B>, <B>HOME</B>{" "}
            or <B>LENT</B>.
          </li>
          <li>
            <B>The bench</B>, with <B>+ Late</B> at its foot.
          </li>
          <li>
            <B>The bar</B> at the bottom: score buttons, or Start before a period, or <B>Make all swaps</B> when a sub is
            due. Tap a kid and it becomes their bar; tap × to put them down.
          </li>
        </UL>
        <HelpFigure
          src="/help-screenshots/live-game-field.png"
          alt="An AFL live game with players in their lines and the scoreboard"
          caption="A live quarter (AFL shown)."
        />
      </HelpSection>

      <HelpSection id="clock" title="The clock">
        <UL>
          <li>
            Tap the clock for <B>Pause clock</B> (for a stoppage, like an injury) or <B>Resume clock</B>, and{" "}
            <B>End Q2 now</B> for when the siren, whistle or buzzer beats the app&apos;s clock.
          </li>
          <li>
            When the clock runs out, the period ends by itself. In basketball, touch and Oztag the clock waits at 0:00
            for the real hooter or whistle instead; tap it then.
          </li>
          <li>
            Ending early asks <B>End Q2 now?</B>: tap <B>End Q2</B> to credit the time played, or{" "}
            <B>The game played on</B> to credit the full period if play went on after the app stopped.
          </li>
        </UL>
        <HelpFigure
          src="/help-screenshots/live-game-quarter-end.png"
          alt="The End Q2 now? sheet with End Q2, Cancel and The game played on buttons"
          caption="Ending a quarter early."
        />
      </HelpSection>

      <HelpSection id="subs" title="Subs and the next sub">
        <P>
          In every sport but netball, subs roll: Siren counts down to the next sub, numbers the pairs on the kids, and
          when it&apos;s due the clock turns orange and the bar shows <B>Make all N swaps</B> and <B>Pairs</B>. You can
          also swap any time: tap a kid on the field, then one on the bench, and <B>Undo</B> shows for a few seconds.
          Netball subs at the break. See <HelpLink href="/help/rotations">Rotations</HelpLink> for how Siren picks who.
        </P>
        <HelpFigure
          src="/help-screenshots/live-game-sub-due.png"
          alt="An AFL live game with a sub due: the kids say Off now and On now, and the bar shows Make all swaps"
          caption="A sub due (AFL shown): the pairs numbered on the kids."
        />
      </HelpSection>

      <HelpSection id="scores" title="Scores, undo and fixes">
        <UL>
          <li>
            Tap a score button on the bar and pick who scored, or tap a kid first and score from their bar. The
            other team&apos;s small buttons add their score straight away.
          </li>
          <li>
            <B>Undo</B>, on the line under the score, takes back the latest score and names it first.
          </li>
          <li>
            Tap the score (or ⋯ › <B>Scores and fixes</B>) for every score this game: take one off, change who scored, or
            add one you missed.
          </li>
        </UL>
        <P>
          Scoring needs the team&apos;s scoring setting on: see <HelpLink href="/help/track-scoring">Keeping score</HelpLink>.
        </P>
      </HelpSection>

      <HelpSection id="kid" title="Tap a kid: injured, went home, lent, kept on">
        <P>
          Tap a kid and the bar shows their minutes and share of the game, the score buttons, <B>Injured</B> and{" "}
          <B>More</B>. More opens <B>Player actions</B>. Every sport has:
        </P>
        <UL>
          <li>
            <B>Switch player</B>: your next tap makes the swap.
          </li>
          <li>
            <B>Mark injured</B>: to the bench and out of the rotation. On the field, Siren asks who comes on (
            <B>Play one short</B> if nobody). Their name shows <B>INJ</B>; tap them and <B>Back on</B> when they&apos;re
            right.
          </li>
          <li>
            <B>Went home</B>: off for the rest of the game, their time stopped. Their name shows <B>HOME</B>.
          </li>
          <li>
            <B>Lend to opposition</B>: when the other team is short. Their name shows <B>LENT</B>; tap them and{" "}
            <B>Bring them back</B>.
          </li>
        </UL>
        <P>
          Most sports also have <B>Keep on field</B> (never subbed off), and some their own: keep in a line or bib,
          replace the keeper or a vest, sit out for a foul. Your sport&apos;s page lists them.
        </P>
        <HelpCallout type="note">
          Injured, gone-home and lent kids stay out of the suggestions, so they aren&apos;t put back on at the next sub or
          break until you bring them back.
        </HelpCallout>
      </HelpSection>

      <HelpSection id="menu" title="The ⋯ game menu">
        <UL>
          <li>
            <B>End Q2</B> (or <B>End 1st half</B>): end the period now.
          </li>
          <li>
            <B>+ Add late arrival</B>: a squad kid who&apos;s just turned up goes on the bench, and the next sub works them
            in.
          </li>
          <li>
            <B>Game settings</B>: the sub interval and players on the field.
          </li>
          <li>
            <B>Scores and fixes</B>, quarter by quarter. With scoring off, a coach sees <B>Turn scoring on</B> here
            instead.
          </li>
          <li>
            <B>Plan Q3</B>: pin the next lineup before the break (AFL and netball).
          </li>
          <li>
            <B>How the live screen works</B>: a one-minute tour, the same one Siren offers the first time.
          </li>
          <li>
            <B>Send feedback</B> to the Siren team.
          </li>
          <li>
            <B>Game-day link</B>: let another parent run the clock, with no account. See{" "}
            <HelpLink href="/help/games">Games</HelpLink>.
          </li>
          <li>
            <B>Edit lineup</B> (before the start) and <B>Restart game</B>, which wipes this game (coaches only).
          </li>
        </UL>
      </HelpSection>

      <HelpSection id="phones" title="Two phones, no signal">
        <H3>Two phones on one game</H3>
        <P>
          A coach and a parent with the game-day link can both run it. Each phone saves its own taps, and the other&apos;s
          show within a few seconds with a note (<B>Another phone added Mia&apos;s goal</B>). Agree who scores for which
          team before the start.
        </P>
        <H3>No signal</H3>
        <P>
          If the signal drops, the game keeps going on your phone and a strip says{" "}
          <B>You&apos;re offline. Taps save on this phone and send when you&apos;re back.</B> When it reconnects they send
          in order. Open the game before you lose signal: new screens still need a connection.
        </P>
      </HelpSection>

      <HelpSection id="display" title="Large text and dark mode">
        <P>
          Siren follows your phone&apos;s text size. With large text the live screen keeps what matters: the top bar drops
          its second line and the score shows totals only. For bright sun or night games, pick <B>Light</B> or{" "}
          <B>Dark</B> under <HelpLink href="/help/account">your account</HelpLink> › Appearance (it follows your phone by
          default).
        </P>
      </HelpSection>

      <Related
        links={[
          { href: "/help/breaks", label: "Breaks" },
          { href: "/help/rotations", label: "Rotations" },
          { href: "/help/track-scoring", label: "Keeping score" },
          { href: "/help/stats", label: "Stats" },
        ]}
      />
    </HelpPage>
  );
}
