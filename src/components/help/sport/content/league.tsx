import { HelpFigure, HelpCallout } from "@/components/help/HelpPage";
import { B, H3, HelpSection, P, QA, UL } from "@/components/help/prose";
import { AgeGroupTable } from "@/components/help/sport/AgeGroupTable";
import { RugbyField, RugbyStrategies, RugbySubs } from "@/components/help/sport/content/rugby";
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
  period: "quarter or half",
  tag: "Q",
  surface: "field",
  startCue: "the whistle goes",
  endCue: "the whistle",
  lineCode: "FWD",
};

export function LeagueHelp({ hub }: { hub: SportHelp }) {
  return (
    <SportHub
      hub={hub}
      intro={
        <>
          Junior rugby league in Siren: forwards and backs, rolling subs, and the junior laws kept for you: the FR and
          DH vests, kickoff and goal-kick turns, and every kid&apos;s unbroken periods.
        </>
      }
    >
      <HelpSection id="how-it-runs" title="How Siren runs rugby league">
        <UL>
          <li>Under 6 to Under 9 play four 8-minute quarters; from Under 10, two halves.</li>
          <li>
            Kids play in the <B>Forwards</B> or the <B>Backs</B>, with more forwards as they get older (3 at Under 6, 6
            from Under 12).
          </li>
          <li>Rolling subs on a timer, planned so time evens out and the laws are kept.</li>
          <li>
            Under 6 to Under 12 play the National Junior League Laws, and Siren keeps them. From Under 13 the
            international laws apply: no vests or kick turns, and penalty and field goals count.
          </li>
        </UL>
      </HelpSection>

      <HelpSection id="live" title="The live game">
        <LiveScreenBasics
          terms={TERMS}
          start={
            <>
              <B>Start Q1</B> (<B>Start H1</B> from Under 10)
            </>
          }
          startNow={<B>Start Q1 now</B>}
          field={<RugbyField />}
          extra={
            <P>
              From Under 8 to Under 12, the vest wearers carry a small <B>FR</B> (yellow) or <B>DH</B> (pink) flag, and
              each period opens with <B>Who kicks off? It goes round the team.</B>
            </P>
          }
        />
        <HelpFigure
          src="/help-screenshots/rugby-league/live.png"
          alt="A rugby league live game: the score and clock, forwards at the top and backs at the bottom with FR and DH flags, and the bench"
          caption="An Under 9 quarter, with the FR and DH vests on."
        />
      </HelpSection>

      <HelpSection id="positions" title="Forwards, backs and rotations">
        <RugbyStrategies
          named={
            <>
              from Under 10 (★ from Under 13): kids get home positions from the standard list: prop, hooker, second row,
              lock, halfback, five-eighth, centre, wing, fullback.
            </>
          }
        />
      </HelpSection>

      <HelpSection id="scoring" title="Scoring">
        <ScoringBasics button={<B>+ Try</B>} />
        <P>
          After a try, from Under 8, the conversion sheet asks <B>Who&apos;s kicking?</B>. Pick the kicker and tap{" "}
          <B>Made</B> or <B>Missed</B>, or <B>Skip</B>.
        </P>
        <ScoreButtons
          rows={[
            { what: "Try", points: "4", ours: "+ Try", theirs: "+T" },
            { what: "Conversion", points: "2", ours: "+ Conversion", theirs: "+C", when: "Under 8" },
            { what: "Penalty goal", points: "2", ours: "+ PG", theirs: "+PG", when: "Under 13" },
            { what: "Field goal", points: "1", ours: "+ FG", theirs: "+FG", when: "Under 13" },
          ]}
        />
        <P>
          The score shows the total with what made it (<B>2T·1C</B>). Scoring is the team&apos;s <B>Track points</B>{" "}
          setting (Team › Game-day extras).
        </P>
        <HelpFigure
          src="/help-screenshots/rugby-league/scoring.png"
          alt="The Who scored? sheet over a rugby league game, listing the kids on the field"
          caption="Who scored? after + Try; the conversion comes next."
        />
      </HelpSection>

      <HelpSection id="subs" title="Subs">
        <RugbySubs
          terms={TERMS}
          extra={
            <P>
              Siren never suggests taking off a vest wearer, or a kid who needs this period for their unbroken time,
              and only says a sub is due when there&apos;s a legal swap to make.
            </P>
          }
        />
        <HelpFigure
          src="/help-screenshots/rugby-league/pairs.png"
          alt="The rugby league pairs sheet with a sub due: numbered pairs coming off and on, and Make all swaps"
          caption="The pairs, with a sub due."
        />
      </HelpSection>

      <HelpSection id="junior-laws" title="Vests, kicks and unbroken periods">
        <H3>First Receiver and Dummy Half vests (Law 12)</H3>
        <P>
          From Under 8 a First Receiver wears the yellow vest; from Under 9 a Dummy Half wears the pink one too, to
          Under 12. Each period a different kid wears each vest, and no kid wears the same vest twice in a game.
        </P>
        <UL>
          <li>
            On the lineup screen, the <B>Vest rotation plan</B> picks a wearer for every period from fairness. Tap a
            pick to swap it, or pick the first wearers yourself with <B>Make First Receiver</B> and{" "}
            <B>Make Dummy Half</B> in a field kid&apos;s actions.
          </li>
          <li>
            If a wearer comes off, Siren asks who takes the vest. To pass it on for the rest of the period, tap the
            wearer, then More, then <B>Replace First Receiver</B> (or Dummy Half).
          </li>
          <li>
            How we play › <B>Vests</B> sets how they&apos;re picked: <B>Auto-fair</B> (whoever has worn it least),{" "}
            <B>Fixed order</B> (round the squad by jersey number) or <B>Coach picks</B>.
          </li>
        </UL>
        <H3>Kickoff turns (Law 16)</H3>
        <P>
          Under 8 to Under 12: kick-offs go round the team. At the start of each period, tap <B>Pick</B> on{" "}
          <B>Who kicks off?</B>: kids on the field who&apos;ve kicked off least come first (<B>K 1 · next</B>). Not
          tracking it? Tap <B>Skip</B>.
        </P>
        <H3>Goal-kick turns (Law 15)</H3>
        <P>
          Under 8 to Under 12: once a kid has kicked at goal, they don&apos;t kick again until everyone on the field has
          had a turn. The conversion sheet lists who&apos;s next and marks kids who&apos;ve already kicked this round;
          tiles show a small <B>K1</B>. <B>Force</B> covers the laws&apos; exception for a kid fouled while scoring.
        </P>
        <H3>Unbroken periods (Law 6)</H3>
        <P>
          Every kid plays two whole quarters without coming off (Under 6 to Under 9), or one whole half (Under 10 to
          Under 12). Siren always keeps it: the planned sub never takes off a kid who needs this period, and a note at
          the top names who must <B>Stay on to the hooter</B> or <B>Play all next quarter</B>. The Stats tab lists any
          shortfalls.
        </P>
        <HelpCallout type="note">
          Under 13 and up play the international laws: none of these four apply.
        </HelpCallout>
      </HelpSection>

      <HelpSection id="breaks" title="Breaks and full time">
        <BreakBasics
          terms={TERMS}
          title="Q2 lineup"
          rotate={<>forwards and backs swap lines, keeping the split, with the kids who&apos;ve played least going on.</>}
          extra={
            <P>
              From Under 8 a <B>Vests</B> chip (<B>FR Kira · DH Maya</B>) shows next period&apos;s wearers; tap it to
              change them. Halves read <B>2nd half lineup</B> and <B>Start 2nd half</B>. If a law would be broken,
              Start says how many and asks before you go on.
            </P>
          }
        />
        <HelpFigure
          src="/help-screenshots/rugby-league/break.png"
          alt="The rugby league quarter-time break: the score, the vests chip, the Q2 lineup in forwards and backs, and Start Q2"
          caption="Quarter time, with the next vest wearers."
        />
        <FullTimeBasics check={<>Check the score with the other team.</>} />
        <HelpFigure
          src="/help-screenshots/rugby-league/fulltime.png"
          alt="The rugby league full-time review: the final score, try scorers and everyone's minutes, with Finish game"
          caption="The full-time review, before Finish game."
        />
      </HelpSection>

      <HelpSection id="rules" title="Age groups and junior rules">
        <AgeGroupTable
          sport="rugby_league"
          extra={[
            {
              title: "Vests",
              value: (ag) => (ag.vestRequirements?.dh ? "FR and DH" : ag.vestRequirements?.fr ? "FR" : "None"),
            },
            { title: "Kicking", value: (ag) => (ag.kickingAllowed === false ? "No" : "Yes") },
          ]}
        />
        <LockedLaws
          laws={[
            { text: "Every kid plays their unbroken periods", source: "NRL Junior League Laws §6" },
            { text: "Each vest is worn by a different player each period", source: "NRL Junior League Laws §12" },
            { text: "Everyone plays at least 50% of the game (change it under Our league is different)", source: "Siren default" },
          ]}
        />
      </HelpSection>

      <HelpSection id="faq" title="Rugby league questions">
        <QA q="Why won't Siren sub my FR off?">
          <p>
            The vest wearer stays on for the period. To change who wears it, tap them, then More, then Replace First
            Receiver.
          </p>
        </QA>
        <QA q="We don't kick conversions at Under 7. Will the sheet still open?">
          <p>No. Under 6 and Under 7 don&apos;t kick, so a try is just the try.</p>
        </QA>
        <QA q="Our competition subs only at the breaks.">
          <p>
            Add the rule <B>Subs only at the breaks</B> in How we play: Siren stops the rolling subs and plans the
            changes at each break.
          </p>
        </QA>
      </HelpSection>
    </SportHub>
  );
}
