import { HelpFigure, HelpCallout } from "@/components/help/HelpPage";
import { B, HelpLink, HelpSection, P, QA, UL } from "@/components/help/prose";
import { AgeGroupTable } from "@/components/help/sport/AgeGroupTable";
import {
  BreakBasics,
  FullTimeBasics,
  KidActions,
  LiveScreenBasics,
  ScoreButtons,
  ScoringBasics,
  Strategies,
  type SportTerms,
} from "@/components/help/sport/shared";
import { SportHub } from "@/components/help/sport/SportHub";
import type { SportHelp } from "@/lib/help/sports";

const TERMS: SportTerms = {
  period: "quarter",
  tag: "Q",
  surface: "court",
  startCue: "the umpire calls play",
  endCue: "the whistle",
  lineCode: "GS",
};

export function NetballHelp({ hub }: { hub: SportHelp }) {
  return (
    <SportHub
      hub={hub}
      intro={
        <>
          Junior netball in Siren: four quarters, seven bibs across the three thirds, and the changes made at the
          quarter break, so every kid gets fair court time and a turn in each third.
        </>
      }
    >
      <HelpSection id="how-it-runs" title="How Siren runs netball">
        <UL>
          <li>Four quarters, 10 minutes each unless your association plays longer (Team › Quarter length).</li>
          <li>
            Seven bibs: <B>GS</B>, <B>GA</B>, <B>WA</B>, <B>C</B>, <B>WD</B>, <B>GD</B> and <B>GK</B>. Set plays five:
            GS, GA, C, GD and GK.
          </li>
          <li>
            Subs happen at the quarter break. At every break Siren suggests the next quarter&apos;s lineup, weighing
            court time, thirds and bibs across the season.
          </li>
          <li>Only GS and GA can score, as in the rules.</li>
        </UL>
      </HelpSection>

      <HelpSection id="live" title="The live game">
        <LiveScreenBasics
          terms={TERMS}
          field={
            <>
              Drawn in thirds: <B>Attack third</B>, <B>Centre third</B> and <B>Defence third</B>, with WA and WD in the
              centre band. Each kid shows their bib before their name (<B>GS Ava</B>). Bench kids say{" "}
              <B>On at the break</B>.
            </>
          }
        />
        <P>
          There&apos;s no sub countdown. The info line says <B>Subs at the break</B> (or <B>Subs any time</B> with
          mid-quarter subs on), with a reminder to tap GS or GA to score.
        </P>
        <HelpFigure
          src="/help-screenshots/netball/live.png"
          alt="A netball live game mid-quarter: the score and clock, the seven bibs across the attack, centre and defence thirds, and the bench"
          caption="A netball quarter under way."
        />
      </HelpSection>

      <HelpSection id="positions" title="Bibs and rotations">
        <P>
          The bibs follow the rules of play: a GS stays in the attack third and circle, a C goes anywhere but the
          circles. Siren counts each kid&apos;s quarters in each third and each bib, and suggests lineups that even
          them out.
        </P>
        <Strategies
          items={[
            {
              label: "By thirds",
              fit: "Go and 11 & Under",
              what: "a quarter in each third across the game; the bib within a third is chosen for fairness.",
            },
            { label: "Position by position", what: "every bib filled on its own, aiming for the most different bibs per kid." },
            {
              label: "Position cycle",
              fit: "Set and Go",
              what: "everyone steps one bib along each quarter: GS → GA → WA → C → WD → GD → GK → bench.",
            },
            {
              label: "Partners",
              fit: "12 & Under and 13 & Under",
              what: "kids keep their third and swap with their partner each quarter (GS and GA, GD and GK; WA, C and WD rotate).",
            },
            { label: "Set positions", fit: "13 & Under and Open", what: "a home bib plus backups; the bench rotates like-for-like." },
          ]}
        />
        <P>
          Season balance evens out thirds (By thirds) or bibs (the others). Rules include <B>Every third each game</B>,{" "}
          <B>Nobody sits out two quarters in a row</B>, and two packs: <B>Association junior rules</B> and{" "}
          <B>Carnival day</B> (every kid plays every third across the day&apos;s games). See{" "}
          <HelpLink href="/help/rotations">Rotations</HelpLink>.
        </P>
      </HelpSection>

      <HelpSection id="scoring" title="Scoring">
        <ScoringBasics
          button={<B>+ Goal</B>}
          unknown={null}
          scorers={<>The list has only your GS and GA: only they can score a netball goal.</>}
        />
        <ScoreButtons rows={[{ what: "Goal", points: "1", ours: "+ Goal", theirs: "+G" }]} />
        <P>
          The score is a goals tally. Tap GS or GA on court and their bar has + Goal too. Scoring is the team&apos;s{" "}
          <B>Track goals</B> setting (Team › Game-day extras); modified netball often leaves it off for the youngest.
        </P>
        <HelpFigure
          src="/help-screenshots/netball/scoring.png"
          alt="The Record goal sheet over a netball game, listing the GS and GA to pick from"
          caption="Record goal: only the GS and GA are listed."
        />
      </HelpSection>

      <HelpSection id="subs" title="Subs">
        <P>
          Netball subs at the quarter break. In the last few minutes of a quarter, <B>Plan Q2</B> at the end of the info
          line (also in ⋯) opens the <B>Game plan</B> with next quarter&apos;s lineup by bib. Tweak it and tap{" "}
          <B>Pin Q2 plan</B>, so you can tell kids before the whistle.
        </P>
        <HelpFigure
          src="/help-screenshots/netball/pairs.png"
          alt="The netball Game plan sheet for Q2: each bib with the kid suggested for it, Suggested or Set manually, and Pin Q2 plan"
          caption="Plan the next quarter before the whistle."
        />
        <P>
          Your association allows subs during a quarter? Turn on <B>Allow mid-quarter subs</B> on the Team tab, under
          How we play, or just for one match in the lineup&apos;s Game settings. Then tap a kid on court and a bench
          kid to swap them straight away.
        </P>
        <KidActions
          items={[
            { label: "Switch player", what: "pick who comes on at their bib (with mid-quarter subs on)." },
            { label: "Keep in GS next break", what: "they stay at that bib when the next break's lineup is made." },
            { label: "Mark injured", what: "out of the rotation; Siren asks who comes on at their bib." },
            { label: "Went home", what: "off for the rest of the game." },
            { label: "Lend to opposition", what: "with the kid's season loan minutes, so loans stay fair." },
          ]}
        />
        <HelpCallout type="note">
          Without mid-quarter subs, an injury mid-quarter still needs someone at the bib: mark the kid injured and pick
          who goes on.
        </HelpCallout>
      </HelpSection>

      <HelpSection id="breaks" title="Quarter breaks and full time">
        <P>The quarter ends straight into the break, where the changes happen.</P>
        <BreakBasics
          terms={TERMS}
          title="Q2 lineup"
          rotate={<>everyone steps one bib along the position cycle (GS → GA → WA → C → WD → GD → GK → bench).</>}
          extra={
            <P>
              Each kid shows their bib and where they were (<B>From GS</B>, <B>From bench</B>, <B>Stays</B>). Game
              settings at the break also changes <B>Players on court</B>. Tap <B>Start Q2</B>, then <B>Start Q2 now</B>{" "}
              when the umpire calls play.
            </P>
          }
        />
        <HelpFigure
          src="/help-screenshots/netball/break.png"
          alt="The netball quarter-time break: the score, the Q2 lineup by third and bib, the bench, and Start Q2"
          caption="Quarter time: the suggested Q2 lineup."
        />
        <FullTimeBasics check={<>Check the score, and <B>Change who scored</B> if a goal went to the wrong shooter.</>} />
        <HelpFigure
          src="/help-screenshots/netball/fulltime.png"
          alt="The netball full-time review: the final score, the goals by shooter and court time, with Finish game"
          caption="The full-time review, before Finish game."
        />
      </HelpSection>

      <HelpSection id="rules" title="Age groups and junior rules">
        <AgeGroupTable sport="netball" />
        <P>
          A short court fills the scoring end first (Set: GS, GA, GD, GK, then C), and the screen says which bib is
          empty (<B>Playing 6 of 7: Wing Defence is empty</B>). Everyone plays at least 50% of the game by default; set
          your own minimum in How we play.
        </P>
      </HelpSection>

      <HelpSection id="faq" title="Netball questions">
        <QA q="Can I change bibs mid-quarter for an injury?">
          <p>Yes. Tap the kid, then Injured, and pick who goes on at their bib. Their bib is filled straight away.</p>
        </QA>
        <QA q="Our quarters are 12 minutes. Can I change that?">
          <p>
            Yes: Team › Season › <B>Quarter length</B>. New games use it.
          </p>
        </QA>
        <QA q="Why is the lineup different from the cycle I expected?">
          <p>
            Suggested weighs the whole season, the kids who are out and your rules. Pick <B>Rotate</B> at the break for
            the plain position cycle, or <B>Repeat</B> for last quarter&apos;s lineup.
          </p>
        </QA>
        <QA q="Can a parent run the scoring?">
          <p>
            Yes: send them the game&apos;s <B>Game-day link</B> (⋯ in the live game). No account needed. See{" "}
            <HelpLink href="/help/games">Games</HelpLink>.
          </p>
        </QA>
      </HelpSection>
    </SportHub>
  );
}
