import { B, HelpLink, P } from "@/components/help/prose";
import { KidActions, RollingSubs, Strategies, type SportTerms } from "@/components/help/sport/shared";

// What rugby league and rugby union share: the same live screen
// (LeagueLiveGame), forwards and backs, the same rolling subs and the
// same How we play strategies. Each hub adds its own laws and scoring.

/** The field, as both codes draw it. */
export function RugbyField() {
  return (
    <>
      A pitch with the <B>Forwards</B> at the top and the <B>Backs</B> at the bottom. Each kid is their name with one
      line under it: their part in the next sub, <B>Needs 8′ more</B> when they&apos;re under the minimum, or <B>INJ</B>{" "}
      or <B>LENT</B>. With named positions on, each kid shows theirs.
    </>
  );
}

/** Rolling subs in rugby: the shared timer, in seconds, plus the Plays every minute role. */
export function RugbySubs({ terms, extra }: { terms: SportTerms; extra?: React.ReactNode }) {
  return (
    <>
      <RollingSubs
        terms={terms}
        interval={
          <>
            set in seconds (30 to 600) under ⋯ › <B>Game settings</B>, beside the players on the field and{" "}
            <B>Track forward and back time</B>
          </>
        }
        extra={extra}
      />
      <KidActions
        items={[
          { label: "Switch player", what: "your next tap swaps them with a teammate or a bench kid." },
          { label: "Mark injured", what: "to the bench and out of the rotation; Siren asks who comes on." },
          { label: "Went home", what: "off for the rest of the game." },
          { label: "Lend to opposition", what: "when the other team is short." },
        ]}
      />
      <P>
        There&apos;s no keep-on button in rugby. To keep a kid on, give them <B>Plays every minute</B> under their
        Role on the Squad tab: Siren&apos;s subs never take them off.
      </P>
    </>
  );
}

/** How kids rotate between the lines, in both codes. */
export function RugbyStrategies({ named }: { named: React.ReactNode }) {
  return (
    <>
      <Strategies
        items={[
          { label: "Both lines", what: "every kid plays forwards and backs across the season." },
          { label: "Preferred line", what: "kids lean to forwards or backs, with time on the other line too." },
          { label: "Named positions", what: named },
        ]}
      />
      <P>
        Turn on <B>Track forward and back time</B> (Team › How we play) to see each kid&apos;s time in each line. See{" "}
        <HelpLink href="/help/rotations">Rotations</HelpLink> for season balance and your own rules.
      </P>
    </>
  );
}
