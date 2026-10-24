// ─── The live sync stamp ─────────────────────────────────────
// What <LiveSync> compares: one short string that changes whenever the
// game does — an event lands or goes (a score, an undo, a sub, a period,
// a restart deleting them all), or the game's status or settings change.
// The live page renders with the stamp it read *before* its own data, so
// a write that lands in between makes the next check differ and refresh
// once more, never miss. The sync routes return the same string.
//
// Two light queries: the game's row, and its newest event plus a count.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function readLiveSyncStamp(supabase: SupabaseClient, gameId: string): Promise<string | null> {
  const [{ data: game }, { data: latest, count }] = await Promise.all([
    supabase
      .from("games")
      .select("status, on_field_size, sub_interval_seconds, quarter_length_seconds")
      .eq("id", gameId)
      .maybeSingle(),
    supabase
      .from("game_events")
      .select("id, created_at", { count: "exact" })
      .eq("game_id", gameId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1),
  ]);
  if (!game) return null;
  const g = game as {
    status?: string | null;
    on_field_size?: number | null;
    sub_interval_seconds?: number | null;
    quarter_length_seconds?: number | null;
  };
  const last = ((latest ?? []) as { id: string; created_at: string }[])[0];
  return [
    g.status ?? "",
    count ?? 0,
    last?.created_at ?? "",
    last?.id ?? "",
    g.on_field_size ?? "",
    g.sub_interval_seconds ?? "",
    g.quarter_length_seconds ?? "",
  ].join("|");
}
