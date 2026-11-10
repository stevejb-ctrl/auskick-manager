import { B, HelpLink, P, UL } from "@/components/help/prose";
import type { AgeGroupColumn } from "@/components/help/sport/AgeGroupTable";
import { KidActions, RollingSubs, Strategies, type SportTerms } from "@/components/help/sport/shared";
import type { TouchAgeGroupConfig } from "@/lib/sports/touch/types";

// What touch football and Oztag share: one engine with lanes (middles,
// links, wings), subs on the fly, the mixed rule and the same How we
// play strategies. Each passes its own words, presets and laws.

/** The lanes, as both draw them. */
export function Lanes({ sizes }: { sizes: React.ReactNode }) {
  return (
    <P>
      The lanes run up the field: <B>Middles</B> (M) in the centre, <B>Links</B> (L) either side of them and{" "}
      <B>Wings</B> (W) on the edges. {sizes} Change the split under <B>Lanes</B> in the lineup&apos;s Game settings.
    </P>
  );
}

/** How we play's three strategies. */
export function LaneStrategies({
  minutes,
  rotate,
}: {
  minutes: string;
  rotate: string;
}) {
  return (
    <>
      <Strategies
        items={[
          { label: "Minutes only", fit: minutes, what: "no positions: kids just play, and Siren evens out their minutes." },
          { label: "Rotate positions", fit: rotate, what: "every kid takes turns at middle, link and wing, evened out over the season." },
          {
            label: "Home position",
            fit: "older teams that specialise",
            what: "each kid has a home lane, with time in the others too. Subs come on into their home lane when they can.",
          },
        ]}
      />
      <P>
        Set a kid&apos;s home lane in their <B>Role</B> on the Squad tab. See{" "}
        <HelpLink href="/help/rotations">Rotations</HelpLink> for season balance and the minimum.
      </P>
    </>
  );
}

/** Subs on the fly, made when you have the ball. */
export function TouchSubs({ terms, how }: { terms: SportTerms; how: React.ReactNode }) {
  return (
    <>
      <P>{how}</P>
      <RollingSubs terms={terms} dueHint={<B>make the change next time you have the ball</B>} />
      <P>
        A kid who comes off rests one sub interval before going back on. Subs only stop when the next one would land
        after the whistle.
      </P>
      <KidActions
        items={[
          { label: "Switch player", what: "your next tap swaps them with a teammate or a bench kid." },
          { label: "Move to middles / links / wings", what: "they play that lane from now." },
          { label: "Take off, no replacement", what: "the side plays one short until you sub someone on." },
          { label: "Keep on field", what: "never subbed off." },
          { label: "Mark injured", what: "off and out of the rotation; Siren asks who comes on." },
          { label: "Went home", what: "off for the rest of the game." },
          { label: "Lend to opposition", what: "when the other team is short." },
        ]}
      />
    </>
  );
}

/** The mixed rule: a cap on boys, kept in every lineup and sub. */
export function MixedRule({ preset }: { preset: React.ReactNode }) {
  return (
    <>
      <P>
        A mixed team keeps a cap on boys on the field. Turn on <B>Mixed team</B> when you make the team, or on the Team
        tab under Season, where you set <B>Most boys</B>, <B>Fewest girls</B> and <B>Fewest boys</B> for your
        competition. {preset}
      </P>
      <P>
        Mark each kid <B>Girl</B> or <B>Boy</B> on the Squad tab (Siren asks at the lineup for anyone you missed). It&apos;s
        used only for the rule: a small G or B on your lineup and live game. Parents and the game-day link never see it.
      </P>
      <UL>
        <li>
          Every suggested lineup and sub keeps the rule, and boys and girls are evened separately: at the cap a boy only
          comes on for a boy.
        </li>
        <li>
          The info line keeps count (<B>Mixed rule · Boys on 3 of 3 max (at least 1) · Girls on 2 (at least 1)</B>). If a
          lineup breaks it, a strip shows what&apos;s wrong with a <B>Fix</B> button.
        </li>
        <li>
          Short of girls, the field shrinks to what the rule allows, and Siren says so (<B>You can field 4: 3 boys and 1
          girl</B>).
        </li>
        <li>
          A swap you make by hand that breaks the rule asks first: <B>Swap anyway</B> or <B>Pick someone else</B>. Kids
          who would break it are dimmed when you pick a kid.
        </li>
      </UL>
    </>
  );
}

/** The age table's lanes column, from each age group's shapes. */
export const LANES_COLUMN: AgeGroupColumn = {
  title: "Lanes (M-L-W)",
  value: (ag) => ((ag as TouchAgeGroupConfig).shapes?.[ag.defaultOnFieldSize] ?? []).map((s) => s.id).join(", ") || "—",
};
