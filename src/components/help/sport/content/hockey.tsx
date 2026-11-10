import { HelpFigure } from "@/components/help/HelpPage";
import { B, HelpSection, P, QA, UL } from "@/components/help/prose";
import { AgeGroupTable } from "@/components/help/sport/AgeGroupTable";
import {
  GoalScoring,
  KeeperPicking,
  KeeperStrategies,
  SOCCER_FAMILY_COLUMNS,
  SoccerFamilySubs,
  SoccerLines,
} from "@/components/help/sport/content/soccerFamily";
import { BreakBasics, FullTimeBasics, LiveScreenBasics, LockedLaws, type SportTerms } from "@/components/help/sport/shared";
import { SportHub } from "@/components/help/sport/SportHub";
import type { SportHelp } from "@/lib/help/sports";

const TERMS: SportTerms = {
  period: "half or quarter",
  tag: "H",
  surface: "field",
  startCue: "the whistle goes",
  endCue: "the whistle",
  lineCode: "STR",
};

export function HockeyHelp({ hub }: { hub: SportHelp }) {
  return (
    <SportHub
      hub={hub}
      intro={
        <>
          Junior hockey in Siren: defenders, midfield and strikers, rolling subs any time, and a keeper who changes only
          at the break, with a heads-up so the next one can kit up.
        </>
      }
    >
      <HelpSection id="how-it-runs" title="How Siren runs hockey">
        <UL>
          <li>Halves to Under 12, and 4 × 15-minute quarters from Under 13. Your competition plays the other? Switch it.</li>
          <li>Under 7 and Under 8 play 6 a side with no keeper and no lines: Siren just evens out minutes.</li>
          <li>From Under 9 there&apos;s a keeper, and goal changes hands only at a break.</li>
          <li>Rolling subs any time, as often as you like, except during a penalty corner.</li>
          <li>Junior hockey keeps no results to about Under 10, so scoring starts off for the youngest.</li>
        </UL>
      </HelpSection>

      <HelpSection id="live" title="The live game">
        <LiveScreenBasics
          terms={TERMS}
          start={
            <>
              <B>Start H1</B> (<B>Start Q1</B> in quarters)
            </>
          }
          field={
            <>
              A hockey pitch with the <B>Strikers</B> at the top, then <B>Midfield</B> and <B>Defenders</B>, and the
              keeper in goal. The kids&apos; words say their part in the next sub (<B>On next → STR</B>).
            </>
          }
        />
        <HelpFigure
          src="/help-screenshots/hockey/live.png"
          alt="A hockey live game: the score and clock, strikers, midfield and defenders with the keeper in goal, and the bench"
          caption="An Under 11 half under way."
        />
      </HelpSection>

      <HelpSection id="positions" title="Lines, shapes and rotations">
        <SoccerLines
          lines={
            <>
              <B>Strikers</B> (STR), <B>Midfield</B> (MID) and <B>Defenders</B> (DEF)
            </>
          }
          shapeNote={
            <>
              The shape counts back to front without the keeper: 3-2-2 is three defenders, two in midfield and two
              strikers. Pick it under <B>Shape</B> in the lineup&apos;s Game settings.
            </>
          }
          noLines={<>Under 7 and Under 8 play one line, the whole field, with no keeper.</>}
        />
        <KeeperStrategies
          turns={{
            fit: "Under 9 to Under 12",
            what: (
              <>
                goal changes hands only at the breaks (keeper kit takes a few minutes), the fewest keeper minutes first.
                Siren names the next keeper before the break.
              </>
            ),
          }}
          keepers={{
            fit: "Under 13 and up",
            what: <>you mark your keepers (Keen keeper, under Role) and they share goal, changing at the breaks.</>,
          }}
          equal={{ fit: "Under 7 and Under 8", what: <>6 a side, no keeper and no lines: kids just play, and Siren evens out their minutes.</> }}
        />
      </HelpSection>

      <HelpSection id="scoring" title="Scoring">
        <GoalScoring />
        <HelpFigure
          src="/help-screenshots/hockey/scoring.png"
          alt="The Who scored? sheet over a hockey game, with the strikers first, Not sure who and Own goal (theirs)"
          caption="Who scored? after + Goal."
        />
      </HelpSection>

      <HelpSection id="subs" title="Subs">
        <SoccerFamilySubs
          terms={TERMS}
          name="Rolling subs"
          how={
            <>
              any time, as often as you like, except during a penalty corner. Siren can&apos;t see a corner, so wait for
              it to finish.
            </>
          }
          replaceKeeper={<>shows on the keeper but can&apos;t be used mid-half: the keeper&apos;s kitted up, so they change at the break.</>}
        />
        <HelpFigure
          src="/help-screenshots/hockey/pairs.png"
          alt="The hockey pairs sheet with a sub due: numbered pairs by line, and Make all swaps"
          caption="The pairs, with a sub due."
        />
      </HelpSection>

      <HelpSection id="keeper" title="The keeper">
        <P>
          Keeper kit takes a few minutes to put on, so goal changes hands only at a break. Two minutes before one, Siren
          names who&apos;s in goal next: <B>Mia&apos;s in goal next half: start kitting up.</B> The break&apos;s plan
          starts with them in goal (Suggested, Rotate and Repeat; not Manual).
        </P>
        <P>
          Keeper hurt? Tap them, then <B>Injured</B>, and pick who goes in. Tapping the keeper and a field kid to swap
          them says the keeper changes at the break.
        </P>
        <KeeperPicking period="half" />
      </HelpSection>

      <HelpSection id="breaks" title="Breaks and full time">
        <BreakBasics
          terms={TERMS}
          title="2nd half lineup"
          rotate={<>the plan&apos;s keeper stays, and everyone else moves up a line: defenders to midfield to strikers, and back.</>}
          extra={
            <P>
              In quarters the break reads <B>Q2 lineup</B> and <B>Start Q2</B>. Switch between halves and quarters under
              Team › Season › <B>Halves or quarters</B> (the game&apos;s length stays the same); new games follow it.
            </P>
          }
        />
        <HelpFigure
          src="/help-screenshots/hockey/break.png"
          alt="The hockey half-time break: the score, the 2nd half lineup with the next keeper in goal, the bench, and Start 2nd half"
          caption="Half-time: the next keeper is already in goal."
        />
        <FullTimeBasics check={<>Check the score with the other team.</>} />
        <HelpFigure
          src="/help-screenshots/hockey/fulltime.png"
          alt="The hockey full-time review: the final score, the goal scorers, minutes and time in goal, with Finish game"
          caption="The full-time review, before Finish game."
        />
      </HelpSection>

      <HelpSection id="rules" title="Age groups and junior rules">
        <AgeGroupTable sport="hockey" extra={SOCCER_FAMILY_COLUMNS} />
        <LockedLaws
          laws={[
            {
              text: "Subs roll on and off at any time, as often as you like, except during a penalty corner",
              source: "FIH Rules of Hockey",
            },
            { text: "Equal time on the field and in all positions (Under 7 to Under 10)", source: "Hockey NSW, Under 8 to Under 10" },
          ]}
        />
      </HelpSection>

      <HelpSection id="faq" title="Hockey questions">
        <QA q="Why can't I swap the keeper during play?">
          <p>Kit takes a few minutes to put on, so Siren changes the keeper at the break. For an injury, tap Injured.</p>
        </QA>
        <QA q="Victoria plays 2 × 30 halves at our age.">
          <p>Switch to Halves under Team › Season › Halves or quarters, and set the half length there.</p>
        </QA>
      </HelpSection>
    </SportHub>
  );
}
