import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Support · Siren Footy",
  description:
    "Help and support for Siren Footy — getting started, common questions, deleting your account, and how to reach us.",
  alternates: { canonical: "/support" },
};

// Last updated shown at the top. Bump on substantive changes —
// new FAQ entry, contact-email change, etc. Typo fixes don't count.
const LAST_UPDATED = "16 May 2026";

const SUPPORT_EMAIL = "hello@sirenfooty.com.au";

// Linked from both App Store Connect and Play Console as the
// "Support URL". Apple + Google reviewers click this; they expect a
// reachable contact path and a fair go at common questions. The
// account-deletion entry in particular is required to be discoverable
// from outside the app (Apple guideline 5.1.1(v) follow-on).
export default function SupportPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tightest text-ink sm:text-4xl">
        Support
      </h1>
      <p className="mt-2 text-sm text-ink-mute">Last updated: {LAST_UPDATED}</p>

      <div className="prose-siren mt-8 space-y-8 text-ink-dim">
        <section>
          <p className="text-base leading-relaxed">
            Need a hand with Siren Footy? The fastest path is email — we read
            every message and reply within a day or two during the season.
          </p>
          <p className="mt-4 text-base leading-relaxed">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-brand-700 underline-offset-2 hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </section>

        <Section title="Getting started">
          <ul>
            <li>
              <strong>Create a team.</strong> Sign in, hit{" "}
              <em>Create a new team</em>, pick your sport and age group.
              You become the team&rsquo;s admin automatically.
            </li>
            <li>
              <strong>Add your squad.</strong> Open the team &rarr; Squad
              tab, then add each player&rsquo;s name and jersey number.
              Up to 15 active players per team.
            </li>
            <li>
              <strong>Set up your first game.</strong> Games tab &rarr;{" "}
              <em>New game</em>. Pick the opponent, date, and round
              number. Tap into the game to mark availability the day
              before, then <em>Start game</em> on game day to open the
              lineup picker.
            </li>
            <li>
              <strong>Invite your assistants.</strong> Team Settings
              &rarr; Members &rarr; <em>Invite someone</em>. Send the
              link via your team chat — assistants accept and pick up
              the runner role or game-manager role you assigned.
            </li>
          </ul>
        </Section>

        <Section title="Common questions">
          <h3 className="text-base font-semibold text-ink">
            The app went offline mid-game. Did I lose anything?
          </h3>
          <p>
            No. Siren queues your taps locally while you&rsquo;re
            disconnected and replays them in order when the connection
            comes back. The game keeps running on your phone in the
            meantime — clock, swaps, goals, the lot. You&rsquo;ll see a{" "}
            <em>Reconnecting&hellip;</em> chip while it catches up.
          </p>

          <h3 className="text-base font-semibold text-ink">
            How do I share the game with parents during the match?
          </h3>
          <p>
            From the game detail page, tap <em>Share runner link</em>.
            That generates a URL anyone can open without an account to
            see live scores and rotations. Use it for the scoreboard
            operator on the sideline, or paste it into your team chat
            at kick-off.
          </p>

          <h3 className="text-base font-semibold text-ink">
            Can I edit a goal I tapped by mistake?
          </h3>
          <p>
            Yes. Open the score-bug and tap <em>Undo last</em> within
            the same quarter, or open the quarter-break recap to remove
            a specific event after the quarter ends.
          </p>

          <h3 className="text-base font-semibold text-ink">
            Why is the rotation suggester telling me to bench my best
            kid?
          </h3>
          <p>
            Siren&rsquo;s default is fair time across the season, not
            best-team-on-the-field. If you have a player who needs to
            stay on (e.g. a young one finding their feet), tap-and-hold
            them &rarr; <em>Always on field</em>. They&rsquo;ll be
            excluded from the rotation for the rest of the game.
          </p>

          <h3 className="text-base font-semibold text-ink">
            Does the app work on iPad and tablets?
          </h3>
          <p>
            Yes — the same web app runs in any modern browser, and the
            iOS app supports iPad in compatibility mode. A dedicated
            tablet layout is on the roadmap for the 2027 season.
          </p>
        </Section>

        <Section title="Deleting your account">
          <p>
            You can delete your account from inside the app at any
            time. Sign in &rarr; tap your avatar (top right) &rarr;{" "}
            <strong>My account</strong> &rarr;{" "}
            <strong>Delete my account&hellip;</strong>. We&rsquo;ll
            schedule the deletion 30 days out so you can change your
            mind. After the grace period elapses, all your personal
            data is permanently removed.
          </p>
          <p>
            If you&rsquo;re the sole admin on a team, that team and
            its history are deleted alongside your account. To keep a
            team alive, promote another admin first via Team Settings
            &rarr; Members.
          </p>
          <p>
            Can&rsquo;t reach the app for some reason and need an
            account removed? Email{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-brand-700 underline-offset-2 hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            from the address on the account and we&rsquo;ll do it
            manually.
          </p>
        </Section>

        <Section title="Your data">
          <p>
            For details on what we collect and how we use it, see our{" "}
            <Link href="/privacy" className="text-brand-700 underline-offset-2 hover:underline">
              Privacy Policy
            </Link>
            . We follow the Australian Privacy Principles in the{" "}
            <em>Privacy Act 1988</em> (Cth). You can request a copy of
            your data, ask us to correct anything, or raise a privacy
            concern by emailing{" "}
            <a
              href="mailto:privacy@sirenfooty.com.au"
              className="text-brand-700 underline-offset-2 hover:underline"
            >
              privacy@sirenfooty.com.au
            </a>
            .
          </p>
        </Section>

        <Section title="Reporting a bug">
          <p>
            Found something broken? The most useful bug report
            includes:
          </p>
          <ul>
            <li>What you were trying to do.</li>
            <li>What happened instead.</li>
            <li>The device and browser (or iOS / Android version).</li>
            <li>A screenshot if the issue is visual.</li>
          </ul>
          <p>
            Email{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-brand-700 underline-offset-2 hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            and we&rsquo;ll look into it.
          </p>
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed [&_a]:text-brand-700 [&_a:hover]:underline [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_strong]:text-ink [&_h3]:mt-5">
        {children}
      </div>
    </section>
  );
}
