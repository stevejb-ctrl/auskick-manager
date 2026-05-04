"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { AGE_GROUPS, ageGroupOf } from "@/lib/ageGroups";
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

async function squadCapFor(
  supabase: ReturnType<typeof createClient>,
  teamId: string
): Promise<number> {
  const { data: team } = await supabase
    .from("teams")
    .select("age_group")
    .eq("id", teamId)
    .single();
  const ageGroup = ageGroupOf((team as { age_group?: string } | null)?.age_group);
  return AGE_GROUPS[ageGroup].maxSquadSize;
}

export async function addPlayer(
  teamId: string,
  fullName: string,
  jerseyNumber: number | null,
  chip: "a" | "b" | "c" | null = null,
): Promise<ActionResult> {
  const { supabase, user, error } = await getAuthedAdmin(teamId);
  if (error || !user) return { success: false, error: error ?? "Unauthenticated." };

  const maxPlayers = await squadCapFor(supabase, teamId);

  const { count } = await supabase
    .from("players")
    .select("*", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("is_active", true);

  if ((count ?? 0) >= maxPlayers) {
    return {
      success: false,
      error: `Squad is full (${maxPlayers} players maximum).`,
    };
  }

  const { error: insertError } = await supabase.from("players").insert({
    team_id: teamId,
    full_name: fullName,
    jersey_number: jerseyNumber,
    chip,
    created_by: user.id,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return { success: false, error: `Jersey #${jerseyNumber} is already taken.` };
    }
    return { success: false, error: insertError.message };
  }

  revalidatePath(`/teams/${teamId}/squad`);
  return { success: true };
}

export async function updatePlayer(
  teamId: string,
  playerId: string,
  patch: {
    full_name?: string;
    jersey_number?: number | null;
    is_active?: boolean;
    chip?: "a" | "b" | "c" | null;
  },
): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const { error: updateError } = await supabase
    .from("players")
    .update(patch)
    .eq("id", playerId)
    .eq("team_id", teamId);

  if (updateError) {
    if (updateError.code === "23505") {
      return {
        success: false,
        error: `Jersey #${patch.jersey_number} is already taken.`,
      };
    }
    return { success: false, error: updateError.message };
  }

  revalidatePath(`/teams/${teamId}/squad`);
  return { success: true };
}

export async function deactivatePlayer(
  teamId: string,
  playerId: string
): Promise<ActionResult> {
  return updatePlayer(teamId, playerId, { is_active: false });
}

export async function reactivatePlayer(
  teamId: string,
  playerId: string
): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const maxPlayers = await squadCapFor(supabase, teamId);

  const { count } = await supabase
    .from("players")
    .select("*", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("is_active", true);

  if ((count ?? 0) >= maxPlayers) {
    return { success: false, error: "Squad is full — deactivate another player first." };
  }

  return updatePlayer(teamId, playerId, { is_active: true });
}
