// No screenshots on this page.

import Link from "next/link";
import { HelpPage, HelpCallout } from "@/components/help/HelpPage";

export const metadata = {
  title: "Troubleshooting · Help · Siren",
  description: "Common issues and how to fix them.",
  alternates: { canonical: "/help/troubleshooting" },
};

export default function TroubleshootingPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Troubleshooting</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-dim">
        Common issues and how to resolve them. Most problems come down to
        connectivity, stale cache, or an easy settings tweak.
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">
          The Sub Due modal isn&apos;t firing
        </h2>
        <p className="mt-3 text-sm text-ink-dim">
          Sub Due alerts apply to rolling subs, so AFL and league only —
          netball teams sub at the quarter break, so this alert never appears
          for them. For AFL and league, the sub timer requires an active,
          running quarter or half. Check the following:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">The quarter or half is started.</strong>{" "}
            After a break, make sure you&apos;ve tapped{" "}
            <strong className="text-ink">Start Q{"{n}"}</strong> (league from
            Under 10: <strong className="text-ink">Start H{"{n}"}</strong>).
            The Sub Due timer doesn&apos;t run during a break.
          </li>
          <li>
            <strong className="text-ink">Clock is not paused.</strong> The
            clock pill in the scoreboard shows a <em>▶</em> icon when paused.
            Tap it to resume. The timer only counts while the clock runs.
          </li>
          <li>
            <strong className="text-ink">Sub interval is set.</strong> Check
            the sub interval under <strong className="text-ink">Game settings</strong>,
            on the lineup screen or below the field during the game. It can be
            anything from 1 to 10 minutes.
          </li>
          <li>
            <strong className="text-ink">No &quot;breaks only&quot; rule.</strong>{" "}
            If your team uses the{" "}
            <strong className="text-ink">Subs only at the breaks</strong> rule
            (Team › How we play), Siren won&apos;t suggest rolling subs.
          </li>
          <li>
            <strong className="text-ink">There are bench players available.</strong>{" "}
            If everyone is on the playing area, there&apos;s nobody to swap in
            so no suggestion is generated.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">
          The clock stopped at 0:00
        </h2>
        <p className="mt-3 text-sm text-ink-dim">
          This is expected behaviour. The clock counts down from the set
          quarter (or half) length, and at 0:00 the period ends by itself and
          the clock stops, so players aren&apos;t credited extra minutes. In
          AFL, a <strong className="text-ink">Quarter complete</strong> card
          lets you add a score that landed on the siren before you move to
          the break. If the umpire&apos;s siren or whistle goes before the
          clock runs out, tap the clock and choose{" "}
          <strong className="text-ink">End Q{"{n}"} now</strong> (league from
          Under 10: <strong className="text-ink">End H{"{n}"} now</strong>).
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">
          Scores appear to have reset after navigating away
        </h2>
        <p className="mt-3 text-sm text-ink-dim">
          Scores are saved to the server as events when you record a score or
          any rotation action. If you navigate away and come back, the game
          replays all saved events on load. If scores look wrong:
        </p>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Check your connection.</strong> Taps
            made with no signal wait on the phone that made them and are sent
            once it reconnects, so other phones won&apos;t see them until then.
            Open the game on that phone with signal to send them.
          </li>
          <li>
            <strong className="text-ink">Hard-refresh the page.</strong> On mobile
            this is typically pull-to-refresh or closing and reopening the tab.
            This forces a full event replay from the server.
          </li>
          <li>
            If scores are genuinely missing, they were likely not saved. Unfortunately
            there is no automatic recovery for lost events. The game detail page
            shows the current recorded state.
          </li>
        </ol>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">
          An injured or lent player keeps appearing on the playing area at breaks
        </h2>
        <p className="mt-3 text-sm text-ink-dim">
          Injured (<strong className="text-ink">INJ</strong>) and lent (
          <strong className="text-ink">LENT</strong>) players are excluded
          from the reshuffle algorithm and always placed on the bench at AFL
          and netball quarter breaks. League never brings them on in a swap.
          If a player with one of these badges still appears in a position
          slot:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            Check the player tile: their name should be greyed out (60%
            opacity) and tapping them should have no effect.
          </li>
          <li>
            If the tile appears fully interactive, refresh the page and check
            whether the injury/loan was properly saved (look for the badge in
            the live game view).
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">
          Rotation suggestions aren&apos;t appearing
        </h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            Netball suggests a fresh lineup at each quarter break, not during
            play, so there&apos;s no swap card mid-quarter.
          </li>
          <li>
            In AFL and league, the swap card only appears when there are bench
            players to swap in. If the whole squad is on the playing area, no
            suggestion can be generated.
          </li>
          <li>
            If all bench players are injured or lent, they&apos;re excluded
            from rotation and the card will be empty.
          </li>
          <li>
            All players on the playing area might be kept on: AFL players set
            to Keep on field or Keep in a zone, league players with the Keep
            on role, and league&apos;s FR and DH vest wearers aren&apos;t
            suggested off.
          </li>
          <li>
            Your team might use the <strong className="text-ink">Subs only at
            the breaks</strong> rule, which turns off rolling-sub suggestions.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">
          The Stats tab is empty
        </h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            Stats only populate for <strong className="text-ink">finished</strong>{" "}
            games. Every quarter or half must have been played out, and{" "}
            <strong className="text-ink">Finish game</strong> tapped in the
            full-time review.
          </li>
          <li>
            If you see &quot;no data yet&quot; messages, check the Games tab to
            confirm a game shows status <em>Final</em>, not{" "}
            <em>In progress</em>.
          </li>
          <li>
            Scoring stats require the{" "}
            <Link href="/help/track-scoring" className="font-medium underline">
              Track scoring
            </Link>{" "}
            toggle to have been on for those games.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">
          The page isn&apos;t loading
        </h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-ink-dim">
          <li>Check your internet connection.</li>
          <li>Hard-refresh the page (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows/Android).</li>
          <li>Try opening the app in an incognito/private window.</li>
          <li>
            If the problem persists, clear your browser cache for the Siren
            site.
          </li>
        </ol>
      </section>

      <HelpCallout type="note">
        Still stuck? Browse the other help topics, especially the{" "}
        <Link href="/help/faq" className="font-medium underline">
          FAQ
        </Link>
        , for more quick answers.
      </HelpCallout>
    </HelpPage>
  );
}
