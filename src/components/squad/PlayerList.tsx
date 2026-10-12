import { createClient } from "@/lib/supabase/server";
import { SquadHeader } from "@/components/squad/SquadHeader";
import { AddPlayerForm } from "@/components/squad/AddPlayerForm";
import { BulkAddPlayers } from "@/components/squad/BulkAddPlayers";
import { PlayerRow } from "@/components/squad/PlayerRow";
import { getAgeGroupConfig } from "@/lib/sports";
import type { Sport } from "@/lib/types";
import { Eyebrow, SFCard } from "@/components/sf";
import { resolveTeamPlaybook } from "@/lib/playbook/team";
import { roleModelFor, rolesFromPrefs } from "@/lib/playbook/roles";
import type { PlayerPositionPrefRow, TeamPlaybookRow, TeamPositionRow } from "@/lib/playbook/types";

interface PlayerListProps {
  teamId: string;
  isAdmin: boolean;
}

export async function PlayerList({ teamId, isAdmin }: PlayerListProps) {
  const supabase = createClient();

  const [{ data: players }, { data: team }, { data: playbookRow }, { data: positionRows }, { data: prefRows }] = await Promise.all([
    supabase
      .from("players")
      .select("*")
      .eq("team_id", teamId)
      .order("jersey_number"),
    supabase
      .from("teams")
      .select("age_group, sport, chip_a_label, chip_b_label, chip_c_label, chip_a_mode, chip_b_mode, chip_c_mode")
      .eq("id", teamId)
      .single(),
    supabase
      .from("team_playbooks")
      .select("strategy, policy_overrides, season_balance, season_balance_since")
      .eq("team_id", teamId)
      .maybeSingle(),
    supabase
      .from("team_positions")
      .select("id, label, name, line, sort, archived_at")
      .eq("team_id", teamId)
      .is("archived_at", null),
    supabase
      .from("player_position_prefs")
      .select("player_id, position_key, line, kind, rank")
      .eq("team_id", teamId),
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
  // Player roles (How we play): what the role sheet offers depends on
  // how the team plays — null at AFL zoned ages.
  const roleModel = roleModelFor(
    resolveTeamPlaybook({
      sport,
      ageGroup: ageGroupCfg.id,
      onFieldSize: ageGroupCfg.defaultOnFieldSize,
      row: (playbookRow ?? null) as Pick<
        TeamPlaybookRow,
        "strategy" | "policy_overrides" | "season_balance" | "season_balance_since"
      > | null,
      positions: (positionRows ?? []) as Pick<
        TeamPositionRow,
        "id" | "label" | "name" | "line" | "sort" | "archived_at"
      >[],
    }),
  );
  const roles = roleModel
    ? rolesFromPrefs(
        (prefRows ?? []) as Pick<PlayerPositionPrefRow, "player_id" | "position_key" | "line" | "kind" | "rank">[],
        roleModel.unit,
      )
    : {};
  const showJersey = sport === "afl";
  const teamRow = team as
    | {
        chip_a_label: string | null;
        chip_b_label: string | null;
        chip_c_label: string | null;
        chip_a_mode?: import("@/lib/chips").ChipMode | null;
        chip_b_mode?: import("@/lib/chips").ChipMode | null;
        chip_c_mode?: import("@/lib/chips").ChipMode | null;
      }
    | null;
  const chipLabels = {
    a: teamRow?.chip_a_label ?? null,
    b: teamRow?.chip_b_label ?? null,
    c: teamRow?.chip_c_label ?? null,
  };
  // Threaded into PlayerRow so the chip indicator surfaces the
  // zone-preference letter (F / C / B) when the chip mode is
  // forward / centre / back. Steve 2026-05-20.
  const chipModes: Partial<Record<"a" | "b" | "c", import("@/lib/chips").ChipMode>> = {
    a: teamRow?.chip_a_mode ?? undefined,
    b: teamRow?.chip_b_mode ?? undefined,
    c: teamRow?.chip_c_mode ?? undefined,
  };

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
              showJersey={showJersey}
              chipLabels={chipLabels}
              chipModes={chipModes}
            />
            <div className="mt-3 border-t border-hairline pt-3">
              <BulkAddPlayers
                teamId={teamId}
                withJersey={showJersey}
                room={Math.max(0, maxPlayers - activePlayers.length)}
              />
            </div>
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
                showJersey={showJersey}
                chipLabels={chipLabels}
                chipModes={chipModes}
                roleModel={roleModel}
                role={roles[player.id]}
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
                showJersey={showJersey}
                chipLabels={chipLabels}
                chipModes={chipModes}
              />
            ))}
          </ul>
        </SFCard>
      )}
    </div>
  );
}
