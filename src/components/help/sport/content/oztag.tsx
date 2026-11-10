import { HelpFigure } from "@/components/help/HelpPage";
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
  lineCode: "LINK",
};

export function OztagHelp({ hub }: { hub: SportHelp }) {
  return (
    <SportHub
      hub={hub}
      intro={
        <>
          Junior Oztag in Siren: subs on and off from the sub box, minutes evened out across the squad, and in a mixed
          game the boys&apos; cap and the girl&apos;s try.
        </>
      }
    >
      <HelpSection id="how-it-runs" title="How Siren runs Oztag">
        <UL>
          <li>Under 6 to Under 8 play 6 a side on a modified field; from Under 9, 8 a side.</li>
          <li>Two 15-minute halves at every age, or one period if your competition plays it (Team › Season).</li>
          <li>Subs come on and off from the sub box, as often as you like. Siren plans a fair change on a timer.</li>
          <li>Oztag names no positions, so Siren evens out minutes; lanes are there if you want them.</li>
          <li>No score is kept to Under 9. A try is 1 point, and a girl&apos;s try 2 in a mixed game.</li>
        </UL>
      </HelpSection>

      <HelpSection id="live" title="The live game">
        <LiveScreenBasics
          terms={TERMS}
          field={
            <>
              A field with the lanes up it: <B>Middles</B>, <B>Links</B> and <B>Wings</B>, with a G or B on each kid on a
              mixed team. The kids&apos; words say their part in the next change.
            </>
          }
          extra={<P>The clock waits at 0:00 for the whistle; tap <B>End H1</B> when it goes.</P>}
        />
        <HelpFigure
          src="/help-screenshots/oztag/live.png"
          alt="An Oztag live game: the score and clock, eight kids across the lanes with G and B marks, the mixed-rule count, and the bench"
          caption="An Under 10 mixed team mid-half."
        />
      </HelpSection>

      <HelpSection id="positions" title="Lanes and rotations">
        <Lanes
          sizes={
            <>
              At 8 a side it&apos;s 2-4-2 or 4-2-2; at 6 a side 2-2-2. The 7 and 8 a side splits are Siren&apos;s own:
              set yours if your team plays another.
            </>
          }
        />
        <LaneStrategies minutes="every age: Oztag has no set positions" rotate="coaches who want every kid at middle, link and wing" />
      </HelpSection>

      <HelpSection id="scoring" title="Scoring">
        <ScoringBasics button={<B>+T</B>} />
        <ScoreButtons
          rows={[
            { what: "Try", points: "1", ours: "+T", theirs: "+T" },
            { what: "Girl's try (mixed)", points: "2", ours: "+T (credit a girl)", theirs: "+2 (girl)" },
          ]}
        />
        <P>
          Credit a try to a girl and Siren counts 2; <B>Not sure who — a girl&apos;s try</B> counts 2 without a name.
          Scoring is the team&apos;s <B>Track tries</B> setting (Team › Game-day extras).
        </P>
        <HelpFigure
          src="/help-screenshots/oztag/scoring.png"
          alt="The Who scored? sheet over an Oztag game: a girl's try counts 2, with Not sure who and Not sure who, a girl's try"
          caption="Who scored? A girl's try counts 2."
        />
      </HelpSection>

      <HelpSection id="subs" title="Subs">
        <TouchSubs terms={TERMS} how={<>Subs come on and off from the sub box, as often as you like.</>} />
        <HelpFigure
          src="/help-screenshots/oztag/pairs.png"
          alt="The Oztag pairs sheet with a change due: numbered pairs, and Make all swaps"
          caption="The pairs, with a change due."
        />
      </HelpSection>

      <HelpSection id="mixed" title="Mixed teams and the girl's try">
        <MixedRule preset={<>Oztag&apos;s preset is at most 4 boys and at least 1 girl.</>} />
        <P>
          In a mixed Oztag game a girl&apos;s try counts 2 (ITF rule 4.3), and the other team gets a <B>+2 (girl)</B>{" "}
          button. If your competition doesn&apos;t play it, turn off <B>A girl&apos;s try counts 2</B> under Team ›
          Game-day extras.
        </P>
      </HelpSection>

      <HelpSection id="breaks" title="Breaks and full time">
        <BreakBasics
          terms={TERMS}
          title="2nd half lineup"
          rotate={<>everyone moves a lane out: middle to link to wing, and back to middle.</>}
          extra={
            <P>
              Tap <B>Start 2nd half</B>, then <B>Start 2nd half now</B> when the whistle goes.
            </P>
          }
        />
        <HelpFigure
          src="/help-screenshots/oztag/break.png"
          alt="The Oztag half-time break: the score, the 2nd half lineup with the mixed count, the bench, and Start 2nd half"
          caption="Half-time: the 2nd half lineup."
        />
        <FullTimeBasics check={<>Check the score with the referee.</>} />
        <HelpFigure
          src="/help-screenshots/oztag/fulltime.png"
          alt="The Oztag full-time review: the final score, try scorers and minutes, with Finish game"
          caption="The full-time review, before Finish game."
        />
      </HelpSection>

      <HelpSection id="rules" title="Age groups and junior rules">
        <AgeGroupTable sport="oztag" extra={[LANES_COLUMN]} />
        <LockedLaws
          laws={[
            { text: "Subs come on and off from the sub box, as often as you like", source: "ITF rules" },
            { text: "Equal game time: 50 %, give or take 10 %", source: "NSW Junior State Championships" },
            { text: "A try is 1 point; in a mixed game a girl's try is 2", source: "ITF rule 4.3" },
          ]}
        />
        <P>
          Junior Oztag&apos;s modified rules (no marker, the dummy half can run but can&apos;t score) are the
          referee&apos;s to keep: Siren doesn&apos;t track them.
        </P>
      </HelpSection>

      <HelpSection id="faq" title="Oztag questions">
        <QA q="We don't play the girl's try.">
          <p>Turn off A girl&apos;s try counts 2 under Team › Game-day extras. Every try then counts 1.</p>
        </QA>
        <QA q="Do I need lanes?">
          <p>No. Minutes only is the default at every age. Pick Rotate positions or Home position if you use lanes.</p>
        </QA>
      </HelpSection>
    </SportHub>
  );
}
