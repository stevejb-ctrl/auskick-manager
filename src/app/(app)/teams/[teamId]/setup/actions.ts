"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { defaultTrackScoring, getSportConfig, teamSport } from "@/lib/sports";
import type { ActionResult, Sport } from "@/lib/types";

/**
 * Edit an existing team's basics from the setup wizard's "Basics"
 * step (name + age group). Sport is fixed once the team exists — its
 * chips, positions and history are sport-specific.
 *
 * Changing the age group re-applies that age's scoring default: the
 * coach is still in the wizard and sees the result on the next step.
 */
export async function updateTeamBasics(
  teamId: string,
  name: string,
  ageGroup: string,
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
    return { success: false, error: "Not authorised." };
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) return { success: false, error: "Team name is required." };
  if (trimmed.length > 80) return { success: false, error: "Name is too long (80 chars max)." };

  const { data: team } = await supabase
    .from("teams")
    .select("sport, age_group")
    .eq("id", teamId)
    .single();
  if (!team) return { success: false, error: "Team not found." };

  const sport = teamSport(team.sport);
  const cfg = getSportConfig(sport);
  if (!cfg.ageGroups.some((a) => a.id === ageGroup)) {
    return { success: false, error: `Invalid age group "${ageGroup}" for ${cfg.name}.` };
  }

  const update: { name: string; age_group: string; track_scoring?: boolean } = {
    name: trimmed,
    age_group: ageGroup,
  };
  if (team.age_group !== ageGroup) {
    update.track_scoring = defaultTrackScoring(sport, ageGroup);
  }

  const { error: updateError } = await supabase.from("teams").update(update).eq("id", teamId);
  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}`, "layout");
  redirect(`/teams/${teamId}/setup?step=config`);
}
