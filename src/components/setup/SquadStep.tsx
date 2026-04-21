import Link from "next/link";
import { SetupProgress } from "@/components/setup/SetupProgress";
import { AddPlayerForm } from "@/components/squad/AddPlayerForm";
import { PlayerRow } from "@/components/squad/PlayerRow";
import { AGE_GROUPS } from "@/lib/ageGroups";
import type { AgeGroup, Player } from "@/lib/types";

interface SquadStepProps {
  teamId: string;
  ageGroup: AgeGroup;
  players: Player[];
}

export function SquadStep({ teamId, ageGroup, players }: SquadStepProps) {
  const maxPlayers = AGE_GROUPS[ageGroup].maxSquadSize;
  const activePlayers = players.filter((p) => p.is_active);
  const takenJerseys = players.map((p) => p.jersey_number).filter((n): n is number => n !== null);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <SetupProgress current="squad" teamId={teamId} />

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-ink">Add the squad</h1>
        <p className="text-sm text-ink-dim">
          Add the regulars you know are signed up. You can add more players
          anytime, and fill-ins can jump in on match day without joining the
          permanent roster. 15–20 kids gives you plenty of cover for injuries
          and missed Saturdays.
        </p>
      </div>

      <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
        <h2 className="mb-4 text-base font-semibold text-ink">Add player</h2>
        <AddPlayerForm
          teamId={teamId}
          activeCount={activePlayers.length}
          maxPlayers={maxPlayers}
          takenJerseys={takenJerseys}
        />
      </div>

      <div className="rounded-lg border border-hairline bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <h2 className="text-base font-semibold text-ink">
            Squad ({activePlayers.length})
          </h2>
          <span className="text-xs text-ink-mute">max {maxPlayers}</span>
        </div>
        {activePlayers.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-mute">
            No players yet — add your first one above.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {activePlayers.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                teamId={teamId}
                takenJerseys={takenJerseys}
                canEdit
              />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Link
          href={`/teams/${teamId}`}
          className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-surface-alt hover:text-ink"
        >
          Skip for now
        </Link>
        <Link
          href={`/teams/${teamId}/setup?step=games`}
          className="inline-flex items-center justify-center rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
        >
          Continue
        </Link>
      </div>
    </div>
  );
}
