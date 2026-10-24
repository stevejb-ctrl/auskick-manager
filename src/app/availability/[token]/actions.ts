"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { parentAnswerError } from "@/lib/availability/parentLink";
import type { ActionResult, AvailabilityStatus, GameStatus } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVALID = "This link isn't valid. Ask your coach for the game's availability link.";

/**
 * A parent's In or Out, from the game's availability link. The token is
 * the only credential (no account), and it only ever marks one kid on
 * this game's team In or Out before kickoff (lib/availability/parentLink):
 * no fill-ins, no Mark all in, nothing once the game's started.
 */
export async function answerAvailability(
  token: string,
  playerId: string,
  status: AvailabilityStatus
): Promise<ActionResult> {
  if (!UUID.test(token) || !UUID.test(playerId)) return { success: false, error: INVALID };

  const admin = createAdminClient();
  const { data: game } = await admin
    .from("games")
    .select("id, team_id, status, share_token")
    .eq("availability_token", token)
    .maybeSingle();
  if (!game) return { success: false, error: INVALID };

  const { data: player } = await admin
    .from("players")
    .select("team_id, is_active")
    .eq("id", playerId)
    .maybeSingle();

  const refused = parentAnswerError({
    gameStatus: game.status as GameStatus,
    gameTeamId: game.team_id as string,
    player: player as { team_id: string; is_active: boolean } | null,
    status,
  });
  if (refused) return { success: false, error: refused };

  const now = new Date().toISOString();
  const { error } = await admin.from("game_availability").upsert(
    {
      game_id: game.id,
      player_id: playerId,
      status,
      updated_by: null,
      updated_at: now,
      replied_at: now,
    },
    { onConflict: "game_id,player_id" }
  );
  if (error) return { success: false, error: error.message };

  revalidatePath(`/availability/${token}`);
  revalidatePath(`/teams/${game.team_id}/games/${game.id}`);
  revalidatePath(`/teams/${game.team_id}/games/${game.id}/availability`);
  revalidatePath(`/teams/${game.team_id}/games/${game.id}/live`);
  if (game.share_token) revalidatePath(`/run/${game.share_token}`, "layout");
  return { success: true };
}
