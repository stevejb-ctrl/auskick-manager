"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CONTACT_FROM, getResend } from "@/lib/resend";
import { EMAIL_RE, maskEmail } from "@/lib/email/validate";
import { buildInviteEmail } from "@/lib/email/inviteTemplate";
import { publicOrigin } from "@/lib/platform";
import { ROLE_LABEL, ROLE_SUMMARY } from "@/lib/roles";
import type { ActionResult, TeamRole } from "@/lib/types";

// Minimum gap between two sends of the SAME invite email. Stops a
// double-click from double-sending and gives the recipient a chance to
// check spam/junk before we retry. Legitimate re-sends past this
// window are allowed and tracked via email_send_count.
const RESEND_THROTTLE_MS = 60_000;

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
  invitedEmail: string | null
): Promise<ActionResult & { token?: string; inviteId?: string }> {
  const { supabase, user, error } = await getAuthedAdmin(teamId);
  if (error || !user) return { success: false, error: error ?? "Unauthenticated." };

  // Server-side email validation. Client-side mirrors this so most
  // visitors never hit the failure path, but we re-check here because
  // the client check is bypassable (and to keep our schema honest —
  // the column is citext, not "anything goes").
  const trimmedEmail = invitedEmail?.trim() || null;
  if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) {
    return { success: false, error: "Please use a valid email address." };
  }

  const { data, error: insertError } = await supabase
    .from("team_invites")
    .insert({
      team_id: teamId,
      role,
      invited_email: trimmedEmail,
      created_by: user.id,
    })
    .select("id, token")
    .single();

  if (insertError) return { success: false, error: insertError.message };

  revalidatePath(`/teams/${teamId}/settings`);
  return { success: true, token: data?.token, inviteId: data?.id };
}

/**
 * Send (or re-send) the invite email for an already-created invite.
 *
 * Kept separate from `createInvite` so a failed Resend call doesn't
 * orphan the invite — the link is always usable as a fallback. Any
 * team admin can trigger a re-send, not just the original inviter.
 */
export async function sendInviteEmail(
  teamId: string,
  inviteId: string
): Promise<ActionResult & { sentAt?: string }> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const { data: invite, error: fetchError } = await supabase
    .from("team_invites")
    .select(
      "id, role, token, invited_email, email_sent_at, email_send_count, accepted_at, revoked_at, expires_at, created_by"
    )
    .eq("id", inviteId)
    .eq("team_id", teamId)
    .single();

  if (fetchError || !invite) return { success: false, error: "Invite not found." };
  if (!invite.invited_email) {
    return { success: false, error: "This invite has no email attached." };
  }
  if (invite.revoked_at) return { success: false, error: "Invite was revoked." };
  if (invite.accepted_at) return { success: false, error: "Invite already accepted." };
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return { success: false, error: "Invite has expired." };
  }

  // Throttle: friendly resends are fine, accidental double-clicks are not.
  if (invite.email_sent_at) {
    const elapsedMs = Date.now() - new Date(invite.email_sent_at).getTime();
    if (elapsedMs < RESEND_THROTTLE_MS) {
      const wait = Math.ceil((RESEND_THROTTLE_MS - elapsedMs) / 1000);
      return {
        success: false,
        error: `Email just sent — try again in ${wait}s.`,
      };
    }
  }

  const [{ data: team }, { data: inviter }] = await Promise.all([
    supabase.from("teams").select("name").eq("id", teamId).single(),
    supabase.from("profiles").select("full_name, email").eq("id", invite.created_by).single(),
  ]);

  const teamName = team?.name ?? "your team";
  const inviterName = inviter?.full_name?.trim() || "Your coach";
  const inviterEmail = inviter?.email ?? null;

  const { subject, text, html } = buildInviteEmail({
    teamName,
    inviterName,
    roleLabel: ROLE_LABEL[invite.role as TeamRole],
    roleSummary: ROLE_SUMMARY[invite.role as TeamRole],
    joinUrl: `${publicOrigin()}/join/${invite.token}`,
  });

  const nowIso = new Date().toISOString();
  const recipient = invite.invited_email;

  // Soft no-op when Resend isn't configured. Lets e2e / local dev
  // exercise the full UX path (DB writes, throttle, send-count) without
  // a real network call. Production deploys MUST set RESEND_API_KEY —
  // the console.warn here surfaces a missing key in logs so it doesn't
  // silently rot.
  if (!process.env.RESEND_API_KEY) {
    console.warn(
      `[invite] RESEND_API_KEY not set — would email ${maskEmail(recipient)} for team ${teamId}`
    );
    await supabase
      .from("team_invites")
      .update({
        email_sent_at: nowIso,
        email_send_count: (invite.email_send_count ?? 0) + 1,
        last_email_error: null,
      })
      .eq("id", inviteId)
      .eq("team_id", teamId);
    revalidatePath(`/teams/${teamId}/settings`);
    return { success: true, sentAt: nowIso };
  }

  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: CONTACT_FROM,
      to: recipient,
      replyTo: inviterEmail ?? undefined,
      subject,
      text,
      html,
    });

    if (result.error) {
      const msg = String(result.error.message ?? result.error);
      console.error(`[invite] resend error for ${maskEmail(recipient)}:`, msg);
      await supabase
        .from("team_invites")
        .update({ last_email_error: msg })
        .eq("id", inviteId)
        .eq("team_id", teamId);
      return {
        success: false,
        error: "Couldn't send the email — copy the link and share manually.",
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[invite] send failed for ${maskEmail(recipient)}:`, msg);
    await supabase
      .from("team_invites")
      .update({ last_email_error: msg })
      .eq("id", inviteId)
      .eq("team_id", teamId);
    return {
      success: false,
      error: "Couldn't send the email — copy the link and share manually.",
    };
  }

  await supabase
    .from("team_invites")
    .update({
      email_sent_at: nowIso,
      email_send_count: (invite.email_send_count ?? 0) + 1,
      last_email_error: null,
    })
    .eq("id", inviteId)
    .eq("team_id", teamId);

  revalidatePath(`/teams/${teamId}/settings`);
  return { success: true, sentAt: nowIso };
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
