// Reading and writing player_game_time (migration 0054). Server only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAgeGroupConfig, getEffectiveQuarterSeconds } from "@/lib/sports";
import type { GameEvent, Sport } from "@/lib/types";
import { gameRollupRows, type PlayerGameTimeRow } from "@/lib/playbook/rollup";

type Client = SupabaseClient<any, any, any>;

/** A game's effective period length, as the live screens use it. */
async function periodSecondsFor(client: Client, gameId: string): Promise<{ sport: Sport; teamId: string; seconds: number } | null> {
  const { data: game } = await client
    .from("games")
    .select("team_id, quarter_length_seconds, teams(sport, age_group, quarter_length_seconds)")
    .eq("id", gameId)
    .maybeSingle();
  if (!game) return null;
  const team = (game as unknown as {
    teams: { sport: Sport | null; age_group: string | null; quarter_length_seconds: number | null } | null;
  }).teams;
  const sport = (team?.sport ?? "afl") as Sport;
  const seconds = getEffectiveQuarterSeconds(
    { quarter_length_seconds: team?.quarter_length_seconds ?? null },
    getAgeGroupConfig(sport, team?.age_group ?? null),
    { quarter_length_seconds: (game as { quarter_length_seconds: number | null }).quarter_length_seconds },
  );
  return { sport, teamId: (game as { team_id: string }).team_id, seconds };
}

/**
 * Finalise: (re)write the game's rollup from its events. Best effort —
 * a failure here never blocks finalising; the stats read backfills.
 */
export async function writeGameRollup(client: Client, gameId: string): Promise<void> {
  try {
    const meta = await periodSecondsFor(client, gameId);
    if (!meta) return;
    const { data: events } = await client
      .from("game_events")
      .select("*")
      .eq("game_id", gameId)
      .order("created_at");
    const rows = gameRollupRows(meta.sport, gameId, meta.teamId, (events ?? []) as GameEvent[], meta.seconds);
    await client.from("player_game_time").delete().eq("game_id", gameId);
    if (rows.length > 0) await client.from("player_game_time").insert(rows);
  } catch {
    // Backfilled on the next stats read.
  }
}

/** Restart: the game's events are gone, so its time goes too. */
export async function clearGameRollup(client: Client, gameId: string): Promise<void> {
  try {
    await client.from("player_game_time").delete().eq("game_id", gameId);
  } catch {
    // Rows for a restarted game are filtered out by finalisation anyway.
  }
}

/**
 * Rollup rows for these finalised games, deriving and storing rows for
 * any game that has none yet (games finalised before migration 0054).
 * `admin` writes the backfill — readers (parents) can't insert.
 */
export async function loadRollup(
  reader: Client,
  admin: Client,
  sport: Sport,
  teamId: string,
  eventsByGame: Map<string, GameEvent[]>,
  periodSecondsOf: (gameId: string) => number,
): Promise<Pick<PlayerGameTimeRow, "player_id" | "unit_kind" | "unit_key" | "ms" | "played_at">[]> {
  const gameIds = Array.from(eventsByGame.keys());
  if (gameIds.length === 0) return [];
  const rows: Pick<PlayerGameTimeRow, "game_id" | "player_id" | "unit_kind" | "unit_key" | "ms" | "played_at">[] = [];
  for (let i = 0; i < gameIds.length; i += 50) {
    const { data } = await reader
      .from("player_game_time")
      .select("game_id, player_id, unit_kind, unit_key, ms, played_at")
      .in("game_id", gameIds.slice(i, i + 50));
    rows.push(...((data ?? []) as typeof rows));
  }
  const have = new Set(rows.map((r) => r.game_id));
  const missing: PlayerGameTimeRow[] = [];
  for (const id of gameIds) {
    if (have.has(id)) continue;
    missing.push(...gameRollupRows(sport, id, teamId, eventsByGame.get(id) ?? [], periodSecondsOf(id)));
  }
  if (missing.length > 0) {
    try {
      await admin.from("player_game_time").upsert(missing, { onConflict: "game_id,player_id,unit_kind,unit_key" });
    } catch {
      // Still returned below; stored next time.
    }
    rows.push(...missing);
  }
  return rows;
}
