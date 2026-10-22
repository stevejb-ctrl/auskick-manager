import Link from "next/link";
import { SetupProgress } from "@/components/setup/SetupProgress";
import { AddPlayerForm } from "@/components/squad/AddPlayerForm";
import { BulkAddPlayers } from "@/components/squad/BulkAddPlayers";
import { PlayerRow } from "@/components/squad/PlayerRow";
import { getSportConfig } from "@/lib/sports";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { Player, Sport } from "@/lib/types";
import type { PlayerRole, RoleModel } from "@/lib/playbook/roles";

interface SquadStepProps {
  teamId: string;
  ageGroup: AgeGroupConfig;
  players: Player[];
  /** The team's sport: it decides whether kids have jersey numbers. */
  sportId: Sport;
  /** How we play role sheet (from the step before); null where roles don't apply. */
  roleModel?: RoleModel | null;
  roles?: Record<string, PlayerRole>;
  /**
   * A touch or Oztag mixed team: each kid is asked Girl or Boy as
   * they're added and on their row, as Team basics promised (the Squad
   * tab's PlayerList does the same).
   */
  mixed?: boolean;
}

export function SquadStep({
  teamId,
  ageGroup,
  players,
  sportId,
  roleModel = null,
  roles = {},
  mixed = false,
}: SquadStepProps) {
  // The sport decides (AFL and league number their kids; netball's
  // bib is the position).
  const showJersey = getSportConfig(sportId).jerseyNumbers;
  const maxPlayers = ageGroup.maxSquadSize;
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
        <h2 className="mb-1 text-base font-semibold text-ink">Add player</h2>
        <AddPlayerForm
          teamId={teamId}
          activeCount={activePlayers.length}
          maxPlayers={maxPlayers}
          takenJerseys={takenJerseys}
          showJersey={showJersey}
          mixed={mixed}
        />
        <div className="mt-3 border-t border-hairline pt-3">
          <BulkAddPlayers
            teamId={teamId}
            withJersey={showJersey}
            room={Math.max(0, maxPlayers - activePlayers.length)}
          />
        </div>
      </div>

      <div className="rounded-lg border border-hairline bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <h2 className="text-base font-semibold text-ink">
            Squad ({activePlayers.length})
          </h2>
          <span className="text-xs text-ink-mute">max {maxPlayers}</span>
        </div>
        {roleModel && activePlayers.length > 0 && (
          <p className="border-b border-hairline px-4 py-2 text-xs text-ink-dim">
            Tap Role to give a player their {roleModel.unit === "position" ? "home position and backups" : "preferred line"}.
            You can do this later on the Squad tab.
          </p>
        )}
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
                showJersey={showJersey}
                roleModel={roleModel}
                role={roles[player.id]}
                mixed={mixed}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end">
        <Link
          href={`/teams/${teamId}/setup?step=games`}
          className="inline-flex items-center justify-center rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
        >
          Continue
        </Link>
      </div>

      {/* Skip-for-now lives separated from the Continue button —
          previously stacked together and easy to mistap on mobile.
          Now sits as a small ghost link AFTER an explicit visual
          gap, with extra `mt-6` breathing room and centred text so
          it reads as an unstyled-link-ish escape route, not a
          competing CTA. Steve 2026-05-20. */}
      <div className="flex justify-center pt-2">
        <Link
          href={`/teams/${teamId}`}
          className="text-xs font-medium text-ink-mute underline-offset-4 hover:text-ink hover:underline"
        >
          Skip onboarding for now
        </Link>
      </div>
    </div>
  );
}
