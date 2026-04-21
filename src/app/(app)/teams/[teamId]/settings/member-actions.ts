"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, TeamRole } from "@/lib/types";

// Mirrors the getAuthedAdmin helper in squad/actions.ts — only admins
// of the given team may run any of these mutations. Server-side RLS
// enforces this too; this check gives a clean error message.
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

async function adminCount(
  supabase: ReturnType<typeof createClient>,
  teamId: string
): Promise<number> {
  const { count } = await supabase
    .from("team_memberships")
    .select("*", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("role", "admin");
  return count ?? 0;
}

export async function createInvite(
  teamId: string,
  role: TeamRole,
  emailHint: string | null
): Promise<ActionResult & { token?: string }> {
  const { supabase, user, error } = await getAuthedAdmin(teamId);
  if (error || !user) return { success: false, error: error ?? "Unauthenticated." };

  const { data, error: insertError } = await supabase
    .from("team_invites")
    .insert({
      team_id: teamId,
      role,
      email_hint: emailHint?.trim() || null,
      created_by: user.id,
    })
    .select("token")
    .single();

  if (insertError) return { success: false, error: insertError.message };

  revalidatePath(`/teams/${teamId}/settings`);
  return { success: true, token: data?.token };
}

export async function revokeInvite(
  teamId: string,
  inviteId: string
): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const { error: updateError } = await supabase
    .from("team_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("team_id", teamId);

  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}/settings`);
  return { success: true };
}

export async function updateMemberRole(
  teamId: string,
  userId: string,
  newRole: TeamRole
): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  // Last-admin guard: block demotion if this is the only admin.
  const { data: target } = await supabase
    .from("team_memberships")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .single();

  if (!target) return { success: false, error: "Member not found." };

  if (target.role === "admin" && newRole !== "admin") {
    const count = await adminCount(supabase, teamId);
    if (count <= 1) {
      return {
        success: false,
        error: "Can't change role — team must have at least one admin.",
      };
    }
  }

  const { error: updateError } = await supabase
    .from("team_memberships")
    .update({ role: newRole })
    .eq("team_id", teamId)
    .eq("user_id", userId);

  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}/settings`);
  return { success: true };
}

export async function removeMember(
  teamId: string,
  userId: string
): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  // Last-admin guard: can't remove the last admin (including yourself).
  const { data: target } = await supabase
    .from("team_memberships")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .single();

  if (!target) return { success: false, error: "Member not found." };

  if (target.role === "admin") {
    const count = await adminCount(supabase, teamId);
    if (count <= 1) {
      return {
        success: false,
        error: "Can't remove the last admin — promote someone else first.",
      };
    }
  }

  const { error: deleteError } = await supabase
    .from("team_memberships")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", userId);

  if (deleteError) return { success: false, error: deleteError.message };

  revalidatePath(`/teams/${teamId}/settings`);
  return { success: true };
}
