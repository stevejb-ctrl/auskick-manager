// No screenshots on this page.

import Link from "next/link";
import { HelpPage, HelpCallout } from "@/components/help/HelpPage";
import { PLATFORMS } from "@/lib/siren-facts";

export const metadata = {
  title: "FAQ · Help · Siren",
  description:
    "Answers to common Siren questions: does it work offline, which phones it runs on, undoing a score, sub alerts, late arrivals, fair playing time and inviting another coach.",
  alternates: { canonical: "/help/faq" },
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
        refreshes and navigation. Taps made with no signal wait on your phone
        and are sent once it reconnects, so another phone won&apos;t see them
        until then. If scores still look wrong, see{" "}
        <Link href="/help/troubleshooting" className="font-medium underline">
          Troubleshooting
        </Link>
        .
      </>
    ),
  },
  {
    q: "How do I undo a score?",
    a: (
      <>
        Tap <strong>Undo</strong> on the strip just above the scoreboard to
        take back the latest score. In AFL and netball the strip flashes the
        score you just recorded for 8 seconds. To fix an older score, use{" "}
        <strong>Fix scores</strong> at the next quarter break or in the
        full-time review (AFL and netball); league&apos;s full-time review
        has the score buttons and Undo, so you can correct the result before
        you tap <strong>Finish game</strong>.
      </>
    ),
  },
  {
    q: "Why isn't a stat showing up?",
    a: (
      <>
        Stats only populate for <strong>finished</strong> games: every
        quarter or half played out, then <strong>Finish game</strong> tapped
        in the full-time review. Stats that depend on scoring (AFL position
        fit and quarter-by-quarter scoring, head-to-head, and every
        sport&apos;s scoring columns) also require{" "}
        <Link href="/help/track-scoring" className="font-medium underline">
          Track scoring
        </Link>{" "}
        to have been on for those games.
      </>
    ),
  },
  {
    q: "Does it work offline?",
    a: (
      <>
        Yes, during a game. If the signal drops, the game keeps running on
        your phone (the clock, subs, scores, the lot) and Siren keeps your
        taps on the device. When the connection comes back it sends them to
        the server in the order you made them, so nothing is lost or counted
        twice. Signing in, setting up teams and games, and opening a screen
        you haven&apos;t loaded yet still need a connection, so open the game
        before you lose signal.
      </>
    ),
  },
  {
    q: "Why isn't the Sub Due alert firing?",
    a: (
      <>
        Sub Due alerts apply to rolling subs, so AFL and league only —
        netball teams sub at the quarter break instead, so the alert never
        appears. For AFL and league: the sub timer only runs while a quarter
        or half is <strong>active</strong> (not paused and not at a break).
        Make sure you&apos;ve tapped <strong>Start Q{"{n}"}</strong> (league
        from Under 10: <strong>Start H{"{n}"}</strong>) after the break. If
        the clock isn&apos;t running, the timer doesn&apos;t count. Also
        check the sub interval (1 to 10 minutes) under Game settings, on the
        lineup screen or below the field during the game. If your team uses
        the <strong>Subs only at the breaks</strong> rule, Siren won&apos;t
        suggest rolling subs.
      </>
    ),
  },
  {
    q: "How do I add a player who arrived late?",
    a: (
      <>
        During a live game, tap <strong>+ Add late arrival</strong> below the
        field or court. It lets you add a player from your squad to the bench
        mid-game. They&apos;ll then be available for rotations and the next
        break&apos;s lineup. At a league break you can also use{" "}
        <strong>Add arrived player</strong>.
      </>
    ),
  },
  {
    q: "Can I run two games at the same time (e.g. two teams)?",
    a: (
      <>
        Yes, each team has its own independent live game view. Open the two games
        in separate browser tabs and manage them independently.
      </>
    ),
  },
  {
    q: "How do I check playing time is fair?",
    a: (
      <>
        Open the <strong>Season balance</strong> card on the Stats tab. It
        shows each player&apos;s minutes in each line or position this
        season, tints any spot where a kid is owed at least a quarter (a
        half, for league from Under 10), and counts how many kids are within
        a quarter (or half) of even. Aim for an even season. Individual games
        often sit uneven, which is normal. See{" "}
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
        Open your team and go to the <strong>Team</strong> tab, under People. You&apos;ll find a
        shareable invite link. Anyone with the link joins as a Manager.
        Managers can run live games but cannot delete the team or change settings.
      </>
    ),
  },
  {
    q: "Why is a player still showing on the playing area after I marked them injured?",
    a: (
      <>
        After you tap <strong>Mark injured</strong> in the player actions
        sheet, the player comes out of the rotation straight away. If
        they&apos;re on the field, AFL and league ask who comes on in their
        place, and netball asks who fills their position. If you skip the
        replacement, their spot is left short. If their tile still shows on
        the playing area without an <strong>INJ</strong> badge, try
        refreshing the page. If the issue persists, see{" "}
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
        Yes. Siren is {PLATFORMS.sentence}. On an iPhone or iPad,{" "}
        <a href={PLATFORMS.ios.url} className="font-medium underline">
          get the app from the App Store
        </a>
        . On Android, open Siren in Chrome and add it to your home screen
        (menu → Add to Home screen) so it opens like an app.
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
