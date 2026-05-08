"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendPushNotification } from "@/lib/notifications/sendPushNotification";
import { ROLE_LABEL } from "@/lib/roles";
import type { ActionResult, TeamRole } from "@/lib/types";

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
  // success — they get redirected to the team either way. We do
  // NOT push the inviter again on re-acceptance.
  const isFirstAccept = !insertError;
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

  // Notify the inviter that someone took them up on the invite.
  // First-acceptance only; skip if the inviter somehow accepted
  // their own link. Best-effort — sendPushNotification swallows
  // errors so a stalled FCM call can't roll back the membership.
  if (isFirstAccept && invite.created_by !== user.id) {
    const [teamRes, accepterRes] = await Promise.all([
      admin.from("teams").select("name").eq("id", invite.team_id).maybeSingle(),
      admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    ]);
    const teamName = teamRes.data?.name ?? "your team";
    const accepterName =
      accepterRes.data?.full_name?.trim() || user.email || "Someone";
    const roleLabel = ROLE_LABEL[invite.role as TeamRole] ?? "member";
    await sendPushNotification({
      user_id: invite.created_by,
      title: "Invite accepted",
      body: `${accepterName} joined ${teamName} as ${roleLabel}.`,
      data: { team_id: invite.team_id },
    });
  }

  revalidatePath("/dashboard");
  revalidatePath(`/teams/${invite.team_id}`);
  return { success: true, teamId: invite.team_id };
}
