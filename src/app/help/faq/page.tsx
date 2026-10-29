// No screenshots on this page.

import Link from "next/link";
import { HelpPage, HelpCallout } from "@/components/help/HelpPage";
import { PLATFORMS } from "@/lib/siren-facts";
import { subsAtBreaksOnly } from "@/lib/sports/words";

// The sports that sub only at the breaks (netball), from their configs:
// every other sport has rolling subs and the Sub Due alert.
const BREAK_ONLY = subsAtBreaksOnly().map((s) => s.words.sportName).join(" and ");

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
  // Round 9 (29 Oct 2026): questions parents and coaches asked in the
  // Stagehand rounds that no help page answered.
  {
    q: "What happens when two phones score the same game?",
    a: (
      <>
        Both count. Each phone saves its own taps, and a score from the other
        phone shows on yours within a few seconds with a note such as{" "}
        <strong>Another phone added Isla&apos;s goal</strong>. It isn&apos;t a
        mistake, so don&apos;t undo it: <strong>Undo</strong> takes back the
        latest score whichever phone made it, and says which one before you
        tap. Agree who scores for which team before the start.
      </>
    ),
  },
  {
    q: "A player leaves early. What do I do?",
    a: (
      <>
        Tap the player and choose <strong>Went home</strong>. They come off
        straight away (on the field, you pick who comes on), their time stops,
        and they&apos;re out of the rotation for the rest of the game. Their
        tile shows <strong>HOME</strong>. If they come back, tap them again to
        bring them back.
      </>
    ),
  },
  {
    q: "What do \"OFF 1\" and \"Stays\" mean?",
    a: (
      <>
        When subs are due, the next-sub card numbers each swap, and the player
        going off wears the same number on their tile: <strong>OFF 1</strong>{" "}
        comes off for the first swap on the card. At a break, each tile says
        where the player was last period: <strong>Stays</strong> means the same
        spot, otherwise it says where they come from (another line, or the
        bench).
      </>
    ),
  },
  {
    q: "Can I reset season balance without losing stats?",
    a: (
      <>
        Yes. <strong>Reset</strong> under Season balance in How we play (Team ›
        Settings) only changes where the balance starts counting, from today.
        Past games, their minutes and every stat stay as they are.
      </>
    ),
  },
  {
    q: "How do I change the quarter or half length?",
    a: (
      <>
        In Team › Settings, set the length in minutes. New games use it. In
        netball you can also change it for one game on the lineup screen
        before the start. Once a game has started, its length stays as it was.
      </>
    ),
  },
  {
    q: "Do parents need an account to say if their child can play?",
    a: (
      <>
        No. On the game page, tap <strong>Ask parents who&apos;s in</strong>{" "}
        and post the message in your group chat. Parents open the link, tap
        their child and choose <strong>In</strong> or <strong>Out</strong>,
        with no account or app. The game-day link that runs the game needs no
        account either.
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
        Sub Due alerts come with rolling subs, so every sport has them
        except {BREAK_ONLY}: {BREAK_ONLY} teams sub at the break instead, so
        the alert never appears. Everywhere else, the sub timer only runs
        while a quarter or half is <strong>active</strong> (not paused and
        not at a break). Make sure you&apos;ve tapped{" "}
        <strong>Start Q{"{n}"}</strong> (or <strong>Start H{"{n}"}</strong>{" "}
        in a halves game) after the break. If the clock isn&apos;t running,
        the timer doesn&apos;t count. Also
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
