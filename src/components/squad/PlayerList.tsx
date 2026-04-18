import { createClient } from "@/lib/supabase/server";
import { SquadHeader } from "@/components/squad/SquadHeader";
import { AddPlayerForm } from "@/components/squad/AddPlayerForm";
import { PlayerRow } from "@/components/squad/PlayerRow";

interface PlayerListProps {
  teamId: string;
}

export async function PlayerList({ teamId }: PlayerListProps) {
  const supabase = createClient();

  const { data: players } = await supabase
    .from("players")
    .select("*")
    .eq("team_id", teamId)
    .order("jersey_number");

  const allPlayers = players ?? [];
  const activePlayers = allPlayers.filter((p) => p.is_active);
  const inactivePlayers = allPlayers.filter((p) => !p.is_active);
  const takenJerseys = allPlayers.map((p) => p.jersey_number);

  return (
    <div className="space-y-6">
      <SquadHeader activeCount={activePlayers.length} />

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-800">Add player</h2>
        <AddPlayerForm
          teamId={teamId}
          activeCount={activePlayers.length}
          takenJerseys={takenJerseys}
        />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-800">
            Active squad ({activePlayers.length})
          </h2>
        </div>
        {activePlayers.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            No players yet — add your first player above.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
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
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-base font-semibold text-gray-500">
              Inactive ({inactivePlayers.length})
            </h2>
          </div>
          <ul className="divide-y divide-gray-100">
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
