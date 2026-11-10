import { HelpFigure, HelpCallout } from "@/components/help/HelpPage";
import { B, HelpSection, P, QA, UL } from "@/components/help/prose";
import { AgeGroupTable } from "@/components/help/sport/AgeGroupTable";
import { LANES_COLUMN, LaneStrategies, Lanes, MixedRule, TouchSubs } from "@/components/help/sport/content/touchFamily";
import {
  BreakBasics,
  FullTimeBasics,
  LiveScreenBasics,
  LockedLaws,
  ScoreButtons,
  ScoringBasics,
  type SportTerms,
} from "@/components/help/sport/shared";
import { SportHub } from "@/components/help/sport/SportHub";
import type { SportHelp } from "@/lib/help/sports";

const TERMS: SportTerms = {
  period: "half",
  tag: "H",
  surface: "field",
  startCue: "the whistle goes",
  endCue: "the whistle",
  lineCode: "WING",
};

export function TouchHelp({ hub }: { hub: SportHelp }) {
  return (
    <SportHub
      hub={hub}
      intro={
        <>
          Junior touch football in Siren: subs rolling on and off through the interchange, kids taking turns at middle,
          link and wing, and a mixed team&apos;s boys&apos; cap kept in every change.
        </>
      }
    >
      <HelpSection id="how-it-runs" title="How Siren runs touch football">
        <UL>
          <li>Under 6 to Under 10 play 5 a side on a half field, two 15-minute halves; from Under 11, 6 a side and 20-minute halves.</li>
          <li>Some juniors play one period with no half-time: switch it under Team › Season › <B>Halves or one period</B>.</li>
          <li>Subs roll on and off through the interchange, as often as you like. Siren plans a fair change on a timer.</li>
          <li>Positions come in from Under 10: before that, Siren just evens out minutes.</li>
          <li>No score is kept to Under 9. A try is 1 point.</li>
        </UL>
      </HelpSection>

      <HelpSection id="live" title="The live game">
        <LiveScreenBasics
          terms={TERMS}
          start={
            <>
              <B>Start H1</B> (<B>Start P1</B> in one period)
            </>
          }
          field={
            <>
              The lanes run up the field: <B>Middles</B>, <B>Links</B> and <B>Wings</B>, with a small M, L or W on each
              kid, and a G or B on a mixed team. The kids&apos; words say their part in the next change.
            </>
          }
          extra={
            <P>
              The clock waits at 0:00 for the referee&apos;s whistle; tap <B>End H1</B> when it goes.
            </P>
          }
        />
        <HelpFigure
          src="/help-screenshots/touch-football/live.png"
          alt="A touch football live game: the score and clock, kids in the middle, link and wing lanes with G and B marks, the mixed-rule count, and the bench"
          caption="An Under 11 mixed team mid-half, with the mixed rule's count."
        />
      </HelpSection>

      <HelpSection id="positions" title="Lanes and rotations">
        <Lanes sizes={<>At 6 a side it&apos;s 2-2-2; at 5 a side 1-2-2.</>} />
        <LaneStrategies minutes="Under 6 to Under 9" rotate="Under 10 and up, as TFA brings positions in from 10" />
      </HelpSection>

      <HelpSection id="scoring" title="Scoring">
        <ScoringBasics button={<B>+T</B>} />
        <ScoreButtons rows={[{ what: "Try", points: "1", ours: "+T", theirs: "+T" }]} />
        <P>
          A kid&apos;s tile shows their tries (<B>2T</B>), and a tapped kid&apos;s bar has <B>+ Try</B>. Scoring is the
          team&apos;s <B>Track tries</B> setting (Team › Game-day extras).
        </P>
        <HelpFigure
          src="/help-screenshots/touch-football/scoring.png"
          alt="The Who scored? sheet over a touch football game, with Not sure who"
          caption="Who scored? after +T."
        />
      </HelpSection>

      <HelpSection id="subs" title="Subs">
        <TouchSubs
          terms={TERMS}
          how={
            <>
              Subs roll on and off through the interchange. The laws allow no interchange after an intercept or line
              break until the next touch, so make the change when you have the ball.
            </>
          }
        />
        <HelpFigure
          src="/help-screenshots/touch-football/pairs.png"
          alt="The touch football pairs sheet with a change due: numbered pairs by lane, and Make all swaps"
          caption="The pairs: make the change next time you have the ball."
        />
      </HelpSection>

      <HelpSection id="mixed" title="Mixed teams">
        <MixedRule
          preset={
            <>
              <B>Use Touch&apos;s rule</B> sets at most 3 boys, and at least 1 girl and 1 boy (TFA rule 5.4).
            </>
          }
        />
      </HelpSection>

      <HelpSection id="breaks" title="Breaks and full time">
        <BreakBasics
          terms={TERMS}
          title="2nd half lineup"
          rotate={<>everyone moves a lane out: middle to link to wing, and back to middle.</>}
          extra={
            <P>
              A mixed team&apos;s break shows the count of boys and girls, and the lineup keeps the rule. Tap{" "}
              <B>Start 2nd half</B>, then <B>Start 2nd half now</B> when the whistle goes.
            </P>
          }
        />
        <HelpFigure
          src="/help-screenshots/touch-football/break.png"
          alt="The touch football half-time break: the score, the 2nd half lineup by lane with the mixed count, the bench, and Start 2nd half"
          caption="Half-time: the 2nd half lineup keeps the mixed rule."
        />
        <FullTimeBasics check={<>Check the score with the referee.</>} />
        <HelpFigure
          src="/help-screenshots/touch-football/fulltime.png"
          alt="The touch football full-time review: the final score, try scorers and minutes, with Finish game"
          caption="The full-time review, before Finish game."
        />
      </HelpSection>

      <HelpSection id="rules" title="Age groups and junior rules">
        <AgeGroupTable sport="touch" extra={[LANES_COLUMN]} />
        <LockedLaws
          laws={[
            { text: "Subs roll on and off through the interchange, as often as you like", source: "TFA rule 17" },
            { text: "No interchange after an intercept or line break until the next touch: change when you have the ball", source: "TFA rule 17.7" },
            { text: "A try is 1 point", source: "TFA rule 14.1" },
            { text: "5 a side on a half field (Under 6 to Under 10)", source: "TFA junior framework" },
          ]}
        />
        <HelpCallout type="note">
          Some laws are the referee&apos;s to keep, and Siren doesn&apos;t track them: the half (the dummy half) can&apos;t
          score a try, for one.
        </HelpCallout>
      </HelpSection>

      <HelpSection id="faq" title="Touch questions">
        <QA q="We don't have enough girls today.">
          <p>Siren shrinks the field to what the rule allows and says how many you can field. Borrow a player, or play short.</p>
        </QA>
        <QA q="Our competition's mixed rule is different.">
          <p>Set Most boys, Fewest girls and Fewest boys under Team › Mixed team, and Save rule.</p>
        </QA>
        <QA q="We play one 30-minute period.">
          <p>Pick One period under Team › Season › Halves or one period, and set its length.</p>
        </QA>
      </HelpSection>
    </SportHub>
  );
}
