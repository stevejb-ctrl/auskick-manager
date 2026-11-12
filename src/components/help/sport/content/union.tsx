import { HelpFigure } from "@/components/help/HelpPage";
import { B, HelpSection, P, QA, UL } from "@/components/help/prose";
import { AgeGroupTable } from "@/components/help/sport/AgeGroupTable";
import { RugbyField, RugbyStrategies, RugbySubs } from "@/components/help/sport/content/rugby";
import {
  BreakBasics,
  FullTimeBasics,
  LiveScreenBasics,
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
  lineCode: "FWD",
};

export function UnionHelp({ hub }: { hub: SportHelp }) {
  return (
    <SportHub
      hub={hub}
      intro={
        <>
          Junior rugby union in Siren: two halves, forwards and backs, rolling subs, and numbered positions from Under
          10, with the front row kept for the kids picked to play it.
        </>
      }
    >
      <HelpSection id="how-it-runs" title="How Siren runs rugby union">
        <UL>
          <li>Two halves at every age, from 10 minutes at Under 6 to 35 at Under 17 and Under 18.</li>
          <li>Kids play in the <B>Forwards</B> or the <B>Backs</B>; the forwards grow from 3 at 7 a side to 8 at 15 a side.</li>
          <li>Rolling subs on a timer, planned so time evens out across the squad and the season.</li>
          <li>
            Union has none of league&apos;s junior laws: no vests, no kickoff or goal-kick turns and no unbroken-period
            rule. The game-time minimum (half the game by default) keeps time fair.
          </li>
        </UL>
      </HelpSection>

      <HelpSection id="live" title="The live game">
        <LiveScreenBasics terms={TERMS} field={<RugbyField />} />
        <HelpFigure
          src="/help-screenshots/rugby-union/live.png"
          alt="A rugby union live game: the score and clock, forwards at the top and backs at the bottom, and the bench"
          caption="An Under 9 half under way."
        />
      </HelpSection>

      <HelpSection id="positions" title="Forwards, backs and positions">
        <RugbyStrategies
          named={
            <>
              from Under 10 (★ from Under 12): positions numbered as on the jersey: LHP1, HK2, THP3, the 2nd row (2R4,
              2R5), BF6, OF7, N8, then HB9, FE10, the wings, the centres and FB15.
            </>
          }
        />
        <P>
          The front row (LHP1, HK2, THP3) goes only to kids picked to play it, for scrum safety. Pick them in each
          kid&apos;s Role on the Squad tab. If a sub or a lineup puts someone else there, Siren says{" "}
          <B>… is at HK2 but isn&apos;t picked to play there</B>, and the break won&apos;t suggest it.
        </P>
      </HelpSection>

      <HelpSection id="scoring" title="Scoring">
        <ScoringBasics button={<B>+ Try</B>} />
        <P>
          After a try, from Under 8, the conversion sheet asks <B>Who&apos;s kicking?</B>: pick the kicker and tap{" "}
          <B>Made</B> or <B>Missed</B>, or <B>Skip</B>. There are no kicking turns in union: any kid can kick.
        </P>
        <ScoreButtons
          rows={[
            { what: "Try", points: "5", ours: "+ Try", theirs: "+T" },
            { what: "Conversion", points: "2", ours: "+ Conversion", theirs: "+C", when: "Under 8" },
            { what: "Penalty goal", points: "3", ours: "+ PG", theirs: "+PG", when: "Under 10" },
            { what: "Drop goal", points: "3", ours: "+ DG", theirs: "+DG", when: "Under 10" },
          ]}
        />
        <P>
          The score shows the total with what made it (<B>2T·1C</B>). Junior union keeps no score until about Under
          12, so <B>Track points</B> (Team › Game-day extras) starts off for the younger ages.
        </P>
        <HelpFigure
          src="/help-screenshots/rugby-union/scoring.png"
          alt="The Who scored? sheet over a rugby union game, listing the kids on the field"
          caption="Who scored? after + Try."
        />
      </HelpSection>

      <HelpSection id="subs" title="Subs">
        <RugbySubs terms={TERMS} />
        <HelpFigure
          src="/help-screenshots/rugby-union/pairs.png"
          alt="The rugby union pairs sheet with a sub due: numbered pairs coming off and on, and Make all swaps"
          caption="The pairs, with a sub due."
        />
      </HelpSection>

      <HelpSection id="breaks" title="Half-time and full time">
        <BreakBasics
          terms={TERMS}
          title="2nd half lineup"
          rotate={<>forwards and backs swap lines, keeping the split; the picked front row stays in the forwards.</>}
          extra={
            <P>
              Tap <B>Start 2nd half</B>, then <B>Start 2nd half now</B> when the whistle goes.
            </P>
          }
        />
        <HelpFigure
          src="/help-screenshots/rugby-union/break.png"
          alt="The rugby union half-time break: the score, the 2nd half lineup in forwards and backs, the bench, and Start 2nd half"
          caption="Half-time: the 2nd half lineup."
        />
        <FullTimeBasics check={<>Check the score with the other team.</>} />
        <HelpFigure
          src="/help-screenshots/rugby-union/fulltime.png"
          alt="The rugby union full-time review: the final score, try scorers and everyone's minutes, with Finish game"
          caption="The full-time review, before Finish game."
        />
      </HelpSection>

      <HelpSection id="rules" title="Age groups and junior rules">
        <AgeGroupTable
          sport="rugby_union"
          extra={[{ title: "Kicking", value: (ag) => (ag.kickingAllowed === false ? "No (tag)" : "Yes") }]}
        />
        <P>
          These follow the Rugby Australia junior pathway. Everyone plays at least 50% of the game by default; set your
          own minimum in How we play.
        </P>
      </HelpSection>

      <HelpSection id="faq" title="Rugby union questions">
        <QA q="Why does Siren say a kid isn't picked to play there?">
          <p>
            They&apos;re in a front-row spot without being picked for it. Swap them out, or add the spot to their Role if
            they&apos;re trained for it.
          </p>
        </QA>
        <QA q="Do vests or kick turns apply?">
          <p>No: those are rugby league&apos;s junior laws. Union kids rotate on the timer and the game-time minimum.</p>
        </QA>
        <QA q="We play 12 a side at Under 10. Can I change it?">
          <p>Yes: Under 10 and Under 11 default to 12 and go up to 15. Change it in Game settings, or for the team.</p>
        </QA>
      </HelpSection>
    </SportHub>
  );
}
