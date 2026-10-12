// Load a team's How we play for a server page: the stored row, the
// team's own positions and every player's prefs, resolved against the
// sport and age group. One query each, in parallel.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAgeGroupConfig } from "@/lib/sports";
import { resolveTeamPlaybook, type ResolvedPlaybook } from "@/lib/playbook/team";
import { activeRules, sanitizeRules, type RuleInstance } from "@/lib/playbook/rules";
import type { PlayerPositionPrefRow, TeamPlaybookRow, TeamPositionRow } from "@/lib/playbook/types";
import type { Sport } from "@/lib/types";
import { roleModelFor, rolesFromPrefs, type PlayerRole, type RoleModel } from "@/lib/playbook/roles";

export type PrefRow = Pick<PlayerPositionPrefRow, "player_id" | "position_key" | "line" | "kind" | "rank">;

export interface LoadedPlaybook {
  resolved: ResolvedPlaybook;
  prefs: PrefRow[];
  /** The team's own rules that are on (How we play › Rules). */
  rules: RuleInstance[];
  /** Rugby league vest strategy. */
  vestStrategy: "auto" | "fixed-order" | "coach";
}

export async function loadTeamPlaybook(
  supabase: SupabaseClient<any, any, any>,
  teamId: string,
  sport: Sport,
  ageGroup: string | null,
): Promise<LoadedPlaybook> {
  const ageCfg = getAgeGroupConfig(sport, ageGroup);
  const [{ data: row }, { data: positions }, { data: prefs }] = await Promise.all([
    supabase
      .from("team_playbooks")
      .select("strategy, policy_overrides, season_balance, season_balance_since, rules, vest_strategy")
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
  const resolved = resolveTeamPlaybook({
    sport,
    ageGroup: ageCfg.id,
    onFieldSize: ageCfg.defaultOnFieldSize,
    row: (row ?? null) as Pick<
      TeamPlaybookRow,
      "strategy" | "policy_overrides" | "season_balance" | "season_balance_since"
    > | null,
    positions: (positions ?? []) as Pick<
      TeamPositionRow,
      "id" | "label" | "name" | "line" | "sort" | "archived_at"
    >[],
  });
  return {
    resolved,
    prefs: (prefs ?? []) as PrefRow[],
    rules: activeRules(sanitizeRules((row as { rules?: unknown } | null)?.rules ?? [], null)),
    vestStrategy: (row as { vest_strategy?: "auto" | "fixed-order" | "coach" } | null)?.vest_strategy ?? "auto",
  };
}

/**
 * The squad's role sheet: what it offers (null where roles don't
 * apply, e.g. AFL zoned ages) and each player's saved role. Shared by
 * the Squad tab and the setup wizard's squad step.
 */
export async function loadSquadRoles(
  supabase: SupabaseClient<any, any, any>,
  teamId: string,
  sport: Sport,
  ageGroup: string | null,
): Promise<{ roleModel: RoleModel | null; roles: Record<string, PlayerRole> }> {
  const { resolved, prefs } = await loadTeamPlaybook(supabase, teamId, sport, ageGroup);
  const roleModel = roleModelFor(resolved);
  return { roleModel, roles: roleModel ? rolesFromPrefs(prefs, roleModel.unit) : {} };
}
