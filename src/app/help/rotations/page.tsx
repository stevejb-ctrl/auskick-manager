// Screenshots referenced on this page:
//   /help-screenshots/rotations-swap-card.png
//   /help-screenshots/rotations-player-tile.png
//   /help-screenshots/rotations-zone-bar.png

import Link from "next/link";
import { HelpPage, HelpFigure, HelpCallout } from "@/components/help/HelpPage";

export const metadata = {
  title: "Rotations · Help · Siren",
  description:
    "How suggested rotations work in AFL, netball, league, union, football (soccer) and basketball: badges, position colours, keeping players on, the keeper, fouls, and league's junior laws.",
  alternates: { canonical: "/help/rotations" },
};

export default function RotationsPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Rotations</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-dim">
        The rotation engine watches how much time every player has spent in
        each position, both in the current game and across the whole season,
        and suggests swaps that balance things out. You never have to do the
        maths yourself.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-dim">
        How rotations are <em>applied</em> depends on your sport. AFL and
        league teams rotate during play: the app suggests swaps each time the
        sub timer runs out. Netball teams rotate at quarter breaks: the app
        suggests a fresh lineup at every break, and teams that turn on
        mid-quarter subs can also sub during a quarter. The aim is the same in
        every sport — only the moment of action differs.
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">How the algorithm works</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Whenever the app needs to suggest a lineup, it ranks the possible
          placements by how much they would improve overall fairness,
          considering:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Season time</strong>: time in each
            line or position across this season&apos;s finished games (AFL
            lines, netball positions, league Forwards and Backs)
          </li>
          <li>
            <strong className="text-ink">Current-game minutes</strong>: time
            accrued so far in this game
          </li>
          <li>
            <strong className="text-ink">Recent subs</strong>: AFL won&apos;t
            pull off a player who only just came on, or bring straight back a
            player who only just went off, within the same sub interval.
            League pairs each bench player with whoever has been on the field
            longest, so a player who just came on isn&apos;t the one taken off.
          </li>
          <li>
            <strong className="text-ink">Kept players</strong>: AFL players
            kept on the field never leave, and players kept in a line stay in
            it; netball players kept in a position stay there at the next
            break; league never suggests taking off the FR or DH vest wearer,
            or a player with the Keep on role
          </li>
          <li>
            <strong className="text-ink">How we play</strong>: your rotation
            style, season balance, each player&apos;s role (home, also plays,
            never plays, keep on) and your rules (keep apart, keep together,
            nobody sits out twice in a row…). See the{" "}
            <Link href="/help/squads" className="font-medium underline">
              Squads
            </Link>{" "}
            help page for roles.
          </li>
        </ul>
        <p className="mt-3 text-sm text-ink-dim">
          The result is a small set of swap pairs during AFL and league
          rolling subs (league suggests one swap for each bench player), or a
          complete next-quarter lineup at a netball break.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">The swap card (AFL and league)</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          With rolling subs, suggested swaps appear in the dark{" "}
          <strong className="text-ink">swap card</strong> above the
          playing area. It has two states:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Collapsed</strong>: shows a countdown
            ring (or an icon when the timer isn&apos;t running), the number of
            suggested swaps, and a one-line summary (e.g.{" "}
            <em>Alex→Sam · Jordan→Blake</em>). Tap to expand.
          </li>
          <li>
            <strong className="text-ink">Expanded</strong>: shows each pair
            in a row with its line label colour-coded, a{" "}
            <strong className="text-ink">Make swap</strong> button per pair,
            and a <strong className="text-ink">Make all N swaps</strong>{" "}
            button at the bottom.
          </li>
        </ul>
        <p className="mt-3 text-sm text-ink-dim">
          After you commit a swap (via <strong className="text-ink">Make swap</strong>{" "}
          or <strong className="text-ink">Make all</strong>), the card collapses
          automatically and the sub timer resets.
        </p>

        <HelpFigure
          src="/help-screenshots/rotations-swap-card.png"
          alt="The AFL swap card expanded showing two swap pairs with position labels, Make swap buttons, and a Make all 2 swaps button"
          caption="The swap card expanded (AFL shown). Position labels are colour-coded — see the colour key below."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">The countdown ring and NOW badge</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          On rolling subs (AFL and league), the swap card header includes a
          circular progress ring that fills as the sub interval counts down.
          When it reaches zero:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-dim">
          <li>
            The ring turns orange and the counter displays{" "}
            <strong className="text-ink">NOW</strong>.
          </li>
          <li>The card reads <strong className="text-ink">Sub due</strong>.</li>
          <li>The card expands automatically to show the suggestions.</li>
        </ul>
        <HelpCallout type="tip">
          You can make a swap at any time, not just when the timer fires. Tap
          a player on the field, then one on the bench. AFL asks you to
          confirm; league swaps straight away. Either way the timer resets.
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Quarter-break rotation (netball)</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          For netball, the rotation engine runs at the break instead. When a
          quarter ends, the app shows a <strong className="text-ink">Lineup
          for Q{"{n}"}</strong> screen with the suggested next lineup already
          in place. The reshuffle is weighted by who&apos;s played least,
          who hasn&apos;t had a turn at their preferred position, and the
          rules of play (which positions each player can enter). Tap two
          players to swap them, or accept the suggestion and start the
          quarter.
        </p>
        <p className="mt-2 text-sm text-ink-dim">
          Netball teams that prefer to sub mid-quarter can turn on{" "}
          <strong className="text-ink">Allow mid-quarter subs</strong> (Team ›
          How we play). Then long-press a player on court and tap{" "}
          <strong className="text-ink">Switch player</strong> to bring someone
          on.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Rotations in rugby union</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Junior rugby union uses rolling subs, the same model as league and
          AFL, with none of league&apos;s junior laws: no vests, no kicking
          rotations and no unbroken-period rule. The game-time floor in{" "}
          <strong className="text-ink">How we play</strong> (half the game
          by default) keeps playing time fair, and you can change it like any
          other sport. Kids play forwards or backs to Under 9; from Under 10
          you can give them named positions, numbered as on the jersey (LK4,
          HB9, N8 and so on).
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Rotations in football (soccer)</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Junior football uses rolling subs: kids come on and off at any
          time, as MiniRoos allows. When the sub interval runs out, the swap
          card suggests a bench rotation that evens out everyone&apos;s
          minutes, and over the season Siren moves kids through defence,
          midfield and attack so nobody is always stuck at the back. Under 6
          and Under 7 play 4 a side with no keeper and no lines: Siren just
          evens out minutes.
        </p>

        <h3 className="mt-5 font-semibold text-ink">The keeper</h3>
        <p className="mt-2 text-sm text-ink-dim">
          From Under 8 one kid keeps goal for the whole half. Rolling subs
          never take the keeper off; to change keeper mid-half, long-press
          the keeper and tap <strong className="text-ink">Replace keeper</strong>.
          At half-time Siren plans the next half, starting with who takes the
          keeper top. Choose how in <strong className="text-ink">How we play</strong>:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Everyone has a turn in goal</strong>{" "}
            (the default to Under 11): the fewest keeper minutes this season
            go in next, and last half&apos;s keeper plays out in the field.
          </li>
          <li>
            <strong className="text-ink">Keepers</strong> (the default from
            Under 12): you name your keepers and they share goal.
          </li>
        </ul>
        <p className="mt-2 text-sm text-ink-dim">
          On the Squad tab, set a kid&apos;s home to Keeper to mark a keen
          keeper (or one of your named keepers), or mark Keeper as somewhere
          they&apos;d rather not play.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Rotations in basketball</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Five play from a squad of eight to ten, so up to half the team sits
          at any moment. Subs go at a dead ball, through the table: when the
          sub interval runs out, the swap card names who goes to the table,
          and you tap them on when the whistle goes. Siren lines up the kids
          with the least time this game, and there&apos;s no sub prompt in the
          last minute of a half or quarter.
        </p>

        <h3 className="mt-5 font-semibold text-ink">Positions are optional</h3>
        <p className="mt-2 text-sm text-ink-dim">
          Choose how kids rotate in <strong className="text-ink">How we play</strong>:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Equal minutes</strong> (Under 8 and
            Under 10): no positions; Siren just evens out minutes. Set a
            kid&apos;s home to Guards on the Squad tab to mark a ball handler,
            and Siren keeps one on court.
          </li>
          <li>
            <strong className="text-ink">Guards and forwards</strong> (Under 12
            and Under 14): every kid plays both, evened out over the season.
          </li>
          <li>
            <strong className="text-ink">Home line</strong> (Under 16 and up):
            each kid is a guard or a forward, with time on the other line too;
            subs go guard for guard.
          </li>
          <li>
            <strong className="text-ink">All five positions</strong>: 1 to 5,
            the most different positions per kid.
          </li>
          <li>
            <strong className="text-ink">Set positions</strong>: a home position
            plus backups; the bench rotates like-for-like.
          </li>
        </ul>

        <h3 className="mt-5 font-semibold text-ink">Fouls, foul-outs and sit-outs</h3>
        <p className="mt-2 text-sm text-ink-dim">
          With <strong className="text-ink">Track fouls</strong> on (from Under
          12, or in Settings), tap a kid on court and tap{" "}
          <strong className="text-ink">+ Foul</strong>. Each tile shows its
          count; Siren takes a kid one foul short of fouling out off first, and
          the fifth foul takes them out for the game. You pick who comes on. For
          a technical or unsportsmanlike foul, long-press the kid and tap{" "}
          <strong className="text-ink">Sit out 5 min</strong>: they can&apos;t
          come back on until five minutes of playing time have run (timeouts
          don&apos;t count).
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Rotations in rugby league</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Junior rugby league (Under 6 to Under 12) adds rotation rules from
          the National Junior League Laws on top of rolling subs. Siren tracks
          each one so the coach can&apos;t accidentally break a law. From
          Under 13 the international laws apply: there are no vests, no
          kicking rotations and no unbroken-period rule.
        </p>

        <h3 className="mt-5 font-semibold text-ink">Player rotation</h3>
        <p className="mt-2 text-sm text-ink-dim">
          Rolling subs, same model as AFL. Tap a player on the field, then a
          bench player, to swap them. When the sub interval runs out, the
          swap card suggests a full bench rotation. Players wearing the FR or
          DH vest are never suggested to come off.
        </p>

        <h3 className="mt-5 font-semibold text-ink">Vested-role rotation (FR / DH)</h3>
        <p className="mt-2 text-sm text-ink-dim">
          Junior Laws §12: the First Receiver wears a yellow vest from Under
          8; the Dummy Half wears a pink vest from Under 9. Both rotate each
          period and{" "}
          <strong className="text-ink">no player wears the same vest
          twice in a game</strong>. Pick the first wearers on the lineup
          screen; at each break a vest card asks who wears them next and
          greys out players who&apos;ve already had a turn. If a vest wearer
          leaves the field, Siren asks who takes the vest. A{" "}
          <strong className="text-ink">Replace</strong> option covers the
          laws&apos; injury carve-out (the vest can pass to a replacement for
          the rest of that period only).
        </p>

        <h3 className="mt-5 font-semibold text-ink">Goal-kick rotation</h3>
        <p className="mt-2 text-sm text-ink-dim">
          Junior Laws §15 (Under 8 to Under 12): once a player has kicked at
          goal, they can&apos;t kick again until everyone on the field at the
          time has had a turn. After a try, the conversion dialog disables
          players who&apos;ve already kicked this cycle and resets the
          rotation once everyone&apos;s had a turn. A boot badge sits on each
          on-field tile so you can see who&apos;s already kicked at a
          glance, even before opening the dialog. The{" "}
          <strong className="text-ink">Force</strong> toggle covers the
          fouled-in-act-of-scoring carve-out. Under 6 and Under 7 don&apos;t
          kick at all.
        </p>

        <h3 className="mt-5 font-semibold text-ink">Kickoff rotation</h3>
        <p className="mt-2 text-sm text-ink-dim">
          Junior Laws §16 (Under 8 to Under 12): once a player has kicked off,
          they can&apos;t kick off again until every other player on the
          field has had a turn. A <strong className="text-ink">Kickoff</strong> card appears
          at the start of each period, listing the players on the field;
          anyone who&apos;s already had a turn shows as{" "}
          <strong className="text-ink">Done</strong>. A small &quot;K&quot;
          chip on the player tile marks anyone who&apos;s kicked off this
          game. Tap <strong className="text-ink">Skip</strong> if you&apos;re
          not tracking it.
        </p>

        <h3 className="mt-5 font-semibold text-ink">Unbroken-period coverage</h3>
        <p className="mt-2 text-sm text-ink-dim">
          Junior Laws §6: every player must play at least{" "}
          <strong className="text-ink">two unbroken quarters</strong>{" "}
          (U6–U9) or <strong className="text-ink">one unbroken half</strong>{" "}
          (U10–U12). &quot;Unbroken&quot; means on the field continuously
          from period kickoff to hooter — no swaps off. It&apos;s off by
          default: turn on <strong className="text-ink">Enforce unbroken
          periods</strong> under Team › How we play, or for one game in Game
          settings. When it&apos;s on, the suggested starting lineup puts
          first any player who missed out in earlier games. The Stats tab
          shows how many games each player met the rule and lists any
          shortfalls, so you can plan next week&apos;s rotations accordingly.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Player tiles and badges</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Each player tile shows:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Jersey number</strong> (AFL and
            league — netball squads don&apos;t use them)
          </li>
          <li>
            <strong className="text-ink">Name</strong> and their minutes on
          </li>
          <li>
            <strong className="text-ink">Position label</strong> at the top
            (e.g. FWD / CEN / BCK for AFL, GS / GA / WA / C / WD / GD / GK
            for netball). League tiles show a named position when your team
            uses Named positions, and an FR or DH badge on the vest wearers.
          </li>
          <li>
            A <strong className="text-ink">time bar</strong> at the bottom: a
            thin horizontal bar colour-coded by area showing how much time
            this player has spent where. In league it only shows when{" "}
            <strong className="text-ink">Track forward and back time</strong>{" "}
            is on.
          </li>
        </ul>
        <p className="mt-3 text-sm text-ink-dim">
          When a player is part of a pending swap suggestion (AFL and league
          rolling subs):
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-dim">
          <li>
            A <strong className="text-ink">↓</strong> badge marks the player
            coming off
          </li>
          <li>
            A <strong className="text-ink">↑</strong> badge marks the player
            coming on from the bench
          </li>
          <li>Both tiles show a pair number so you can match them up</li>
        </ul>

        <HelpFigure
          src="/help-screenshots/rotations-player-tile.png"
          alt="An AFL player tile showing jersey number, name, position label, up/down badges, and a time bar at the bottom"
          caption="Player tile anatomy (AFL shown): number (where used), position label, swap badges, and time bar."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Position colour coding</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Colours are consistent across every position indicator in the app.
          Each sport has three: one for the attacking end (AFL Forward,
          netball Attack, league Forwards), one for the middle (AFL and
          netball Centre; in league, time wearing the FR or DH vest), and one
          for the defending end (AFL Back, netball Defence, league Backs).
          Within a sport the same colour means the same area everywhere — the
          live tile, the time bar, the stats cards.
        </p>

        <HelpFigure
          src="/help-screenshots/rotations-zone-bar.png"
          alt="Time bars on several AFL player tiles showing the per-position colour coding"
          caption="Time bars use the same colours across the playing area and the Stats tab."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Keeping a player on</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Long-press a player (or tap them, then{" "}
          <strong className="text-ink">Player actions</strong>) to open the
          sheet:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Keep on field</strong> (AFL): the
            player is excluded from rotation suggestions and never leaves the
            playing area for the rest of the game.
          </li>
          <li>
            <strong className="text-ink">Keep in a zone</strong> (AFL): the
            player can rotate off temporarily but the algorithm always returns
            them to the same line. Netball&apos;s version is &quot;Keep in{" "}
            <em>position</em> next break&quot;.
          </li>
          <li>
            League has no keep-on button in the live game. Give the player the{" "}
            <strong className="text-ink">Keep on</strong> role (Squad › Role)
            and the suggestions won&apos;t take them off. The FR and DH vest
            wearers also stay on for their period.
          </li>
        </ul>
        <HelpCallout type="note">
          In AFL and netball, kept players are pinned in the quarter-break
          reshuffle too. The algorithm keeps them where you put them.
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Season balance</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          The Stats tab&apos;s <strong className="text-ink">Season balance</strong>{" "}
          card shows how evenly time is spread across the whole squad: each
          player&apos;s minutes in each line or position this season, with a
          tint wherever a kid is owed at least a quarter (a half, for league
          from Under 10). The line at the top counts how many kids are within
          a quarter (or half) of even.
        </p>
        <p className="mt-2 text-sm text-ink-dim">
          Aim for an even season, not an even single game. Individual games
          often sit uneven; that&apos;s normal and expected.
        </p>
        <p className="mt-2 text-sm text-ink-dim">
          The{" "}
          <Link href="/help/stats" className="font-medium text-brand-600 hover:underline">
            Stats tab
          </Link>{" "}
          shows per-player breakdowns for the full season.
        </p>
      </section>
    </HelpPage>
  );
}
