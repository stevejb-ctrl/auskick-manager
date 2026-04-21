// No screenshots on this page.

import Link from "next/link";
import { HelpPage, HelpCallout } from "@/components/help/HelpPage";

export const metadata = {
  title: "FAQ — Help — Siren",
  description: "Quick answers to the most common questions about Siren.",
};

interface FAQItem {
  q: string;
  a: React.ReactNode;
}

const FAQ: FAQItem[] = [
  {
    q: "Why did my scores reset?",
    a: (
      <>
        Scores are saved to the server as events, so they should survive page
        refreshes and navigation. If scores appear to have reset, check that you
        have a working internet connection — the live game screen requires
        connectivity to persist events. If you were offline, the events may not
        have saved; see{" "}
        <Link href="/help/troubleshooting" className="font-medium underline">
          Troubleshooting
        </Link>
        .
      </>
    ),
  },
  {
    q: "How do I undo a goal?",
    a: (
      <>
        After tapping Goal or Behind, an <strong>Undo</strong> toast appears at
        the bottom of the screen for 8 seconds. Tap it immediately to reverse the
        score. If you miss the toast, the score is saved — contact your admin to
        manually correct the game data.
      </>
    ),
  },
  {
    q: "Why isn't a stat showing up?",
    a: (
      <>
        Stats only populate for <strong>completed</strong> games (all four quarters
        ended properly). Stats that depend on scoring (winning combinations, position
        fit, quarter scoring) also require the{" "}
        <Link href="/help/track-scoring" className="font-medium underline">
          Track goals &amp; behinds
        </Link>{" "}
        toggle to have been on for those games.
      </>
    ),
  },
  {
    q: "Does it work offline?",
    a: (
      <>
        The app needs an internet connection to save game events to the server.
        The UI will load from the browser cache if you&apos;ve visited before, but
        any actions you take (scoring, subs, ending quarters) require connectivity
        to persist. If you lose connection during a game, actions may fail silently
        — reconnect and refresh to check the current saved state.
      </>
    ),
  },
  {
    q: "Why isn't the Sub Due alert firing?",
    a: (
      <>
        The sub timer only runs while a quarter is <strong>active</strong> (not
        paused and not in a quarter break). Make sure you&apos;ve tapped{" "}
        <strong>Start Q{"{n}"}</strong> on the quarter break screen — if the clock
        isn&apos;t running, the timer doesn&apos;t count. Also check that the sub
        interval is set in your team settings (a value of 0 disables the timer).
      </>
    ),
  },
  {
    q: "How do I add a player who arrived late?",
    a: (
      <>
        During a live game, look for the <strong>Late arrival</strong> option in
        the live game view. It lets you add a player from your squad to the bench
        mid-game. They&apos;ll then be available for rotations and the quarter-break
        lineup picker.
      </>
    ),
  },
  {
    q: "Can I run two games at the same time (e.g. two teams)?",
    a: (
      <>
        Yes — each team has its own independent live game view. Open the two games
        in separate browser tabs and manage them independently.
      </>
    ),
  },
  {
    q: "What does the fairness score mean?",
    a: (
      <>
        It&apos;s a 0–100 index that measures how evenly zone minutes are distributed
        across the whole squad. 100 is perfectly equal; lower scores mean some players
        have had significantly more or less time in certain positions. Aim for a high
        score by the end of the season — individual games often sit lower, which is
        normal. See{" "}
        <Link href="/help/rotations" className="font-medium underline">
          Rotations
        </Link>{" "}
        for details.
      </>
    ),
  },
  {
    q: "How do I invite another coach to manage my team?",
    a: (
      <>
        Open your team and go to <strong>Settings</strong>. You&apos;ll find a
        shareable join link. Anyone with the link can join as a game manager —
        they can run live games but cannot delete the team or change settings.
      </>
    ),
  },
  {
    q: "Why is a player still showing on the field after I marked them injured?",
    a: (
      <>
        After you tap <strong>Mark injured</strong> in the player actions sheet, the
        player moves to the bench immediately. If their tile is still visible on the
        field, try refreshing the page. If the issue persists, see{" "}
        <Link href="/help/troubleshooting" className="font-medium underline">
          Troubleshooting
        </Link>
        .
      </>
    ),
  },
  {
    q: "Can I use this on my phone?",
    a: (
      <>
        Yes — the app is a mobile-first PWA. It works in any modern mobile browser
        (Safari on iOS, Chrome on Android). For the best sideline experience, open
        it in your browser and add it to your home screen via the Share → Add to
        Home Screen option.
      </>
    ),
  },
];

export default function FAQPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">FAQ</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-dim">
        Quick answers to common questions. If you don&apos;t find what you need here,
        check{" "}
        <Link href="/help/troubleshooting" className="font-medium text-brand-600 hover:underline">
          Troubleshooting
        </Link>{" "}
        or browse the other help topics.
      </p>

      <dl className="mt-8 divide-y divide-hairline">
        {FAQ.map(({ q, a }) => (
          <div key={q} className="py-5">
            <dt className="font-semibold text-ink">{q}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-ink-dim">{a}</dd>
          </div>
        ))}
      </dl>

      <HelpCallout type="note">
        Something not covered here? Browse the sidebar topics for detailed guides on
        every feature, or check{" "}
        <Link href="/help/troubleshooting" className="font-medium underline">
          Troubleshooting
        </Link>{" "}
        for step-by-step fixes.
      </HelpCallout>
    </HelpPage>
  );
}
