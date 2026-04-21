// Screenshots referenced on this page:
//   /help-screenshots/squads-player-list.png
//   /help-screenshots/squads-add-player.png
//   /help-screenshots/squads-availability.png

import Link from "next/link";
import { HelpPage, HelpFigure, HelpCallout } from "@/components/help/HelpPage";

export const metadata = {
  title: "Squads — Help — Auskick Manager",
  description: "Adding players, editing details, managing availability.",
};

export default function SquadsPage() {
  return (
    <HelpPage>
      <h1 className="text-2xl font-bold text-ink">Squads</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-dim">
        The squad is your roster of players for a team. You can add, edit, and
        remove players at any time, and mark who is available for each game.
      </p>

      <HelpFigure
        src="/help-screenshots/squads-player-list.png"
        alt="The squad page showing a list of players with jersey numbers and names"
        caption="The Squad tab shows your full active roster."
      />

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Adding a player</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-dim">
          <li>Open your team and tap the <strong className="text-ink">Squad</strong> tab.</li>
          <li>
            Tap <strong className="text-ink">Add player</strong> at the top of the list.
          </li>
          <li>
            Enter the player&apos;s <strong className="text-ink">full name</strong> and
            their <strong className="text-ink">jersey number</strong>.
          </li>
          <li>
            Tap <strong className="text-ink">Save</strong>. The player appears in the
            active squad list.
          </li>
        </ol>

        <HelpFigure
          src="/help-screenshots/squads-add-player.png"
          alt="The add player form open at the top of the squad list, showing name and jersey number fields"
          caption="Fill in name and jersey number, then tap Save."
        />

        <HelpCallout type="tip">
          Jersey numbers help you identify players quickly during a live game. You
          can use any number — it does not need to be unique.
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Editing a player</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Tap a player&apos;s row in the squad list to open the edit form. Change the name
          or jersey number and tap <strong className="text-ink">Save</strong>.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Removing a player</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Open the player&apos;s edit form and tap{" "}
          <strong className="text-ink">Remove from squad</strong>. The player is
          marked inactive and removed from future lineups. Their historical stats are
          kept.
        </p>
        <HelpCallout type="note">
          Removing a player does not delete their game history. Their minutes and
          zone data remain in the Stats tab.
        </HelpCallout>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-ink">Setting availability before a game</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Before starting a live game, you&apos;ll be asked to mark which players are
          available that day. Only available players are included in the lineup
          picker and rotation suggestions.
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-dim">
          <li>Open the game from the <strong className="text-ink">Games</strong> tab.</li>
          <li>
            Tap <strong className="text-ink">Start game</strong>. The availability
            screen appears.
          </li>
          <li>Tap each player who is present to mark them available.</li>
          <li>
            Tap <strong className="text-ink">Continue to lineup</strong> when done.
          </li>
        </ol>

        <HelpFigure
          src="/help-screenshots/squads-availability.png"
          alt="The availability screen showing a list of players with toggle buttons to mark them present"
          caption="Mark present players before moving to the lineup picker."
        />

        <HelpCallout type="tip">
          You can add a late-arriving player during a live game using the{" "}
          <strong>Late arrival</strong> menu on the live game screen. See{" "}
          <Link href="/help/live-game" className="font-medium underline">
            Live Game
          </Link>{" "}
          for details.
        </HelpCallout>
      </section>
    </HelpPage>
  );
}
