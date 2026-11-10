// Screenshots referenced on this page:
//   /help-screenshots/live-game-quarter-break.png

import { HelpPage, HelpFigure, HelpCallout } from "@/components/help/HelpPage";
import { B, HelpLink, HelpSection, P, Related, UL } from "@/components/help/prose";

export const metadata = {
  title: "Breaks · Help · Siren",
  description:
    "The break between quarters or halves in every sport: the next lineup, Suggested, Rotate, Repeat and Manual, swapping kids, injuries and late arrivals, the rule check, and starting again.",
  alternates: { canonical: "/help/breaks" },
};

export default function BreaksPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Breaks</h1>
      <P lead>
        When a quarter or half ends, the break screen opens: the score, and the next period&apos;s lineup on your
        field or court, ready to tweak. It&apos;s the same screen in every sport. In netball it&apos;s where the subs
        happen; in the others it&apos;s a reshuffle on top of the rolling subs.
      </P>

      <HelpSection id="lineup" title="The next lineup">
        <P>
          The title names the period (<B>Q3 lineup</B>, <B>2nd half lineup</B>), under it the break and the opponent.
          Pick how the lineup is built:
        </P>
        <UL>
          <li>
            <B>Suggested</B> (the default): Siren&apos;s fairest lineup, from this game&apos;s minutes, the season and
            your How we play rules.
          </li>
          <li>
            <B>Rotate</B>: everyone moves along, the way your sport does it: up a line, a bib along, forwards and
            backs swapping, a lane out. Your sport&apos;s page says which.
          </li>
          <li>
            <B>Repeat</B>: the same lineup as last period.
          </li>
          <li>
            <B>Manual</B>: start empty and place every kid.
          </li>
        </UL>
        <P>
          Tap any two kids to swap them, across positions or to and from the bench. Each kid says where they were last
          period (<B>Stays</B>, <B>From bench</B>, <B>From Centre</B>) and their game time; time turns orange when a kid
          is well under the team average.
        </P>
        <HelpFigure
          src="/help-screenshots/live-game-quarter-break.png"
          alt="The AFL Q3 lineup at the Q2 break: the score, the Suggested, Rotate, Repeat and Manual choices, the kids in their lines and the bench, and Start Q3"
          caption="A break (AFL shown): review the lineup, make any tweaks, then Start."
        />
      </HelpSection>

      <HelpSection id="whos-out" title="Injuries, loans and late arrivals">
        <P>
          The button beside the score (<B>All available</B> when nobody&apos;s out) opens the break&apos;s Game
          settings: mark a kid injured or left early, lend one, <B>Add arrived player</B> for a kid who&apos;s turned up,
          or mark one out. In some sports it changes the players on the field too. Injured and lent kids are greyed out
          and can&apos;t go on; a lent kid has <B>Bring back</B>.
        </P>
      </HelpSection>

      <HelpSection id="rules" title="The rule check">
        <P>
          Under the choices, Siren checks the lineup against your sport&apos;s rules and yours: the game-time minimum,
          keepers, vests, the mixed rule, unbroken periods. If one would be broken, Start says how many and asks{" "}
          <B>Start with N rules broken?</B>; tap <B>Start anyway</B> if your competition allows it.
        </P>
        <HelpCallout type="tip">
          AFL and netball can plan the next lineup during play: <B>Plan Q3</B> at the end of the info line. The break
          then says <B>Pre-filled from your planned Q3 lineup</B>.
        </HelpCallout>
      </HelpSection>

      <HelpSection id="start" title="Starting again">
        <P>
          Tap <B>Start Q3</B> (<B>Start 2nd half</B>), then <B>Start Q3 now</B> when play starts: the clock starts
          then. After the last period, the full-time review opens instead: check the score, then <B>Finish game</B>.
          See <HelpLink href="/help/stats">Stats</HelpLink> for the summary.
        </P>
      </HelpSection>

      <Related
        links={[
          { href: "/help/live-game", label: "The live screen" },
          { href: "/help/rotations", label: "Rotations" },
          { href: "/help", label: "Your sport" },
        ]}
      />
    </HelpPage>
  );
}
