"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult, AvailabilityStatus, LiveAuth } from "@/lib/types";

export async function setAvailability(
  auth: LiveAuth,
  gameId: string,
  playerId: string,
  status: AvailabilityStatus
): Promise<ActionResult> {
  if (auth.kind === "token") {
    const admin = createAdminClient();
    const { data: game } = await admin
      .from("games")
      .select("id, team_id, share_token")
      .eq("id", gameId)
      .maybeSingle();
    if (!game || game.share_token !== auth.token) {
      return { success: false, error: "Invalid share link." };
    }
    const { error } = await admin.from("game_availability").upsert(
      {
        game_id: gameId,
        player_id: playerId,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "game_id,player_id" }
    );
    if (error) return { success: false, error: error.message };
    revalidatePath(`/run/${auth.token}`, "layout");
    return { success: true };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthenticated." };

  const { data: membership } = await supabase
    .from("team_memberships")
    .select("role")
    .eq("team_id", auth.teamId)
    .eq("user_id", user.id)
    .single();

  if (
    !membership ||
    (membership.role !== "admin" && membership.role !== "game_manager")
  ) {
    return { success: false, error: "Not authorised." };
  }

  const { error } = await supabase.from("game_availability").upsert(
    {
      game_id: gameId,
      player_id: playerId,
      status,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "game_id,player_id" }
  );

  if (error) return { success: false, error: error.message };

  revalidatePath(`/teams/${auth.teamId}/games/${gameId}`);
  return { success: true };
}

export async function resetGame(
  teamId: string,
  gameId: string
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthenticated." };

  const { data: membership } = await supabase
    .from("team_memberships")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .single();
  if (!membership || membership.role !== "admin") {
    return { success: false, error: "Only admins can reset games." };
  }

  const admin = createAdminClient();
  const { error: delError } = await admin
    .from("game_events")
    .delete()
    .eq("game_id", gameId);
  if (delError) return { success: false, error: delError.message };

  const { error: updError } = await admin
    .from("games")
    .update({ status: "upcoming" })
    .eq("id", gameId);
  if (updError) return { success: false, error: updError.message };

  revalidatePath(`/teams/${teamId}/games/${gameId}`, "layout");
  const { data: game } = await admin
    .from("games")
    .select("share_token")
    .eq("id", gameId)
    .maybeSingle();
  if (game?.share_token) {
    revalidatePath(`/run/${game.share_token}`, "layout");
  }
  return { success: true };
}
