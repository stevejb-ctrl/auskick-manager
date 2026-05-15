// ─── seedDefaultAvailability ─────────────────────────────────
// Single source of truth for "every active squad member starts
// the game marked Available, coach un-selects no-shows". Four
// game-creation paths historically hand-rolled this:
//
//   - `(app)/teams/[teamId]/games/actions.ts:createGame` (UI flow)
//   - `(app)/teams/[teamId]/games/playhq-actions.ts` (PlayHQ adopt)
//   - `api/cron/sync-playhq/route.ts` (nightly PlayHQ sync)
//   - `app/demo/page.tsx` (one-tap demo)
//
// Each implementation was a 5-line block doing the same thing.
// Steve 2026-05-15 (Stagehand finding: my sandbox-creation script
// bypassed this and the agent ended up tapping "Mark available" 12
// times before it could even start the game). Extracted so every
// path that creates a game can call ONE function and not drift
// from the convention.
//
// Implementation:
//   - Read all active players for the team (excludes archived).
//   - Insert one `game_availability` row per player with
//     status='available'. `updated_by` is the caller's user id
//     (admin path) or null (cron / service-role / scripts).
//   - Idempotent: rows for (game_id, player_id) pairs that
//     already exist are skipped via `onConflict` ignore. Not
//     strictly needed for fresh-game inserts but useful if
//     called multiple times (e.g. retry path) or against an
//     already-mid-flight game.
//
// Returns the number of rows actually inserted. Callers can log
// it for visibility but don't need to act on it.

import type { SupabaseClient } from "@supabase/supabase-js";

interface SeedDefaultAvailabilityArgs {
  /** Supabase client — auth'd user OR service-role admin. */
  supabase: SupabaseClient;
  /** Game just created. Required. */
  gameId: string;
  /** Team that owns the game. Required — drives the squad lookup. */
  teamId: string;
  /**
   * User id to stamp on the `updated_by` audit column. Null for
   * automated / service-role paths (cron, demo seed, scripts).
   */
  createdBy: string | null;
}

export async function seedDefaultAvailability({
  supabase,
  gameId,
  teamId,
  createdBy,
}: SeedDefaultAvailabilityArgs): Promise<number> {
  const { data: activePlayers, error: playersError } = await supabase
    .from("players")
    .select("id")
    .eq("team_id", teamId)
    .eq("is_active", true);
  if (playersError) {
    throw new Error(`Failed to load team squad: ${playersError.message}`);
  }
  if (!activePlayers || activePlayers.length === 0) return 0;

  const rows = activePlayers.map((p: { id: string }) => ({
    game_id: gameId,
    player_id: p.id,
    status: "available" as const,
    updated_by: createdBy,
  }));

  // `onConflict: "game_id,player_id"` is the unique constraint
  // documented in 0001_init.sql. `ignoreDuplicates: true` makes
  // this idempotent — re-running the seeder doesn't bump
  // updated_at on existing rows or flip a coach's manual "out"
  // back to "available".
  const { error: insertError } = await supabase
    .from("game_availability")
    .upsert(rows, {
      onConflict: "game_id,player_id",
      ignoreDuplicates: true,
    });
  if (insertError) {
    throw new Error(`Failed to seed availability: ${insertError.message}`);
  }
  return rows.length;
}
