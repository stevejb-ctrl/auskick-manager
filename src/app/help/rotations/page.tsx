// Screenshots referenced on this page:
//   /help-screenshots/rotations-swap-card.png
//   /help-screenshots/rotations-player-tile.png
//   /help-screenshots/rotations-zone-bar.png

import { HelpPage, HelpFigure, HelpCallout } from "@/components/help/HelpPage";
import { B, HelpLink, HelpSection, P, Related, UL } from "@/components/help/prose";

export const metadata = {
  title: "Rotations · Help · Siren",
  description:
    "How Siren plans fair rotations in every sport: what it weighs, the next sub and its pairs, How we play, season balance, the game-time minimum, roles, and keeping a player on.",
  alternates: { canonical: "/help/rotations" },
};

export default function RotationsPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Rotations</h1>
      <P lead>
        Siren watches how much time every kid has had, in each line or position, this game and across the season, and
        suggests subs and lineups that even it out. You never have to do the maths yourself.
      </P>
      <P>
        When it acts depends on the sport. Most sports roll subs during play, on a timer. Netball changes at the
        quarter break. Every sport gets a suggested lineup at each break. Your sport&apos;s page has its lines, its
        strategies and its rules: pick it on the <HelpLink href="/help">help home page</HelpLink>.
      </P>

      <HelpSection id="weighs" title="What Siren weighs">
        <UL>
          <li>
            <B>This game&apos;s minutes</B>: who&apos;s been on longest, and who&apos;s been sitting.
          </li>
          <li>
            <B>The season</B>: time in each line or position across this season&apos;s finished games.
          </li>
          <li>
            <B>Recent subs</B>: a kid who&apos;s just come on isn&apos;t the one taken off, and a kid who&apos;s just
            gone off rests a sub interval.
          </li>
          <li>
            <B>Who&apos;s held</B>: kids kept on, kept in a line or bib, the keeper, vest wearers, kids who need this
            period for a rule.
          </li>
          <li>
            <B>How we play</B>: your rotation style, season balance, each kid&apos;s Role, and your rules (keep apart,
            keep together, nobody sits out twice in a row…).
          </li>
        </UL>
      </HelpSection>

      <HelpSection id="next-sub" title="The next sub and its pairs">
        <P>
          With rolling subs, Siren plans the next sub all the time. The info line counts down (<B>Next sub 2:10 · 3
          swaps</B>), and the kids in it say <B>Off next</B> or <B>On next</B>, with the same number on both kids of a
          pair.
        </P>
        <P>
          Tap the info line for the pairs: each with its line, a <B>Make</B> button, and <B>Make all N swaps</B> at the
          bottom. Tap a name to pick someone else for that side. Making one pair keeps the rest of the plan, and the sub
          clock waits until you&apos;ve made them.
        </P>
        <HelpFigure
          src="/help-screenshots/rotations-swap-card.png"
          alt="The AFL pairs sheet showing two pairs with their lines, Make buttons, and a Make all 2 swaps button"
          caption="The pairs (AFL shown), opened from the info line."
        />
        <P>Each kid on the live screen is their name, with at most one line of words under it:</P>
        <UL>
          <li>
            Their part in the next sub: <B>Off next</B> or <B>On next → FWD</B>, then <B>Off now</B> and{" "}
            <B>On now</B> when it&apos;s due.
          </li>
          <li>
            <B>Needs 6′ more</B>: under the game-time minimum. <B>Sub after next</B> on the bench, or{" "}
            <B>On at the break</B> in netball.
          </li>
          <li>
            <B>INJ</B>, <B>HOME</B> or <B>LENT</B> for a kid out of the rotation.
          </li>
        </UL>
        <HelpFigure
          src="/help-screenshots/rotations-player-tile.png"
          alt="AFL kids on the field, with Off next and On next under their names and a numbered pair badge"
          caption="Kids in the next sub: their part under the name, and the pair's number."
        />
      </HelpSection>

      <HelpSection id="how-we-play" title="How we play">
        <P>
          The <B>How we play</B> section of the Team tab is where you tell Siren how your team rotates. Each sport has
          its own styles, with a ★ on the one suggested for your age group:
        </P>
        <UL>
          <li>
            <B>How kids rotate</B>: from &quot;just even out minutes&quot; to set positions with backups. The names
            follow the sport (Rotate lines, By thirds, Everyone has a turn in goal, Rotate positions…).
          </li>
          <li>
            <B>Season balance</B>: Off, Light, Balanced or Strong, for how hard Siren evens out lines over the season.{" "}
            <B>Reset</B> starts the count again from today, without touching any stats.
          </li>
          <li>
            <B>Rules</B>: add your own, like <B>Keep players apart</B>, <B>Keep players together</B> or{" "}
            <B>Nobody sits out twice in a row</B>, and packs your association uses.
          </li>
          <li>
            The rules Siren keeps for your age group, set by your sport&apos;s junior rules. <B>Our league is
            different ›</B> changes the ones your league plays differently.
          </li>
        </UL>
      </HelpSection>

      <HelpSection id="minimum" title="The game-time minimum">
        <P>
          Every sport has a minimum share of the game, 50% by default. Siren plans subs and breaks so every kid gets
          there, marks a kid who&apos;s short (<B>Needs 6′ more</B>), counts them on the info line (<B>2 under 50%</B>),
          and flags it at the break. Change it in How we play.
        </P>
      </HelpSection>

      <HelpSection id="roles" title="Roles and keeping a kid on">
        <P>
          A kid&apos;s <B>Role</B> (tap them on the Squad tab, or in How we play) says where they play: the lines they
          play as, a home position or lane, and in some sports keeper, front row or <B>Plays every minute</B>. See{" "}
          <HelpLink href="/help/squads">Squads</HelpLink>.
        </P>
        <P>During a game, tap a kid, then More:</P>
        <UL>
          <li>
            <B>Keep on field</B>: never subbed off, for a kid who needs extra time. <B>Let them rotate again</B> undoes it.
          </li>
          <li>
            Keep in a line (AFL&apos;s <B>Keep in Fwd</B>) or a bib (netball&apos;s <B>Keep in GS next break</B>): they
            can rotate, but come back to the same spot.
          </li>
        </UL>
        <HelpCallout type="note">
          Rugby league and union have no keep-on button: give the kid <B>Plays every minute</B> in their Role instead.
        </HelpCallout>
      </HelpSection>

      <HelpSection id="balance" title="Season balance and colours">
        <P>
          The Stats tab&apos;s <B>Season balance</B> card shows each kid&apos;s minutes in each line or position this
          season, tinted wherever a kid is owed at least a quarter (or a half). Aim for an even season, not an even
          single game: single games often sit uneven, and that&apos;s normal.
        </P>
        <P>
          Each sport keeps the same colours for the same areas everywhere: the attacking end, the middle and the
          defending end, on the lineup&apos;s time bars and the Stats cards alike.
        </P>
        <HelpFigure
          src="/help-screenshots/rotations-zone-bar.png"
          alt="Season time bars on the AFL lineup tiles in the forward, centre and back colours, and the same colours on two Player statistics cards"
          caption="The same colours on the lineup screen and the Stats tab (AFL shown)."
        />
      </HelpSection>

      <Related
        links={[
          { href: "/help/live-game", label: "The live screen" },
          { href: "/help/breaks", label: "Breaks" },
          { href: "/help/stats", label: "Stats" },
          { href: "/help/squads", label: "Squads" },
        ]}
      />
    </HelpPage>
  );
}
