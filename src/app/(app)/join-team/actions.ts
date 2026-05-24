"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendPushNotification } from "@/lib/notifications/sendPushNotification";
import { ROLE_LABEL } from "@/lib/roles";
import type { ActionResult } from "@/lib/types";

/**
 * Normalise whatever the parent typed into the canonical "XXXX-XXXX"
 * shape we store. Strips whitespace, hyphens, dots; upper-cases; then
 * inserts the central hyphen if the length matches. Accepts:
 *
 *   "auskme9x"       → "AUSK-ME9X"
 *   "AUSK ME9X"      → "AUSK-ME9X"
 *   "ausk-me9x"      → "AUSK-ME9X"
 *   "AUSK-ME9X"      → "AUSK-ME9X"
 *
 * Returns null if the result doesn't look like a join code at all so
 * the action can fail fast with a friendly error instead of querying
 * the DB with garbage.
 */
function normaliseJoinCode(input: string): string | null {
  const stripped = input
    .trim()
    .toUpperCase()
    .replace(/[\s.\-_]/g, "");
  if (stripped.length !== 8) return null;
  // Same alphabet as `public.generate_team_join_code` in 0041 — kept
  // strict so a parent who typed an O or an L (which the DB function
  // can't produce) gets a clear "code not found" rather than an
  // ambiguous lookup miss.
  if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/.test(stripped)) return null;
  return `${stripped.slice(0, 4)}-${stripped.slice(4, 8)}`;
}

/**
 * Redeem a team join code. Any signed-in user can call this — the
 * code IS the auth — but the membership only gets created if the
 * code matches a real team AND the user isn't already on it.
 *
 * Always inserts as `parent`. The team admin can upgrade them from
 * the members list in team settings.
 *
 * Returns `teamId` on success so the caller can redirect straight
 * to /teams/{id}/games.
 */
export async function joinTeamByCode(
  rawCode: string,
): Promise<ActionResult & { teamId?: string; alreadyMember?: boolean }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Please sign in first." };

  const code = normaliseJoinCode(rawCode);
  if (!code) {
    return {
      success: false,
      error:
        "That doesn't look like a team join code — they're 8 characters like ABCD-EFGH.",
    };
  }

  // Admin client: the joining user isn't a team member yet, so the
  // RLS-bound select for teams would return nothing.
  const admin = createAdminClient();

  const { data: team } = await admin
    .from("teams")
    .select("id, name")
    .eq("join_code", code)
    .maybeSingle();

  if (!team) {
    return {
      success: false,
      error: "We couldn't find a team with that code. Double-check with your coach.",
    };
  }

  // Already a member of this team? Treat as success and let the
  // caller redirect — same outcome from the parent's POV.
  const { data: existing } = await admin
    .from("team_memberships")
    .select("user_id, role")
    .eq("team_id", team.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return { success: true, teamId: team.id, alreadyMember: true };
  }

  const { error: insertError } = await admin.from("team_memberships").insert({
    team_id: team.id,
    user_id: user.id,
    role: "parent",
  });

  // 23505 = unique_violation. Race with another tab — they're a
  // member either way, return success.
  if (insertError && insertError.code !== "23505") {
    return { success: false, error: insertError.message };
  }

  // Best-effort push to the team admins so the manager sees someone
  // landed via the code (no email — the admin gave the code out
  // themselves, this isn't a spammable invite path). Errors swallowed
  // so a slow FCM call can't fail the join.
  const { data: admins } = await admin
    .from("team_memberships")
    .select("user_id")
    .eq("team_id", team.id)
    .eq("role", "admin");
  const accepterName =
    (await admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle())
      .data?.full_name?.trim() ||
    user.email ||
    "Someone";
  await Promise.all(
    (admins ?? []).map((a) =>
      sendPushNotification({
        user_id: a.user_id,
        title: "New member joined",
        body: `${accepterName} joined ${team.name} as ${ROLE_LABEL.parent} via your team join code.`,
        data: { team_id: team.id },
      }),
    ),
  );

  revalidatePath("/dashboard");
  revalidatePath(`/teams/${team.id}`);
  revalidatePath(`/teams/${team.id}/games`);
  revalidatePath(`/teams/${team.id}/settings`);
  return { success: true, teamId: team.id, alreadyMember: false };
}
