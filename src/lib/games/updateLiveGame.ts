// The live screen's writes to the game row: kick-off, Game settings,
// Finish game. Row Level Security drops an update it doesn't allow
// without an error, so a game manager's kick-off once saved nothing and
// the game read "Upcoming" all game (Stagehand round 9). This asks for
// the row back and calls a write that changed nothing what it is.

import type { SupabaseClient } from "@supabase/supabase-js";

export const GAME_NOT_SAVED =
  "Siren couldn't save this game. Ask the team's admin to check you're still a game manager.";

export async function updateLiveGame(
  supabase: SupabaseClient,
  gameId: string,
  fields: Record<string, unknown>,
): Promise<{ error: { code?: string | null; message: string } | null }> {
  const { data, error } = await supabase.from("games").update(fields).eq("id", gameId).select("id");
  if (error) return { error };
  if (!data || data.length === 0) return { error: { code: "42501", message: GAME_NOT_SAVED } };
  return { error: null };
}
