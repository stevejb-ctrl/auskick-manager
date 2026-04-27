import { createClient } from "@/lib/supabase/server";
import { SquadHeader } from "@/components/squad/SquadHeader";
import { AddPlayerForm } from "@/components/squad/AddPlayerForm";
import { PlayerRow } from "@/components/squad/PlayerRow";
import { Eyebrow, SFCard } from "@/components/sf";
import { AGE_GROUPS, ageGroupOf } from "@/lib/ageGroups";

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
      .select("age_group")
      .eq("id", teamId)
      .single(),
  ]);

  const ageGroup = ageGroupOf((team as { age_group?: string } | null)?.age_group);
  const maxPlayers = AGE_GROUPS[ageGroup].maxSquadSize;

  const allPlayers = players ?? [];
  const activePlayers = allPlayers.filter((p) => p.is_active);
  const inactivePlayers = allPlayers.filter((p) => !p.is_active);
  const takenJerseys = allPlayers
    .map((p) => p.jersey_number)
    .filter((n): n is number => n !== null);

  return (
    <div className="space-y-6">
      <SquadHeader activeCount={activePlayers.length} maxPlayers={maxPlayers} />

      {isAdmin && (
        <SFCard>
          <Eyebrow>Add player</Eyebrow>
          <div className="mt-3">
            <AddPlayerForm
              teamId={teamId}
              activeCount={activePlayers.length}
              maxPlayers={maxPlayers}
              takenJerseys={takenJerseys}
            />
          </div>
        </SFCard>
      )}

      <SFCard pad={0}>
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3 sm:px-5">
          <Eyebrow>On the squad</Eyebrow>
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink-mute">
            {activePlayers.length} active
          </span>
        </div>
        {activePlayers.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-mute">
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
              />
            ))}
          </ul>
        )}
      </SFCard>

      {inactivePlayers.length > 0 && (
        <SFCard pad={0}>
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3 sm:px-5">
            <Eyebrow>Inactive</Eyebrow>
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink-mute">
              {inactivePlayers.length}
            </span>
          </div>
          <ul className="divide-y divide-hairline">
            {inactivePlayers.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                teamId={teamId}
                takenJerseys={takenJerseys}
                canEdit={isAdmin}
              />
            ))}
          </ul>
        </SFCard>
      )}
    </div>
  );
}
