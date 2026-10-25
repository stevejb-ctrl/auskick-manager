// games.playbook_snapshot (UX plan 3.7): what a game was played under —
// effective policy, strategy, season balance and named positions —
// frozen at kickoff so a later change to How we play never rewrites
// a finished game, and stats can key by the positions in force. It also
// records whether the game kept score, so turning the team's scoring on
// or off later doesn't rewrite its result (UX round 3, 24 Oct 2026).

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
    .select("sport, age_group, track_scoring")
    .eq("id", teamId)
    .maybeSingle();
  if (!team) return null;
  const sport = teamSport(team.sport);
  const { resolved, rules } = await loadTeamPlaybook(supabase, teamId, sport, team.age_group as string | null);
  return { ...playbookSnapshot(resolved), rules, trackScoring: team.track_scoring === true };
}
