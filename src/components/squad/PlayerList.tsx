import { createClient } from "@/lib/supabase/server";
import { SquadHeader } from "@/components/squad/SquadHeader";
import { AddPlayerForm } from "@/components/squad/AddPlayerForm";
import { PlayerRow } from "@/components/squad/PlayerRow";
import { AGE_GROUPS, ageGroupOf } from "@/lib/ageGroups";

interface PlayerListProps {
  teamId: string;
}

export async function PlayerList({ teamId }: PlayerListProps) {
  const supabase = createClient();

  const [{ data: players }, { data: team }] = await Promise.all([
    supabase
      .from("players")
      .select("*")
      .eq("team_id", teamId)
      .order("jersey_number"),
    supabase
      .from("teams")
      .select("age_group")
      .eq("id", teamId)
      .single(),
  ]);

  const ageGroup = ageGroupOf((team as { age_group?: string } | null)?.age_group);
  const maxPlayers = AGE_GROUPS[ageGroup].maxSquadSize;

  const allPlayers = players ?? [];
  const activePlayers = allPlayers.filter((p) => p.is_active);
  const inactivePlayers = allPlayers.filter((p) => !p.is_active);
  const takenJerseys = allPlayers.map((p) => p.jersey_number);

  return (
    <div className="space-y-6">
      <SquadHeader activeCount={activePlayers.length} maxPlayers={maxPlayers} />

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
        <div className="border-b border-hairline px-4 py-3">
          <h2 className="text-base font-semibold text-ink">
            Active squad ({activePlayers.length})
          </h2>
        </div>
        {activePlayers.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-mute">
            No players yet — add your first player above.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {activePlayers.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                teamId={teamId}
                takenJerseys={takenJerseys}
              />
            ))}
          </ul>
        )}
      </div>

      {inactivePlayers.length > 0 && (
        <div className="rounded-lg border border-hairline bg-surface shadow-card">
          <div className="border-b border-hairline px-4 py-3">
            <h2 className="text-base font-semibold text-ink-mute">
              Inactive ({inactivePlayers.length})
            </h2>
          </div>
          <ul className="divide-y divide-hairline">
            {inactivePlayers.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                teamId={teamId}
                takenJerseys={takenJerseys}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
