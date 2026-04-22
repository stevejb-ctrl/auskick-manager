"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, AgeGroup } from "@/lib/types";

export async function createTeam(
  userId: string,
  name: string,
  ageGroup: AgeGroup = "U10"
): Promise<ActionResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== userId) {
    console.error("[createTeam] unauthenticated", { hasUser: !!user, userId });
    return { success: false, error: "Unauthenticated." };
  }

  // Pre-generate the team ID so we can redirect straight to the setup
  // wizard — the AFTER INSERT trigger creates the admin membership row
  // in the same DB transaction, so by the time the redirect lands on
  // the setup page the user is already a member per the teams: read
  // RLS policy.
  const teamId = crypto.randomUUID();

  console.log("[createTeam] inserting team", { teamId, userId: user.id, name, ageGroup });

  const { error: insertError } = await supabase
    .from("teams")
    .insert({ id: teamId, name, created_by: user.id, age_group: ageGroup });

  if (insertError) {
    console.error("[createTeam] insert failed", insertError);
    return { success: false, error: insertError.message };
  }

  console.log("[createTeam] insert succeeded, redirecting", {
    teamId,
    url: `/teams/${teamId}/setup?step=config`,
  });

  revalidatePath("/dashboard");
  // redirect() throws NEXT_REDIRECT; must be OUTSIDE any try/catch
  // block so Next.js's action handler can propagate the redirect.
  redirect(`/teams/${teamId}/setup?step=config`);
}
