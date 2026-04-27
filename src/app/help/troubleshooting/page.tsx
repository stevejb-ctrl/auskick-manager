// No screenshots on this page.

import Link from "next/link";
import { HelpPage, HelpCallout } from "@/components/help/HelpPage";

export const metadata = {
  title: "Troubleshooting · Help · Siren Footy",
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
          The sub timer requires an active, running quarter. Check the following:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Quarter is started.</strong> On the
            quarter-break screen, make sure you&apos;ve tapped{" "}
            <strong className="text-ink">Start Q{"{n}"}</strong>. The Sub Due
            timer doesn&apos;t run during a break.
          </li>
          <li>
            <strong className="text-ink">Clock is not paused.</strong> The clock
            pill in the header shows a <em>▶</em> icon when paused. Tap it to
            resume. The timer only counts while the clock runs.
          </li>
          <li>
            <strong className="text-ink">Sub interval is set.</strong> Go to your
            team <strong className="text-ink">Settings</strong> and confirm a
            non-zero sub interval is configured. A value of 0 disables automatic
            sub alerts.
          </li>
          <li>
            <strong className="text-ink">There are bench players available.</strong>{" "}
            If everyone is on the field, there&apos;s nobody to swap in so no
            suggestion is generated.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">
          The quarter clock is counting up past 0:00
        </h2>
        <p className="mt-3 text-sm text-ink-dim">
          This is expected behaviour. The clock counts down from the set quarter
          duration to 0:00, then switches to an orange overtime display that
          counts up so you can see how long over time the quarter has run. Tap{" "}
          <strong className="text-ink">End Q{"{n}"}</strong> when the siren sounds
          to end the quarter and move to the break screen.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">
          Scores appear to have reset after navigating away
        </h2>
        <p className="mt-3 text-sm text-ink-dim">
          Scores are saved to the server as events when you tap Goal, Behind, or
          any rotation action. If you navigate away and come back, the game replays
          all saved events on load. If scores look wrong:
        </p>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            <strong className="text-ink">Check your connection.</strong> If you
            were offline when a score was recorded, the server action may have
            failed silently. The toast failure would have indicated this.
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
          An injured or lent player keeps appearing on the field at quarter breaks
        </h2>
        <p className="mt-3 text-sm text-ink-dim">
          Injured (<strong className="text-ink">INJ</strong>) and lent (
          <strong className="text-ink">LENT</strong>) players are excluded from the
          reshuffle algorithm and always placed on the bench at quarter breaks. If a
          player with one of these badges still appears in a zone column:
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            Check the player tile: their name should be greyed out (60% opacity)
            and tapping them should have no effect.
          </li>
          <li>
            If the tile appears fully interactive, refresh the page and check whether
            the injury/loan was properly saved (look for the badge in the live game view).
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">
          Rotation suggestions aren&apos;t appearing
        </h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            The SwapCard only appears when there are bench players to swap in. If
            the whole squad is on the field, no suggestion can be generated.
          </li>
          <li>
            If all bench players are injured or lent, they&apos;re excluded from
            rotation and the card will be empty.
          </li>
          <li>
            All field players might be within their lock rules (field-locked or
            zone-locked players can&apos;t be moved).
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">
          The Stats tab is empty
        </h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-dim">
          <li>
            Stats only populate for <strong className="text-ink">completed</strong>{" "}
            games. All four quarters must have been ended via the{" "}
            <strong className="text-ink">End quarter</strong> flow.
          </li>
          <li>
            If you see &quot;no data yet&quot; messages, check the Games tab to
            confirm a game shows status <em>Completed</em>, not{" "}
            <em>In progress</em>.
          </li>
          <li>
            Scoring stats require the{" "}
            <Link href="/help/track-scoring" className="font-medium underline">
              Track goals &amp; behinds
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
            If the problem persists, clear your browser cache for
            auskick-manager.vercel.app.
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
