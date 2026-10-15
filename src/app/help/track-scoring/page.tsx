// Screenshots referenced on this page:
//   /help-screenshots/track-scoring-toggle.png
//   /help-screenshots/track-scoring-player-tile.png

import Link from "next/link";
import { HelpPage, HelpFigure, HelpCallout } from "@/components/help/HelpPage";

export const metadata = {
  title: "Track Scoring · Help · Siren",
  description: "The scoring switch for AFL, netball, league and union, and what it unlocks.",
  alternates: { canonical: "/help/track-scoring" },
};

export default function TrackScoringPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Track scoring</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-dim">
        Siren can record which players score during a game. This is optional
        (rotations and fairness tracking work perfectly without it) but turning
        it on unlocks richer stats.
      </p>
      <p className="mt-2 text-sm text-ink-dim">
        AFL games record goals (6 points) and behinds (1); netball games record
        goals only (1 point each); rugby league games record tries (4 points)
        and conversions (2 points), plus penalty goals (2) and field goals (1)
        from Under 13, where the international laws apply; rugby union games
        record tries (5 points) and conversions (2), plus penalty goals (3) and
        drop goals (3) from Under 10. The switch behaves the same way in every
        sport — turn it on for your team, and the live screen shows the right
        scoring controls for your sport. It starts off for the youngest age
        groups (AFL Under 8 to Under 10, netball Set, league Under 6 and Under
        7, which are tag games with no scoreboard, and union Under 6 to Under
        11, where the national pathway keeps no score) and on for the rest.
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Turning it on</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            Open your team and tap the <strong className="text-ink">Team</strong>{" "}
            tab.
          </li>
          <li>
            Under <strong className="text-ink">Game-day extras</strong>, turn
            the scoring switch on. It reads{" "}
            <strong className="text-ink">Track goals &amp; behinds</strong>{" "}
            (AFL), <strong className="text-ink">Track goals</strong> (netball)
            or <strong className="text-ink">Track points</strong> (league and
            union).
          </li>
          <li>
            The setting is saved immediately and applies to all of the
            team&apos;s games. Team admins can change it at any time.
          </li>
        </ol>

        <HelpFigure
          src="/help-screenshots/track-scoring-toggle.png"
          alt="An AFL game's detail page"
          caption="A game's detail page. Scoring is switched on for the whole team on the Team tab, not game by game."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">What it changes during the live game</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          With scoring enabled:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            Tapping a player on the playing area selects them and reveals the
            scoring action(s). AFL: <strong className="text-ink">+ Goal</strong>{" "}
            and <strong className="text-ink">+ Behind</strong>, for any player
            on the field. Netball: <strong className="text-ink">+ Goal</strong>,
            and only the GS and GA shooter positions are tappable for
            attribution. League: <strong className="text-ink">+ Try</strong>{" "}
            for any player on the field. From Under 8 to Under 12, a try opens
            the kicker picker for the conversion so the §15 goal-kick
            rotation is honoured. From Under 13 there&apos;s no rotation, and{" "}
            <strong className="text-ink">+ Penalty goal</strong> and{" "}
            <strong className="text-ink">+ Field goal</strong> sit beside{" "}
            <strong className="text-ink">+ Try</strong>. Union:{" "}
            <strong className="text-ink">+ Try</strong> for any player on the
            field; from Under 8 a try opens the kicker picker for the
            conversion (union has no kicking rotation), and from Under 10{" "}
            <strong className="text-ink">+ Penalty goal</strong> and{" "}
            <strong className="text-ink">+ Drop goal</strong> sit beside it.
          </li>
          <li>
            Each player&apos;s tile shows a small chip with their tally for
            the game (in league and union, their tries).
          </li>
          <li>
            Score buttons appear beside each team&apos;s score in the
            scoreboard: AFL <strong className="text-ink">+G</strong> and{" "}
            <strong className="text-ink">+B</strong>; netball{" "}
            <strong className="text-ink">+G</strong>; league{" "}
            <strong className="text-ink">+T</strong> and{" "}
            <strong className="text-ink">+C</strong>, plus{" "}
            <strong className="text-ink">+PG</strong> and{" "}
            <strong className="text-ink">+FG</strong> from Under 13; union{" "}
            <strong className="text-ink">+T</strong> and{" "}
            <strong className="text-ink">+C</strong>, plus{" "}
            <strong className="text-ink">+PG</strong> and{" "}
            <strong className="text-ink">+DG</strong> from Under 10. Under 6
            and Under 7 don&apos;t kick in either code, so there&apos;s no{" "}
            <strong className="text-ink">+C</strong>.
          </li>
          <li>
            The scoreboard updates in real time. AFL displays the standard
            goals·behinds with total points; netball shows a single goals
            tally; rugby league and union show the points total with a
            &ldquo;tries · conversions&rdquo; breakdown alongside (and penalty
            and field or drop goals once there are some).
          </li>
          <li>
            An <strong className="text-ink">Undo</strong> strip sits just
            above the scoreboard so you can take back the latest score. In AFL
            and netball it flashes the score you just recorded for 8 seconds.
          </li>
        </ul>

        <HelpFigure
          src="/help-screenshots/track-scoring-player-tile.png"
          alt="An AFL player tile during a scored game showing a chip with the player's score tally"
          caption="When scoring is tracked, each player tile shows their current tally."
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">What it unlocks in Stats</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Games with scoring tracked contribute data to the following{" "}
          <Link href="/help/stats" className="font-medium underline">
            Stats
          </Link>{" "}
          views:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Player stats</strong>: goals and
            behinds for AFL; goals for netball; tries, conversions made and
            attempted, and from Under 13 penalty and field goals, for league;
            the same with penalty and drop goals from Under 10 for union
          </li>
          <li>
            <strong className="text-ink">Position fit</strong> (AFL): player
            effectiveness in each line
          </li>
          <li>
            <strong className="text-ink">Quarter-by-quarter scoring</strong>{" "}
            (AFL): your scoring pattern across the game
          </li>
          <li>
            <strong className="text-ink">Head-to-head by opponent</strong>{" "}
            (AFL and netball): your record against each team
          </li>
          <li>
            <strong className="text-ink">Team totals</strong> (league and
            union): tries,
            points, conversions and points conceded for the season
          </li>
          <li>
            <strong className="text-ink">Scorers</strong>: AFL goal kickers
            and netball goal shooters are listed on the game detail page after
            the game; league and union try scorers are in the full-time summary
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">If you leave it off</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          All rotation and fairness features work exactly the same. Season
          balance, attendance and playing time are still recorded. The stats
          that depend on scores won&apos;t populate for games where scoring
          wasn&apos;t tracked.
        </p>
        <HelpCallout type="note">
          You can mix scored and unscored games in the same season. Stats
          derived from scoring will only count the games where scoring was
          on.
        </HelpCallout>
      </section>
    </HelpPage>
  );
}
