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
  period: "half",
  tag: "H",
  surface: "field",
  startCue: "the whistle goes",
  endCue: "the whistle",
  lineCode: "DEF",
};

export function SoccerHelp({ hub }: { hub: SportHelp }) {
  return (
    <SportHub
      hub={hub}
      intro={
        <>
          Junior football in Siren: two halves, a keeper from Under 8, kids moving through defence, midfield and attack,
          and rolling subs any time, as MiniRoos plays it.
        </>
      }
    >
      <HelpSection id="how-it-runs" title="How Siren runs football">
        <UL>
          <li>Two halves at every age, 20 minutes at Under 6 up to 40 at Under 15 to Under 17.</li>
          <li>Under 6 and Under 7 play 4 a side, no keeper and no lines: Siren just evens out minutes.</li>
          <li>
            From Under 8 there&apos;s a keeper. To Under 11 everyone has a turn in goal; from Under 12 your named keepers
            share it.
          </li>
          <li>Rolling subs: on and off at any time, as often as you like. Siren plans a fair sub on a timer.</li>
          <li>MiniRoos (Under 6 to Under 11) keeps no score, so scoring starts off until Under 12.</li>
        </UL>
      </HelpSection>

      <HelpSection id="live" title="The live game">
        <LiveScreenBasics
          terms={TERMS}
          field={
            <>
              A pitch with <B>Attack</B> at the top, then <B>Midfield</B> and <B>Defence</B>, and the keeper in goal at
              the bottom. Each kid&apos;s words say their part in the next sub (<B>On next → DEF</B>), and a scorer shows{" "}
              <B>2G</B>.
            </>
          }
        />
        <HelpFigure
          src="/help-screenshots/soccer/live.png"
          alt="A football live game: the score and clock, kids in attack, midfield and defence with the keeper in goal, and the bench"
          caption="An Under 12 half under way, the next sub a few seconds off."
        />
      </HelpSection>

      <HelpSection id="positions" title="Lines, shapes and rotations">
        <SoccerLines
          lines={
            <>
              <B>Attack</B> (ATT), <B>Midfield</B> (MID) and <B>Defence</B> (DEF)
            </>
          }
          shapeNote={
            <>
              The shape counts back to front without the keeper: 3-3-2 is three in defence, three in midfield and two up
              front. Pick it under <B>Shape</B> in the lineup&apos;s Game settings. At Under 12 and Under 13, Football
              Victoria asks for at least three lines, and Siren warns if a shape has fewer.
            </>
          }
          noLines={<>Under 6 and Under 7 play one line, the whole field, with no keeper.</>}
        />
        <KeeperStrategies
          turns={{
            fit: "MiniRoos, Under 8 to Under 11",
            what: <>one keeper a half, the fewest keeper minutes first. Mark keen keepers, and kids who&apos;d rather not.</>,
          }}
          keepers={{
            fit: "Under 12 and up",
            what: <>you mark your keepers (Keen keeper, under Role) and they share goal. Everyone else rotates through the lines.</>,
          }}
          equal={{ fit: "Under 6 and Under 7", what: <>4 a side, no keeper and no lines: kids just play, and Siren evens out their minutes.</> }}
        />
      </HelpSection>

      <HelpSection id="scoring" title="Scoring">
        <GoalScoring />
        <HelpFigure
          src="/help-screenshots/soccer/scoring.png"
          alt="The Who scored? sheet over a football game, with the attackers first, Not sure who and Own goal (theirs)"
          caption="Who scored? after + Goal."
        />
      </HelpSection>

      <HelpSection id="subs" title="Subs">
        <SoccerFamilySubs
          terms={TERMS}
          name="Rolling subs"
          how={<>any time, as often as you like.</>}
          replaceKeeper={<>on the keeper: pick who goes in goal now. A field kid swaps places with the keeper, or a bench kid comes on in goal.</>}
        />
        <HelpFigure
          src="/help-screenshots/soccer/pairs.png"
          alt="The football pairs sheet with a sub due: numbered pairs by line, and Make all swaps"
          caption="The pairs, with a sub due."
        />
      </HelpSection>

      <HelpSection id="keeper" title="The keeper">
        <P>
          One kid keeps goal for the half, and can be changed mid-half: tap the keeper, then More, then{" "}
          <B>Replace keeper</B>. Before kick-off the lineup&apos;s <B>Keeper</B> card says who starts in goal. At
          half-time the 2nd half&apos;s plan picks the next keeper:
        </P>
        <KeeperPicking period="half" />
      </HelpSection>

      <HelpSection id="breaks" title="Half-time and full time">
        <BreakBasics
          terms={TERMS}
          title="2nd half lineup"
          rotate={<>the plan&apos;s keeper stays, and everyone else moves up a line: defence to midfield to attack, and back.</>}
          extra={
            <P>
              The break checks the lineup against your rules: nobody in goal, a kid who kept goal last half (with
              everyone having a turn), a kid who&apos;d rather not go in goal, or a kid outside their <B>Plays as</B>. Tap{" "}
              <B>Start 2nd half</B>; with a rule broken it reads <B>Start anyway</B>.
            </P>
          }
        />
        <HelpFigure
          src="/help-screenshots/soccer/break.png"
          alt="The football half-time break: the score, the 2nd half lineup by line with the keeper, the bench, and Start 2nd half"
          caption="Half-time: the 2nd half lineup."
        />
        <FullTimeBasics check={<>Check the score with the other team.</>} />
        <HelpFigure
          src="/help-screenshots/soccer/fulltime.png"
          alt="The football full-time review: the final score, the goal scorers, minutes and time in goal, with Finish game"
          caption="The full-time review: minutes, goals and time in goal."
        />
      </HelpSection>

      <HelpSection id="rules" title="Age groups and junior rules">
        <AgeGroupTable sport="soccer" extra={SOCCER_FAMILY_COLUMNS} />
        <LockedLaws
          laws={[
            { text: "No scores or ladders are kept (Under 6 to Under 11)", source: "Football Australia MiniRoos" },
            { text: "Subs roll on and off at any time, as often as you like", source: "Football Australia MiniRoos" },
            { text: "No offside (Under 6 to Under 11)", source: "Football Australia MiniRoos" },
          ]}
        />
        <P>
          Everyone plays at least 50% of the game by default (Football Australia makes equal time a priority); change it
          in How we play.
        </P>
      </HelpSection>

      <HelpSection id="faq" title="Football questions">
        <QA q="Why won't Siren sub my keeper off?">
          <p>Rolling subs never move the keeper. Use Replace keeper, or wait for half-time.</p>
        </QA>
        <QA q="A kid doesn't want to go in goal.">
          <p>
            Turn off <B>Takes a turn in goal</B> in their Role. Siren won&apos;t put them in, and the break flags it if
            you do.
          </p>
        </QA>
        <QA q="Our Under 10s play 7 a side.">
          <p>Change the players on the field in Game settings (Under 10 goes from 7 to 9), or for the team on the Team tab.</p>
        </QA>
      </HelpSection>
    </SportHub>
  );
}
