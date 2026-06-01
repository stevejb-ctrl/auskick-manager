// ─── reconcileLineupToAvailability ───────────────────────────────
// B1 / AVAIL-01 server-side backstop. Availability is the source of
// truth at kickoff — the game must NEVER start a player the coach
// marked unavailable, even when a stale lineup draft placed them on
// the field. All three per-sport start actions (startGame /
// startNetballGame / startLeagueGame) commit whatever lineup the
// client sends as a `lineup_set` event; this helper strips any id
// not in the server-computed availableIds union BEFORE that insert.
//
// The union semantics live here (one impl, no per-sport drift —
// reuse-before-fork, CLAUDE.md) and mirror the live-read union in
// live/page.tsx:211-221 so "available at kickoff" == "available
// live". Vacated spots are intentionally left empty (D-04): the
// normal rotation fills them, no backfill here.

import type { SupabaseClient } from "@supabase/supabase-js";

// Build the availableIds union for a game: explicit
// game_availability rows with status='available' + all game_fill_ins
// ids (implicitly available) + every player_arrived event's
// player_id. Takes an ALREADY-RESOLVED client — the three start
// actions each hold their `w.supabase` (resolveWriter is not
// exported), and the token path's admin client reads the same tables
// so the union is identical (D-06).
export async function buildAvailableIds(
  supabase: SupabaseClient,
  gameId: string,
): Promise<Set<string>> {
  const [{ data: avail }, { data: fillIns }, { data: events }] =
    await Promise.all([
      supabase
        .from("game_availability")
        .select("player_id")
        .eq("game_id", gameId)
        .eq("status", "available"),
      supabase.from("game_fill_ins").select("id").eq("game_id", gameId),
      supabase
        .from("game_events")
        .select("player_id, type")
        .eq("game_id", gameId)
        .eq("type", "player_arrived"),
    ]);
  return new Set<string>([
    ...((avail ?? []).map((a) => a.player_id as string)),
    ...((fillIns ?? []).map((f) => f.id as string)),
    ...((events ?? [])
      .filter((e) => e.player_id)
      .map((e) => e.player_id as string)),
  ]);
}

// Structural filter applied to whatever lineup shape a sport passes.
// AFL `Lineup` and league `LeagueLineup` are flat objects whose values
// are `string[]` zone arrays. The netball `GenericLineup` nests its
// court positions one level deeper:
//   { positions: { gs: [...], ga: [...], ... }, bench: [...] }
// so the filter must recurse: a `string[]` value is filtered in place;
// an object value (netball's `positions`) is descended into. This
// keeps ONE union impl across all three sports without forking a
// per-sport filter (the netball nesting is the only divergence and
// it's handled structurally, not by branching on sport).
function filterValue(value: unknown, availableIds: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.filter(
      (id) => typeof id === "string" && availableIds.has(id),
    );
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = filterValue(v, availableIds);
    }
    return out;
  }
  return value;
}

export async function reconcileLineupToAvailability<T>(
  supabase: SupabaseClient,
  gameId: string,
  lineup: T,
): Promise<T> {
  const availableIds = await buildAvailableIds(supabase, gameId);
  return filterValue(lineup, availableIds) as T;
}
