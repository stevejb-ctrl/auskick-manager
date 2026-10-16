// games.playbook_snapshot (UX plan 3.7): what a game was played under —
// effective policy, strategy, season balance and named positions —
// frozen at kickoff so a later change to How we play never rewrites
// a finished game, and stats can key by the positions in force.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTeamPlaybook } from "@/lib/playbook/load";
import { playbookSnapshot } from "@/lib/playbook/team";
import type { PlaybookSnapshot } from "@/lib/playbook/types";
import type { Sport } from "@/lib/types";
import { teamSport } from "@/lib/sports";

export async function kickoffSnapshot(
  supabase: SupabaseClient<any, any, any>,
  teamId: string,
): Promise<PlaybookSnapshot | null> {
  const { data: team } = await supabase
    .from("teams")
    .select("sport, age_group")
    .eq("id", teamId)
    .maybeSingle();
  if (!team) return null;
  const sport = teamSport(team.sport);
  const { resolved, rules } = await loadTeamPlaybook(supabase, teamId, sport, team.age_group as string | null);
  return { ...playbookSnapshot(resolved), rules };
}
