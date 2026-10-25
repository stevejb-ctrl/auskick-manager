"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendPushNotification } from "@/lib/notifications/sendPushNotification";
import { ROLE_LABEL } from "@/lib/roles";
import { INVITE_UNAVAILABLE, inviteState } from "@/lib/invites/inviteState";
import { cleanDisplayName, hasDisplayName } from "@/lib/members/displayName";
import type { ActionResult, TeamRole } from "@/lib/types";

// Accept an invite. Runs entirely on the server — we validate the
// token via the admin client (so the invitee can read an invite they
// don't yet have access to via RLS), then INSERT the membership with
// the admin client (bypassing the admin-only INSERT policy on
// team_memberships).
//
// An invite is one person's, once (lib/invites/inviteState). It's
// claimed before the membership is made, by an update that only
// matches an open invite, so two taps (or two people) can't both use
// it, and a used or revoked invite never re-adds anyone: a removed
// helper's old link used to make them a Manager again.
//
// `name` is asked for when the person's profile has none (email
// sign-ups have a blank name), so the coach can tell who joined.
export async function acceptInvite(
  token: string,
  name?: string
): Promise<ActionResult & { teamId?: string; role?: TeamRole }> {
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

  // Already on the team: nothing to accept, and the invite isn't spent.
  // (No role back: there's no "You've joined" to say.)
  const { data: existing } = await admin
    .from("team_memberships")
    .select("role")
    .eq("team_id", invite.team_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return { success: true, teamId: invite.team_id };

  const state = inviteState(invite);
  if (state !== "open") return { success: false, error: INVITE_UNAVAILABLE[state] };

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  let newName: string | null = null;
  if (!hasDisplayName(profile?.full_name)) {
    const cleaned = cleanDisplayName(name ?? "");
    if (!cleaned.ok) return { success: false, error: cleaned.error };
    newName = cleaned.name;
  }

  // Claim it: only an open invite matches, so only one claim wins.
  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin
    .from("team_invites")
    .update({ accepted_at: nowIso, accepted_by: user.id })
    .eq("id", invite.id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", nowIso)
    .select("id");
  if (claimError) return { success: false, error: claimError.message };
  if (!claimed || claimed.length === 0) {
    return { success: false, error: INVITE_UNAVAILABLE.used };
  }

  const { error: insertError } = await admin.from("team_memberships").insert({
    team_id: invite.team_id,
    user_id: user.id,
    role: invite.role,
    invited_by: invite.created_by,
  });

  // 23505 = unique violation: they joined some other way a moment ago.
  // Any other failure hands the invite back so they can try again.
  if (insertError && insertError.code !== "23505") {
    await admin
      .from("team_invites")
      .update({ accepted_at: null, accepted_by: null })
      .eq("id", invite.id)
      .eq("accepted_by", user.id);
    return { success: false, error: insertError.message };
  }

  if (newName) {
    await admin.from("profiles").update({ full_name: newName }).eq("id", user.id);
  }

  // Notify the inviter that someone took them up on the invite.
  // Skip if the inviter somehow accepted their own link. Best-effort —
  // sendPushNotification swallows errors so a stalled FCM call can't
  // roll back the membership.
  if (!insertError && invite.created_by !== user.id) {
    const { data: teamRow } = await admin
      .from("teams")
      .select("name")
      .eq("id", invite.team_id)
      .maybeSingle();
    const teamName = teamRow?.name ?? "your team";
    const accepterName = newName || profile?.full_name?.trim() || user.email || "Someone";
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
  revalidatePath(`/teams/${invite.team_id}/games`);
  revalidatePath(`/teams/${invite.team_id}/settings`);
  return { success: true, teamId: invite.team_id, role: invite.role as TeamRole };
}
