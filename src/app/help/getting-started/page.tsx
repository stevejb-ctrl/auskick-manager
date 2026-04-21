// Screenshots referenced on this page:
//   /help-screenshots/getting-started-signup.png
//   /help-screenshots/getting-started-create-team.png
//   /help-screenshots/getting-started-add-players.png
//   /help-screenshots/getting-started-create-game.png

import Link from "next/link";
import { HelpPage, HelpFigure, HelpCallout } from "@/components/help/HelpPage";

export const metadata = {
  title: "Getting Started — Help — Siren",
  description: "Sign in, create your first team, add players, and schedule a game.",
};

export default function GettingStartedPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Getting Started</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-dim">
        You can be up and running in about five minutes. This guide walks through
        every step: creating an account, setting up your team, adding your squad,
        and scheduling your first game.
      </p>

      {/* Step 1 — Sign in */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">1. Create your account</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-dim">
          <li>
            Go to{" "}
            <Link href="/signup" className="font-medium text-brand-600 hover:underline">
              /signup
            </Link>
            .
          </li>
          <li>Enter your email address and choose a password.</li>
          <li>
            Tap <strong className="text-ink">Create account</strong>. You&apos;ll
            land on your dashboard straight away — no email confirmation required.
          </li>
        </ol>
        <p className="mt-3 text-sm text-ink-dim">
          Already have an account? Go to{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            /login
          </Link>{" "}
          instead.
        </p>

        <HelpFigure
          src="/help-screenshots/getting-started-signup.png"
          alt="The Siren sign-up form with email and password fields"
          caption="The sign-up form. Fill in your email and password to get started."
        />
      </section>

      {/* Step 2 — Create team */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">2. Create your first team</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-dim">
          <li>
            On the dashboard, tap <strong className="text-ink">New team</strong>.
          </li>
          <li>
            Give your team a name (e.g. <em>Brunswick U10s</em>) and select the
            age group / position model. The position model controls how many zones
            appear on the field and how rotation suggestions are generated.
          </li>
          <li>
            Tap <strong className="text-ink">Create team</strong>. Your new team
            card appears on the dashboard.
          </li>
        </ol>

        <HelpFigure
          src="/help-screenshots/getting-started-create-team.png"
          alt="The create team form showing a team name field and age group selector"
          caption="Name your team and pick the position model before saving."
        />

        <HelpCallout type="tip">
          You can rename the team or change its settings any time from the team&apos;s{" "}
          <strong>Settings</strong> tab. See{" "}
          <Link href="/help/teams" className="font-medium underline">
            Teams
          </Link>{" "}
          for details.
        </HelpCallout>
      </section>

      {/* Step 3 — Add players */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">3. Add your squad</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-dim">
          <li>Open your team and tap the <strong className="text-ink">Squad</strong> tab.</li>
          <li>
            Tap <strong className="text-ink">Add player</strong>. Enter the player&apos;s
            full name and jersey number, then tap <strong className="text-ink">Save</strong>.
          </li>
          <li>Repeat for every player in your squad.</li>
        </ol>
        <p className="mt-3 text-sm text-ink-dim">
          You can add more players at any time, including on game day. See{" "}
          <Link href="/help/squads" className="font-medium text-brand-600 hover:underline">
            Squads
          </Link>{" "}
          for editing, removing, and managing availability.
        </p>

        <HelpFigure
          src="/help-screenshots/getting-started-add-players.png"
          alt="The squad page with the Add player form open, showing name and jersey number fields"
          caption="The squad page. Tap Add player to build out your roster."
        />
      </section>

      {/* Step 4 — Create game */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">4. Schedule a game</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-dim">
          <li>Open your team and tap the <strong className="text-ink">Games</strong> tab.</li>
          <li>
            Tap <strong className="text-ink">New game</strong>. Fill in the opponent name,
            round number, date, time, and optional venue.
          </li>
          <li>
            Tap <strong className="text-ink">Save</strong>. The game appears in your games list
            with <em>Upcoming</em> status.
          </li>
        </ol>

        <HelpFigure
          src="/help-screenshots/getting-started-create-game.png"
          alt="The create game form with fields for opponent, round, date, time, and venue"
          caption="Tap New game to schedule a match."
        />

        <HelpCallout type="tip">
          On game day, open the game card and tap{" "}
          <strong>Start game</strong> to enter the live game view. See{" "}
          <Link href="/help/live-game" className="font-medium underline">
            Live Game
          </Link>{" "}
          for a full walkthrough.
        </HelpCallout>
      </section>

      {/* Next steps */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">What&apos;s next?</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink-dim">
          <li>
            <Link href="/help/live-game" className="font-medium text-brand-600 hover:underline">
              Live Game →
            </Link>{" "}
            Running a game on the day: lineups, scoring, subs, quarter breaks.
          </li>
          <li>
            <Link href="/help/rotations" className="font-medium text-brand-600 hover:underline">
              Rotations →
            </Link>{" "}
            How the algorithm suggests fair swaps.
          </li>
          <li>
            <Link href="/help/stats" className="font-medium text-brand-600 hover:underline">
              Stats →
            </Link>{" "}
            Everything you can see in the Stats tab after games are played.
          </li>
        </ul>
      </section>
    </HelpPage>
  );
}
