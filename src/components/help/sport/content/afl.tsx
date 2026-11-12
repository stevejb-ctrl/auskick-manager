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

const TERMS: SportTerms = {
  period: "quarter",
  tag: "Q",
  surface: "field",
  startCue: "the siren goes",
  endCue: "the siren",
  lineCode: "FWD",
};

export function AflHelp({ hub }: { hub: SportHelp }) {
  return (
    <SportHub
      hub={hub}
      intro={
        <>
          Junior AFL in Siren: four quarters, three lines (forward, centre and back), and rolling subs on a timer, so
          every kid gets a fair share of the ground and of each line.
        </>
      }
    >
      <HelpSection id="how-it-runs" title="How Siren runs AFL">
        <UL>
          <li>Four quarters at every age, with the quarter length your age group plays.</li>
          <li>
            Kids play in three lines: <B>Forward</B>, <B>Centre</B> and <B>Back</B>. Under 8 to Under 10 rotate
            through the zones; from Under 11 lines and positions are up to you.
          </li>
          <li>
            Rolling subs: Siren counts down to the next sub and says who comes off for whom, picking the kids with
            the most time on and the least.
          </li>
          <li>
            Goals and behinds, if your team keeps score. Most juniors don&apos;t until about Under 11, so scoring
            starts off for the younger ages.
          </li>
        </UL>
      </HelpSection>

      <HelpSection id="live" title="The live game">
        <LiveScreenBasics
          terms={TERMS}
          field={
            <>
              Drawn as an oval: <B>FORWARD</B> at the top, <B>CENTRE</B> in the middle, <B>BACK</B> at the bottom. Each
              kid is their name with one line of words under it: their part in the next sub, <B>Needs 6′ more</B>{" "}
              when they&apos;re under the minimum, or <B>INJ</B>, <B>HOME</B> or <B>LENT</B>.
            </>
          }
          bar={
            <>
              or <B>Make all swaps</B> when a sub is due
            </>
          }
        />
        <HelpFigure
          src="/help-screenshots/afl/live.png"
          alt="An AFL live game mid-quarter: the score and clock at the top, the next sub counting down, kids in the forward, centre and back lines, and the bench"
          caption="An AFL quarter under way, the next sub a few seconds off."
        />
        <P>
          On a big field (14 or more a side, with positions on), the field is drawn as a formation with each
          kid&apos;s position (<B>CHB</B>, <B>FF</B>, <B>LW</B>…), and tapping two field kids trades their positions.
        </P>
      </HelpSection>

      <HelpSection id="positions" title="Lines and rotations">
        <P>
          Siren splits the field evenly across the lines, the spare kid going to the centre first, then the back (12 on
          is 4-4-4; 11 is 4-4-3). It tracks each kid&apos;s time in each line this game and this season, and plans
          subs and breaks so it evens out.
        </P>
        <Strategies
          items={[
            {
              label: "Suggested",
              fit: "zoned ages",
              what: "fair time for everyone, and every kid plays each zone through the game.",
            },
            { label: "Rotate lines", what: "each break, everyone moves up a line: back to centre to forward." },
            { label: "Keep last quarter", what: "the same lines as last quarter." },
            { label: "Set manually", what: "you place every kid yourself." },
            { label: "Free rotation", fit: "from Under 11, before positions", what: "fair minutes, no fixed lines." },
            {
              label: "Preferred lines",
              fit: "Under 11 and Under 12",
              what: "each kid has a home line, with time on the others too.",
            },
            { label: "Set positions", fit: "Under 13 and up", what: "named positions, with an editor for each kid's." },
          ]}
        />
        <P>
          <B>Season balance</B> (Off, Light, Balanced, Strong) sets how hard Siren evens out lines over the season, and
          you can add rules like <B>Nobody sits out twice in a row</B> or <B>Keep players apart</B>. See{" "}
          <HelpLink href="/help/rotations">Rotations</HelpLink>.
        </P>
      </HelpSection>

      <HelpSection id="scoring" title="Scoring">
        <ScoringBasics
          button={<B>+ Goal</B>}
          unknown="Didn't see who (no scorer)"
          scorers={
            <>
              Any kid can score: the list shows the field first, forward to back, then the bench. For a behind there&apos;s
              also <B>Rushed (no scorer)</B>.
            </>
          }
        />
        <ScoreButtons
          rows={[
            { what: "Goal", points: "6", ours: "+ Goal", theirs: "+G" },
            { what: "Behind", points: "1", ours: "+ Behind", theirs: "+B" },
          ]}
        />
        <P>
          The score shows like a real scoreboard: the total in big numbers with goals and behinds beside it (2.1 13).
          Scoring is the team&apos;s <B>Track goals &amp; behinds</B> setting, under Team › Game-day extras.
        </P>
        <HelpFigure
          src="/help-screenshots/afl/scoring.png"
          alt="The Who scored? sheet over an AFL game, listing the kids to pick from"
          caption="Who scored? opens after + Goal."
        />
      </HelpSection>

      <HelpSection id="subs" title="Subs">
        <RollingSubs terms={TERMS} />
        <HelpFigure
          src="/help-screenshots/afl/pairs.png"
          alt="The AFL pairs sheet with a sub due: numbered pairs of kids coming off and on, each with Make, and Make all swaps"
          caption="The pairs, with a sub due."
        />
        <KidActions
          items={[
            { label: "Switch player", what: "your next tap swaps their line with a teammate, or subs them off." },
            { label: "Keep on field", what: "never subbed off, for a kid who needs extra time." },
            { label: "Keep in Fwd / Centre / Back", what: "they can sub off and on, but only to that line." },
            { label: "Mark injured", what: "to the bench and out of the rotation; Siren asks who comes on." },
            { label: "Went home", what: "off for the rest of the game." },
            {
              label: "Lend to opposition",
              what: "for a short opposition. It shows the kid's season loan minutes against the squad average.",
            },
          ]}
        />
        <P>
          A kept kid&apos;s bar says <B>Let them rotate again</B>. An injured kid gets <B>Back on</B>; a lent one{" "}
          <B>Bring Mia back</B>.
        </P>
        <P>
          <B>Plan Q2</B> at the end of the info line (and in ⋯) lets you pin the next quarter&apos;s lineup before the
          siren: Suggested, Rotate lines or Set manually.
        </P>
      </HelpSection>

      <HelpSection id="breaks" title="Quarter breaks and full time">
        <P>
          At the siren a <B>Quarter complete</B> card shows the score on the siren, with +G and +B for each side, so a
          kick after the siren still counts. Tap <B>Select team for Q2</B>.
        </P>
        <BreakBasics
          terms={TERMS}
          title="Q2 lineup"
          rotate={<>everyone moves up a line, back to centre to forward, keeping the line sizes.</>}
          extra={
            <P>
              The break&apos;s Game settings also changes the on-field size. If you pinned a plan, the break says{" "}
              <B>Pre-filled from your planned Q2 lineup</B>. Tap <B>Start Q2</B>, then <B>Start Q2 now</B> when the
              siren goes.
            </P>
          }
        />
        <HelpFigure
          src="/help-screenshots/afl/break.png"
          alt="The AFL quarter-time break: the score, the Q2 lineup across the forward, centre and back lines, the bench, and Start Q2"
          caption="Quarter time: the next lineup, ready to tweak."
        />
        <FullTimeBasics check={<>Check the score with the other coach.</>} />
        <HelpFigure
          src="/help-screenshots/afl/fulltime.png"
          alt="The AFL full-time review: the final score, the goal kickers and everyone's minutes, with Finish game"
          caption="The full-time review, before Finish game."
        />
      </HelpSection>

      <HelpSection id="rules" title="Age groups and junior rules">
        <P>Siren sets each age group&apos;s field, quarters and scoring from the AFL junior rules:</P>
        <AgeGroupTable sport="afl" />
        <P>
          The numbers on the field are a default: change them for a game in Game settings, or for the team under{" "}
          <B>Players on the field</B>. Scoring is a default too.
        </P>
        <LockedLaws
          laws={[
            { text: "Kids play in zones and rotate through back, centre and forward (Under 8 to Under 10)", source: "AFL Junior Rules (May 2024)" },
            { text: "Everyone plays at least 50% of the game", source: "AFL Junior Rules (May 2024)" },
          ]}
        />
        <P>
          Your league is different? <B>Our league is different ›</B> turns zones off (or on) for your age group, and
          sets the minimum game time anywhere from 50% to 75%.
        </P>
      </HelpSection>

      <HelpSection id="faq" title="AFL questions">
        <QA q="Why didn't Siren take off the kid who just came on?">
          <p>
            It won&apos;t take a kid off who&apos;s only just come on, or bring straight back one who&apos;s just gone
            off, inside the same sub interval.
          </p>
        </QA>
        <QA q="A goal was kicked after the siren. Can I still add it?">
          <p>
            Yes: the Quarter complete card has +G and +B for each side. Later, tap the score for Scores and fixes.
          </p>
        </QA>
        <QA q="Can I play 15 or 18 a side?">
          <p>
            Yes. Under 13 to Under 15 default to 15, Under 16 to Under 18 to 18 (16 for girls). With 14 or more on and
            positions on, the field shows positions, not just lines.
          </p>
        </QA>
        <QA q="Does the team song play?">
          <p>
            If you turn on <B>Team song</B> under Team › Game-day extras, it plays when your team kicks a goal.
          </p>
        </QA>
        <HelpCallout type="tip">
          The first time you set up a lineup, Siren offers a one-minute tour of the live screen. Open it again from ⋯ ›{" "}
          <B>How the live screen works</B>.
        </HelpCallout>
      </HelpSection>
    </SportHub>
  );
}

