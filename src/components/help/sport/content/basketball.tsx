import { HelpFigure, HelpCallout } from "@/components/help/HelpPage";
import { B, HelpLink, HelpSection, P, QA, UL } from "@/components/help/prose";
import { AgeGroupTable } from "@/components/help/sport/AgeGroupTable";
import {
  BreakBasics,
  FullTimeBasics,
  KidActions,
  LiveScreenBasics,
  LockedLaws,
  RollingSubs,
  ScoreButtons,
  ScoringBasics,
  Strategies,
  type SportTerms,
} from "@/components/help/sport/shared";
import { SportHub } from "@/components/help/sport/SportHub";
import type { SportHelp } from "@/lib/help/sports";
import type { BasketballAgeGroupConfig } from "@/lib/sports/basketball/types";

const TERMS: SportTerms = {
  period: "half",
  tag: "H",
  surface: "court",
  startCue: "the ball goes up",
  endCue: "the buzzer",
  lineCode: "G",
};

export function BasketballHelp({ hub }: { hub: SportHelp }) {
  return (
    <SportHub
      hub={hub}
      intro={
        <>
          Junior basketball in Siren: five on court, subs through the table at a dead ball, and up to half the squad
          sitting at once, so fair minutes matter more than anywhere.
        </>
      }
    >
      <HelpSection id="how-it-runs" title="How Siren runs basketball">
        <UL>
          <li>
            Two halves (12 minutes at Under 8, 20 from Under 10), or quarters if your competition plays them: VIC and
            WA domestic play halves, QLD and the ACT quarters.
          </li>
          <li>Five on court (four if you&apos;re short), from a squad of up to 12.</li>
          <li>Subs go at a dead ball through the table. Siren lines up the next ones every interval.</li>
          <li>The clock waits at 0:00 for the real buzzer, since the stadium clock stops in the last minutes.</li>
          <li>From Under 12 Siren counts fouls, and five fouls takes a kid out for the game.</li>
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
              A court with the <B>Forwards</B> and the <B>Guards</B> (G and F on each kid). A kid&apos;s figures show
              their points (<B>8 PTS</B>) and fouls (<B>F3</B>, bold two short of the limit, underlined one short).
            </>
          }
          extra={
            <P>
              At 0:00 the clock holds and reads <B>End H1</B> over <B>Half time</B>. Tap it when the buzzer goes: everyone
              on court is credited the whole half.
            </P>
          }
        />
        <HelpFigure
          src="/help-screenshots/basketball/live.png"
          alt="A basketball live game: the score and clock, five kids on court as guards and forwards with their points, and the bench"
          caption="An Under 12 half under way."
        />
      </HelpSection>

      <HelpSection id="positions" title="Positions and rotations">
        <P>
          Kids play as <B>Guards</B> or <B>Forwards</B>, in a shape picked under <B>Guards and forwards</B> in the
          lineup (2 G · 3 F, or 3 G · 2 F). With positions on, they&apos;re numbered: 1 point guard, 2 shooting guard, 3
          small forward, 4 power forward, 5 centre.
        </P>
        <Strategies
          items={[
            { label: "Equal minutes", fit: "Under 8 and Under 10", what: "no positions; Siren evens out minutes. Mark a ball handler with home Guards in their Role, and Siren keeps one on court." },
            { label: "Guards and forwards", fit: "Under 12 and Under 14", what: "every kid plays both, evened out over the season." },
            { label: "Home line", fit: "Under 16 and up", what: "each kid is a guard or a forward, with time on the other line; subs go guard for guard." },
            { label: "All five positions", what: "1 to 5, the most different positions per kid." },
            { label: "Set positions", what: "a home position plus backups; the bench rotates like-for-like." },
          ]}
        />
        <P>
          See <HelpLink href="/help/rotations">Rotations</HelpLink> for season balance and the game-time minimum.
        </P>
      </HelpSection>

      <HelpSection id="scoring" title="Scoring">
        <ScoringBasics button={<B>+2</B>} />
        <ScoreButtons
          rows={[
            { what: "Free throw", points: "1", ours: "+1", theirs: "+1" },
            { what: "Two (a basket)", points: "2", ours: "+2", theirs: "+2" },
            { what: "Three", points: "3", ours: "+3", theirs: "+3", when: "Under 12" },
          ]}
        />
        <P>
          To Under 10 there are no 3-pointers, so the bar shows just <B>Free throw</B> and <B>Basket</B>. Scoring is the
          team&apos;s <B>Track points</B> setting (Team › Game-day extras); Under 8 keeps no score.
        </P>
        <HelpFigure
          src="/help-screenshots/basketball/scoring.png"
          alt="The Who scored? sheet over a basketball game, for 2 points, listing the kids"
          caption="Who scored? after +2."
        />
      </HelpSection>

      <HelpSection id="subs" title="Subs">
        <RollingSubs
          terms={TERMS}
          dueHint={<B>send them to the table now</B>}
          extra={
            <P>
              In the last 30 seconds before a sub the line says <B>send them to the table, tap them on at the whistle</B>
              . There&apos;s no sub prompt in the last minute of a half or quarter. A kid one foul short of fouling out
              comes off first and goes back on last.
            </P>
          }
        />
        <HelpFigure
          src="/help-screenshots/basketball/pairs.png"
          alt="The basketball pairs sheet with a sub due: numbered pairs, and Make all swaps"
          caption="The pairs, with a sub due: send them to the table."
        />
        <KidActions
          items={[
            { label: "Switch player", what: "your next tap swaps them with a bench kid." },
            { label: "Keep on field", what: "never subbed off (the tile says Kept on court)." },
            { label: "Mark injured", what: "off and out of the rotation; Siren asks who comes on." },
            { label: "Went home", what: "off for the rest of the game." },
            { label: "Lend to opposition", what: "when the other team is short." },
            { label: "Sit out 5 min", what: "for a technical or unsportsmanlike foul: off for five minutes of playing time." },
          ]}
        />
      </HelpSection>

      <HelpSection id="fouls" title="Fouls">
        <P>
          With <B>Track fouls</B> on (on by default from Under 12, under Team › Game-day extras), a kid&apos;s bar has{" "}
          <B>+ Foul</B> with their count (<B>3 of 5</B>), and <B>−</B> to take one back. The button warns one short of the
          limit.
        </P>
        <UL>
          <li>
            The fifth foul fouls them out: Siren asks who comes on (<B>Play one short</B> if nobody), or{" "}
            <B>Cancel, and take back the foul</B>.
          </li>
          <li>
            A fouled-out kid stays out of the rotation. Their actions offer <B>Take back the last foul</B> or{" "}
            <B>Not fouled out</B>.
          </li>
          <li>
            More also has <B>Add a foul</B>, <B>Take back a foul</B> and <B>Clear fouls</B>.
          </li>
        </UL>
        <HelpCallout type="tip">Siren counts each of your kids&apos; personal fouls to rest them in time. The table keeps the official count.</HelpCallout>
      </HelpSection>

      <HelpSection id="breaks" title="Breaks and full time">
        <BreakBasics
          terms={TERMS}
          title="2nd half lineup"
          rotate={<>guards and forwards trade lines, the shape kept.</>}
          extra={
            <P>
              Fouled-out and sitting-out kids are tagged on the bench, and each kid shows their fouls (<B>3F</B>). Tap{" "}
              <B>Start 2nd half</B>, then <B>Start 2nd half now</B> when the whistle goes.
            </P>
          }
        />
        <HelpFigure
          src="/help-screenshots/basketball/break.png"
          alt="The basketball half-time break: the score, the 2nd half lineup of guards and forwards, the bench, and Start 2nd half"
          caption="Half-time: the 2nd half lineup."
        />
        <FullTimeBasics check={<>Check the score with the table.</>} />
        <HelpFigure
          src="/help-screenshots/basketball/fulltime.png"
          alt="The basketball full-time review: the final score, points by kid and minutes, with Finish game"
          caption="The full-time review, before Finish game."
        />
      </HelpSection>

      <HelpSection id="rules" title="Age groups and junior rules">
        <AgeGroupTable
          sport="basketball"
          extra={[
            { title: "3-pointers", value: (ag) => ((ag as BasketballAgeGroupConfig).threePointers ? "Yes" : "No") },
            { title: "Fouls counted", value: (ag) => ((ag as BasketballAgeGroupConfig).tracksFoulsDefault ? "Yes" : "Off (turn on)") },
          ]}
        />
        <P>
          The table shows halves. In quarters (Team › Season › <B>Halves or quarters</B>) each quarter is half a half:
          4 × 6 at Under 8, 4 × 10 from Under 10.
        </P>
        <LockedLaws
          laws={[
            { text: "No zone defence: man-to-man only (Under 8 to Under 14)", source: "Basketball Australia" },
            { text: "No 3-pointers: every basket from play is 2 (Under 8 to Under 10)", source: "Junior domestic by-laws" },
            { text: "Five fouls and a player is out for the game", source: "FIBA" },
          ]}
        />
      </HelpSection>

      <HelpSection id="faq" title="Basketball questions">
        <QA q="The clock says 0:00 but the game's still going.">
          <p>
            That&apos;s on purpose: the stadium clock stops, Siren&apos;s doesn&apos;t. Tap <B>End H1</B> when the buzzer
            goes.
          </p>
        </QA>
        <QA q="I tapped + Foul on the wrong kid.">
          <p>Tap − on their bar, or Take back a foul under More. Add it to the right kid.</p>
        </QA>
        <QA q="Why no sub in the last minute?">
          <p>A sub there would land after the buzzer, and some by-laws allow none. Make one by hand if you need to.</p>
        </QA>
      </HelpSection>
    </SportHub>
  );
}
