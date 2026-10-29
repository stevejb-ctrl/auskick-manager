import { createClient } from "@/lib/supabase/server";
import { SquadHeader } from "@/components/squad/SquadHeader";
import { AddPlayerForm } from "@/components/squad/AddPlayerForm";
import { BulkAddPlayers } from "@/components/squad/BulkAddPlayers";
import { SquadRows } from "@/components/squad/SquadRows";
import { getAgeGroupConfig, getSportConfig, isTouch, teamSport } from "@/lib/sports";
import { teamMixedRule } from "@/lib/sports/touch/mixed";
import type { Sport } from "@/lib/types";
import { Eyebrow, SFCard } from "@/components/sf";
import { loadSquadRoles } from "@/lib/playbook/load";
import { teamSportById } from "@/lib/sports/teamSportById";
import { notFound } from "next/navigation";

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
      .select("age_group, sport, mixed_max_boys, mixed_min_girls, mixed_min_boys")
      .eq("id", teamId)
      .single(),
  ]);

  // Resolve age-group config against the team's sport so netball teams
  // pick up NetSetGO max-squad limits (16) instead of falling through
  // to AFL U10's defaults.
  const sport = team ? teamSport((team as { sport?: string | null }).sport) : ((await teamSportById(teamId)) ?? notFound());
  const ageGroupCfg = getAgeGroupConfig(
    sport,
    (team as { age_group?: string | null } | null)?.age_group ?? null,
  );
  const maxPlayers = ageGroupCfg.maxSquadSize;
  // Player roles (How we play): what the role sheet offers depends on
  // how the team plays — null at AFL zoned ages.
  const { roleModel, roles } = await loadSquadRoles(supabase, teamId, sport, ageGroupCfg.id);
  const showJersey = getSportConfig(sport).jerseyNumbers;
  // Touch and Oztag mixed teams ask who each kid counts as (the coach only).
  const mixed = isTouch(sport) && teamMixedRule(team as { mixed_max_boys?: number | null; mixed_min_girls?: number | null; mixed_min_boys?: number | null }) !== null;

  const allPlayers = players ?? [];
  const activePlayers = allPlayers.filter((p) => p.is_active);
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
              squad={allPlayers.map((p) => ({ full_name: p.full_name, jersey_number: p.jersey_number, is_active: p.is_active }))}
              showJersey={showJersey}
              mixed={mixed}
            />
            <div className="mt-3 border-t border-hairline pt-3">
              <BulkAddPlayers
                teamId={teamId}
                withJersey={showJersey}
                room={Math.max(0, maxPlayers - activePlayers.length)}
                squad={allPlayers.map((p) => ({ full_name: p.full_name, jersey_number: p.jersey_number, is_active: p.is_active }))}
              />
            </div>
          </div>
        </SFCard>
      )}

      <SquadRows
        players={allPlayers}
        teamId={teamId}
        takenJerseys={takenJerseys}
        isAdmin={isAdmin}
        showJersey={showJersey}
        roleModel={roleModel}
        roles={roles}
        mixed={mixed}
      />
    </div>
  );
}
