// Screenshots referenced on this page:
//   /help-screenshots/teams-dashboard.png
//   /help-screenshots/teams-settings.png

import Link from "next/link";
import { HelpPage, HelpFigure, HelpCallout } from "@/components/help/HelpPage";

export const metadata = {
  title: "Teams · Help · Siren",
  description: "Creating and managing teams, age groups, admin roles, and settings.",
  alternates: { canonical: "/help/teams" },
};

export default function TeamsPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Teams</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-dim">
        A team is the container for your squad, games, and season stats. You can
        manage multiple teams from the same account, for example if you coach an
        U10s and an U12s group in the same club.
      </p>

      <HelpFigure
        src="/help-screenshots/teams-dashboard.png"
        alt="The dashboard showing multiple team cards with team name and recent game details"
        caption="All your teams appear on the dashboard. Tap a card to open that team."
      />

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Creating a team</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-dim">
          <li>
            From the dashboard, tap <strong className="text-ink">New team</strong>.
          </li>
          <li>Enter a team name (e.g. <em>Brunswick U10s Blue</em>).</li>
          <li>
            Choose a <strong className="text-ink">sport</strong> and{" "}
            <strong className="text-ink">age group</strong>. These set which
            positions appear during a live game and how rotation suggestions are
            generated.
          </li>
          <li>
            Tap <strong className="text-ink">Create team</strong>.
          </li>
        </ol>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Renaming a team</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-dim">
          <li>Open the team and tap the <strong className="text-ink">Settings</strong> tab.</li>
          <li>Edit the team name field.</li>
          <li>Tap <strong className="text-ink">Save</strong>.</li>
        </ol>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Age groups and position layouts</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          The age group sets the position layout that appears during a live game.
          Younger football age groups use a 3-zone layout (FORWARD / CENTRE /
          BACK); older groups expand to 5 zones with the addition of H-FWD and
          H-BCK. Netball teams always use 7 fixed positions across three thirds:
          GS, GA, WA, C, WD, GD, GK.
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          The rotation algorithm tracks how many minutes (or quarters, for
          netball) each player has spent in each position so it can suggest
          fair swaps. See{" "}
          <Link href="/help/rotations" className="font-medium text-brand-600 hover:underline">
            Rotations
          </Link>{" "}
          for details.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Admin roles</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          The coach who creates a team is automatically the team admin. Admins can:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-dim">
          <li>Rename or delete the team</li>
          <li>Add and remove players from the squad</li>
          <li>Create, edit, and delete games</li>
          <li>Invite other coaches to help manage the team</li>
        </ul>
        <HelpCallout type="note">
          Team invitations are sent via a join link. Share the link from the
          team&apos;s <strong>Settings</strong> page. Anyone with the link can join
          as a game manager.
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Deleting a team</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          To delete a team, open the team <strong className="text-ink">Settings</strong> tab
          and scroll to the bottom. Tap <strong className="text-ink">Delete team</strong> and
          confirm. This permanently removes all games and stats for that team.
        </p>
        <HelpCallout type="warning">
          Deleting a team cannot be undone. All game history and stats are permanently
          removed.
        </HelpCallout>

        <HelpFigure
          src="/help-screenshots/teams-settings.png"
          alt="The team settings page showing name, age group, and a delete team button at the bottom"
          caption="Team settings: rename, change the age group, or delete the team."
        />
      </section>
    </HelpPage>
  );
}
