import { B, HelpLink, P, UL } from "@/components/help/prose";
import type { AgeGroupColumn } from "@/components/help/sport/AgeGroupTable";
import { KidActions, RollingSubs, ScoreButtons, ScoringBasics, Strategies, type SportTerms } from "@/components/help/sport/shared";
import type { SoccerAgeGroupConfig } from "@/lib/sports/soccer/types";

// What football (soccer), futsal and hockey share: one engine, with a
// keeper slot, lines and shapes, rolling subs and the same keeper
// strategies. Each sport passes its own words and keeper rule.

/** The age table's keeper and shape columns, from each age group's config. */
export const SOCCER_FAMILY_COLUMNS: AgeGroupColumn[] = [
  {
    title: "Keeper",
    value: (ag) => {
      const k = (ag as SoccerAgeGroupConfig).keeper;
      return k === "none" ? "None" : k === "turns" ? "Everyone has a turn" : "Named keepers";
    },
  },
  {
    title: "Shapes",
    value: (ag) => {
      const shapes = (ag as SoccerAgeGroupConfig).formations?.[ag.defaultOnFieldSize] ?? [];
      return shapes.map((f) => (f.id === "no-lines" ? "No lines" : f.id)).join(", ") || "—";
    },
  },
];

/** The lines, the shape and how the suggester uses them. */
export function SoccerLines({
  lines,
  shapeNote,
  noLines,
}: {
  /** The lines, front to back as kids' tiles name them: "Attack (ATT)". */
  lines: React.ReactNode;
  /** How shapes read and where to change them. */
  shapeNote: React.ReactNode;
  /** The youngest ages' format, without lines. */
  noLines?: React.ReactNode;
}) {
  return (
    <>
      <P>
        Kids play in lines: {lines}, with the keeper in goal. {shapeNote} Siren tracks each kid&apos;s time in each line
        and in goal, this game and this season, and moves kids through the lines so nobody is always stuck at the back.
      </P>
      {noLines ? <P>{noLines}</P> : null}
      <P>
        Each kid&apos;s <B>Role</B> (Squad tab, or How we play) can say <B>Plays as</B> (the lines they play),{" "}
        <B>Takes a turn in goal</B> and <B>Keen keeper</B>.
      </P>
    </>
  );
}

/** How we play's three ways to share goal. */
export function KeeperStrategies({
  turns,
  keepers,
  equal,
}: {
  turns: { what: React.ReactNode; fit: string };
  keepers: { what: React.ReactNode; fit: string };
  equal?: { what: React.ReactNode; fit: string };
}) {
  return (
    <Strategies
      items={[
        { label: "Everyone has a turn in goal", ...turns },
        { label: "Keepers", ...keepers },
        ...(equal ? [{ label: "Equal minutes", ...equal }] : []),
      ]}
    />
  );
}

/** Who goes in next, the same in all three sports. */
export function KeeperPicking({ period }: { period: string }) {
  return (
    <UL>
      <li>
        <B>Everyone has a turn</B>: the fewest keeper minutes go in next (this season and this game), then a keen
        keeper, then the least game time. Kids marked not to go in goal never do, and last {period}&apos;s keeper goes
        in again only if nobody else can.
      </li>
      <li>
        <B>Keepers</B>: your keen keepers take turns, the fewest keeper minutes first. With nobody named, the keeper
        stays in goal.
      </li>
      <li>
        Rolling subs never take the keeper off. If the goal is empty, the top of the screen says{" "}
        <B>No keeper: put someone in goal.</B> with <B>Pick</B>.
      </li>
    </UL>
  );
}

/** Scoring: goals, the same in all three. */
export function GoalScoring() {
  return (
    <>
      <ScoringBasics
        button={<B>+ Goal</B>}
        scorers={
          <>
            The list puts attack first and the bench last. There&apos;s also <B>Own goal (theirs)</B>: it counts for you,
            credited to nobody.
          </>
        }
      />
      <ScoreButtons rows={[{ what: "Goal", points: "1", ours: "+ Goal", theirs: "+G" }]} />
      <P>
        Scoring is the team&apos;s <B>Track goals</B> setting (Team › Game-day extras). With it off, the top of the
        screen says <B>No score kept</B> and the bar just says to tap a kid for swaps.
      </P>
    </>
  );
}

/** Rolling (or flying) subs and the kid's actions. */
export function SoccerFamilySubs({
  terms,
  name,
  how,
  replaceKeeper,
}: {
  terms: SportTerms;
  /** "Rolling subs", "Flying subs". */
  name: string;
  /** The sport's sub law, as How we play says it. */
  how: React.ReactNode;
  /** What Replace keeper does in this sport. */
  replaceKeeper: React.ReactNode;
}) {
  return (
    <>
      <P>
        <B>{name}</B>: {how} Siren suggests bringing on the bench kid with the least time for the outfield kid with the
        most, in the same line, and a kid who comes off rests one sub interval before going back on.
      </P>
      <RollingSubs terms={terms} />
      <KidActions
        items={[
          { label: "Switch player", what: "your next tap swaps them with a teammate or a bench kid." },
          { label: "Replace keeper", what: replaceKeeper },
          { label: "Keep on field", what: "never subbed off (outfield kids)." },
          { label: "Mark injured", what: "to the bench and out of the rotation; Siren asks who comes on." },
          { label: "Went home", what: "off for the rest of the game." },
          { label: "Lend to opposition", what: "when the other team is short; Siren asks who comes on." },
        ]}
      />
      <P>
        Playing a kid short? The screen says <B>Playing 6 of 7. Borrow a player, or play on.</B> See{" "}
        <HelpLink href="/help/live-game">the live screen</HelpLink> for late arrivals and loans.
      </P>
    </>
  );
}
