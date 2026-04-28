"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

async function getAuthedAdmin(teamId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, error: "Unauthenticated." };

  const { data: membership } = await supabase
    .from("team_memberships")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "admin") {
    return { supabase, user, error: "Not authorised." };
  }

  return { supabase, user, error: null };
}

export async function createGame(
  teamId: string,
  input: {
    opponent: string;
    scheduled_at: string;
    location: string | null;
    round_number: number | null;
    notes: string | null;
    on_field_size?: number;
  }
): Promise<ActionResult & { gameId?: string }> {
  const { supabase, user, error } = await getAuthedAdmin(teamId);
  if (error || !user) return { success: false, error: error ?? "Unauthenticated." };

  if (!input.opponent.trim()) {
    return { success: false, error: "Opponent is required." };
  }
  if (!input.scheduled_at) {
    return { success: false, error: "Date and time are required." };
  }

  const { data: game, error: insertError } = await supabase
    .from("games")
    .insert({
      team_id: teamId,
      opponent: input.opponent.trim(),
      scheduled_at: input.scheduled_at,
      location: input.location?.trim() || null,
      round_number: input.round_number ?? null,
      notes: input.notes?.trim() || null,
      on_field_size: input.on_field_size ?? 12,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !game) {
    return { success: false, error: insertError?.message ?? "Failed to create game." };
  }

  // Default: all active players are "available". Manager un-selects those not attending.
  const { data: activePlayers } = await supabase
    .from("players")
    .select("id")
    .eq("team_id", teamId)
    .eq("is_active", true);

  if (activePlayers && activePlayers.length > 0) {
    await supabase.from("game_availability").insert(
      activePlayers.map((p) => ({
        game_id: game.id,
        player_id: p.id,
        status: "available" as const,
        updated_by: user.id,
      }))
    );
  }

  revalidatePath(`/teams/${teamId}/games`);
  redirect(`/teams/${teamId}/games/${game.id}`);
}

export async function setTrackScoring(
  teamId: string,
  enabled: boolean
): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const { error: updateError } = await supabase
    .from("teams")
    .update({ track_scoring: enabled })
    .eq("id", teamId);

  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}/games`);
  revalidatePath(`/teams/${teamId}/settings`);
  return { success: true };
}

/**
 * Per-team override for quarter duration (in seconds). Pass `null` to
 * clear the override and fall back to the age-group default. The form
 * validates sane ranges (1–30 min); the DB column has no CHECK so a
 * coach who genuinely wants 30-second training quarters isn't blocked.
 */
export async function setQuarterLengthSeconds(
  teamId: string,
  seconds: number | null,
): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  if (seconds !== null) {
    if (!Number.isInteger(seconds) || seconds < 60 || seconds > 1800) {
      return {
        success: false,
        error: "Quarter length must be a whole number of minutes between 1 and 30.",
      };
    }
  }

  const { error: updateError } = await supabase
    .from("teams")
    .update({ quarter_length_seconds: seconds })
    .eq("id", teamId);

  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}/games`);
  revalidatePath(`/teams/${teamId}/settings`);
  return { success: true };
}

export async function updateGame(
  teamId: string,
  gameId: string,
  patch: {
    opponent?: string;
    scheduled_at?: string;
    location?: string | null;
    round_number?: number | null;
    notes?: string | null;
    status?: "upcoming" | "in_progress" | "completed";
    sub_interval_seconds?: number;
  }
): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const { error: updateError } = await supabase
    .from("games")
    .update(patch)
    .eq("id", gameId)
    .eq("team_id", teamId);

  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}/games`);
  revalidatePath(`/teams/${teamId}/games/${gameId}`);
  return { success: true };
}
