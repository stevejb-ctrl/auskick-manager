import { createClient } from "@/lib/supabase/server";
import { SquadHeader } from "@/components/squad/SquadHeader";
import { AddPlayerForm } from "@/components/squad/AddPlayerForm";
import { PlayerRow } from "@/components/squad/PlayerRow";
import { getAgeGroupConfig } from "@/lib/sports";
import type { Sport } from "@/lib/types";

interface PlayerListProps {
  teamId: string;
  isAdmin: boolean;
}

export async function PlayerList({ teamId, isAdmin }: PlayerListProps) {
  const supabase = createClient();

  const [{ data: players }, { data: team }] = await Promise.all([
    supabase
      .from("players")
      .select("*")
      .eq("team_id", teamId)
      .order("jersey_number"),
    supabase
      .from("teams")
      .select("age_group, sport")
      .eq("id", teamId)
      .single(),
  ]);

  // Resolve age-group config against the team's sport so netball teams
  // pick up NetSetGO max-squad limits (16) instead of falling through
  // to AFL U10's defaults.
  const sport = ((team as { sport?: string | null } | null)?.sport ?? "afl") as Sport;
  const ageGroupCfg = getAgeGroupConfig(
    sport,
    (team as { age_group?: string | null } | null)?.age_group ?? null,
  );
  const maxPlayers = ageGroupCfg.maxSquadSize;
  const showJersey = sport === "afl";

  const allPlayers = players ?? [];
  const activePlayers = allPlayers.filter((p) => p.is_active);
  const inactivePlayers = allPlayers.filter((p) => !p.is_active);
  const takenJerseys = allPlayers.map((p) => p.jersey_number).filter((n): n is number => n !== null);

  return (
    <div className="space-y-6">
      <SquadHeader activeCount={activePlayers.length} maxPlayers={maxPlayers} />

      {isAdmin && (
        <div className="rounded-lg border border-hairline bg-surface p-5 shadow-card">
          <h2 className="mb-4 text-base font-semibold text-ink">Add player</h2>
          <AddPlayerForm
            teamId={teamId}
            activeCount={activePlayers.length}
            maxPlayers={maxPlayers}
            takenJerseys={takenJerseys}
            showJersey={showJersey}
          />
        </div>
      )}

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
                canEdit={isAdmin}
                showJersey={showJersey}
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
                canEdit={isAdmin}
                showJersey={showJersey}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
