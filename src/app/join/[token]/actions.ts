"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

// Accept an invite. Runs entirely on the server — we validate the
// token via the admin client (so the invitee can read an invite they
// don't yet have access to via RLS), then INSERT the membership with
// the admin client (bypassing the admin-only INSERT policy on
// team_memberships), and finally mark the invite accepted.
export async function acceptInvite(
  token: string
): Promise<ActionResult & { teamId?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Please sign in first." };

  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("team_invites")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return { success: false, error: "Invite not found." };
  if (invite.revoked_at) return { success: false, error: "This invite has been revoked." };
  if (new Date(invite.expires_at) < new Date()) {
    return { success: false, error: "This invite has expired." };
  }
  if (invite.accepted_at && invite.accepted_by !== user.id) {
    return { success: false, error: "This invite has already been used." };
  }

  const { error: insertError } = await admin.from("team_memberships").insert({
    team_id: invite.team_id,
    user_id: user.id,
    role: invite.role,
    invited_by: invite.created_by,
  });

  // 23505 = unique violation (user is already a member). Treat as
  // success — they get redirected to the team either way.
  if (insertError && insertError.code !== "23505") {
    return { success: false, error: insertError.message };
  }

  // Mark accepted (idempotent if they re-open the link).
  await admin
    .from("team_invites")
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: user.id,
    })
    .eq("id", invite.id);

  revalidatePath("/dashboard");
  revalidatePath(`/teams/${invite.team_id}`);
  return { success: true, teamId: invite.team_id };
}
