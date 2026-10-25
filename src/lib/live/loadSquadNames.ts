import type { SupabaseClient } from "@supabase/supabase-js";
import type { NamedPlayer } from "@/lib/names";

/** The squad's active kids and the game's fill-ins, for SquadNamesProvider. */
export async function loadSquadNames(
  supabase: SupabaseClient,
  teamId: string,
  gameId: string,
): Promise<NamedPlayer[]> {
  const [{ data: players }, { data: fillIns }] = await Promise.all([
    supabase
      .from("players")
      .select("id, full_name, jersey_number")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .order("jersey_number")
      .order("full_name")
      .order("id"),
    supabase.from("game_fill_ins").select("id, full_name, jersey_number").eq("game_id", gameId).order("id"),
  ]);
  return [...((players ?? []) as NamedPlayer[]), ...((fillIns ?? []) as NamedPlayer[])];
}
