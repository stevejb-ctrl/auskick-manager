import { HelpFigure, HelpCallout } from "@/components/help/HelpPage";
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
  surface: "court",
  startCue: "the whistle goes",
  endCue: "the whistle",
  lineCode: "WING",
};

export function FutsalHelp({ hub }: { hub: SportHelp }) {
  return (
    <SportHub
      hub={hub}
      intro={
        <>
          Junior futsal in Siren: 5 a side with a keeper at every age, flying subs through the sub zone, and kids moving
          through the back, the wings and the front.
        </>
      }
    >
      <HelpSection id="how-it-runs" title="How Siren runs futsal">
        <UL>
          <li>5 a side with a keeper at every age (down to 3 if you&apos;re short).</li>
          <li>Two halves: 15 minutes to Under 9, 20 from Under 10.</li>
          <li>Flying subs: on and off through the sub zone at any time. Siren plans a fair change on a timer.</li>
          <li>Everyone has a turn in goal to Under 11; from Under 12 your named keepers share it.</li>
          <li>Junior futsal keeps no score to Under 9, so scoring starts off for the youngest.</li>
        </UL>
      </HelpSection>

      <HelpSection id="live" title="The live game">
        <LiveScreenBasics
          terms={TERMS}
          field={
            <>
              A futsal court with the <B>Front</B> at the top, then the <B>Wings</B> and the <B>Back</B>, and the keeper
              in goal. The kids&apos; words say their part in the next change (<B>On next → WING</B>).
            </>
          }
        />
        <HelpFigure
          src="/help-screenshots/futsal/live.png"
          alt="A futsal live game: the score and clock, the court with the front, wings, back and keeper, and the bench"
          caption="An Under 12 half under way."
        />
      </HelpSection>

      <HelpSection id="positions" title="Back, wings and front">
        <SoccerLines
          lines={
            <>
              the <B>Front</B> (FRONT), the <B>Wings</B> (WING) and the <B>Back</B> (BACK): futsal&apos;s pivô, alas and
              fixo in plain words
            </>
          }
          shapeNote={
            <>
              The usual shape is <B>2-2</B> (two back, two up front, no wings); the diamond (<B>1-2-1</B>) and <B>3-1</B>{" "}
              are under <B>Shape</B> in the lineup&apos;s Game settings. A short side plays 2-1, 1-1-1 or 1-1.
            </>
          }
        />
        <KeeperStrategies
          turns={{
            fit: "Under 6 to Under 11",
            what: <>one keeper a half, the fewest keeper minutes first. Mark keen keepers, and kids who&apos;d rather not.</>,
          }}
          keepers={{
            fit: "Under 12 and up",
            what: <>you mark your keepers and they share goal. Everyone else rotates through the back, the wings and the front.</>,
          }}
        />
      </HelpSection>

      <HelpSection id="scoring" title="Scoring">
        <GoalScoring />
        <HelpFigure
          src="/help-screenshots/futsal/scoring.png"
          alt="The Who scored? sheet over a futsal game, with Not sure who and Own goal (theirs)"
          caption="Who scored? after + Goal."
        />
      </HelpSection>

      <HelpSection id="subs" title="Subs">
        <SoccerFamilySubs
          terms={TERMS}
          name="Flying subs"
          how={<>on and off through the sub zone, as often as you like.</>}
          replaceKeeper={<>on the keeper, any time: futsal&apos;s laws let a sub swap with the keeper whenever you like.</>}
        />
        <HelpFigure
          src="/help-screenshots/futsal/pairs.png"
          alt="The futsal pairs sheet with a change due: numbered pairs, and Make all swaps"
          caption="The pairs, with a change due."
        />
      </HelpSection>

      <HelpSection id="keeper" title="The keeper">
        <P>
          One kid keeps goal for the half. To change keeper mid-half, tap the keeper, then More, then{" "}
          <B>Replace keeper</B>. At half-time the 2nd half&apos;s plan picks the next keeper:
        </P>
        <KeeperPicking period="half" />
        <HelpCallout type="note">
          Team fouls and the 2-minute send-off are the referee&apos;s to count: Siren doesn&apos;t track them.
        </HelpCallout>
      </HelpSection>

      <HelpSection id="breaks" title="Half-time and full time">
        <BreakBasics
          terms={TERMS}
          title="2nd half lineup"
          rotate={<>the plan&apos;s keeper stays, and everyone else moves up a line: back to wings to front, and back.</>}
          extra={
            <P>
              Tap <B>Start 2nd half</B>, then <B>Start 2nd half now</B> when the whistle goes.
            </P>
          }
        />
        <HelpFigure
          src="/help-screenshots/futsal/break.png"
          alt="The futsal half-time break: the score, the 2nd half lineup with the keeper, the bench, and Start 2nd half"
          caption="Half-time: the 2nd half lineup."
        />
        <FullTimeBasics check={<>Check the score with the other team.</>} />
        <HelpFigure
          src="/help-screenshots/futsal/fulltime.png"
          alt="The futsal full-time review: the final score, the goal scorers, minutes and time in goal, with Finish game"
          caption="The full-time review, before Finish game."
        />
      </HelpSection>

      <HelpSection id="rules" title="Age groups and junior rules">
        <AgeGroupTable sport="futsal" extra={SOCCER_FAMILY_COLUMNS} />
        <LockedLaws
          laws={[
            { text: "Subs fly on and off at any time through the sub zone, as often as you like", source: "FIFA Futsal Laws of the Game" },
            { text: "A sub can swap with the keeper at any time", source: "FIFA Futsal Laws of the Game" },
            { text: "No scores are kept (Under 6 to Under 9)", source: "Capital Football Minis" },
          ]}
        />
      </HelpSection>

      <HelpSection id="faq" title="Futsal questions">
        <QA q="Can I make a change while the ball's in play?">
          <p>Yes, as the laws allow: flying subs go any time through the sub zone. Siren just suggests when and who.</p>
        </QA>
        <QA q="We play a diamond. Will Siren follow it?">
          <p>Yes: pick 1-2-1 under Shape. Siren also picks the first shape that fits every kid&apos;s Plays as.</p>
        </QA>
      </HelpSection>
    </SportHub>
  );
}
