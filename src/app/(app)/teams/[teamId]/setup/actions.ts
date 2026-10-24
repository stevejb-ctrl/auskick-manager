"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { defaultTrackScoring, getSportConfig, teamSport } from "@/lib/sports";
import type { ActionResult, Sport } from "@/lib/types";
import { storedOnFieldSize, storedPeriodSeconds } from "@/lib/games/newGameDefaults";
import { pinPlayedPeriodLength } from "@/lib/games/pinPlayedPeriodLength";
import type { TeamGameShape } from "@/app/(app)/dashboard/actions";

/**
 * Edit an existing team's basics from the setup wizard's "Basics"
 * step (name, age group, players on the field, period length). Sport
 * is fixed once the team exists — its chips, positions and history are
 * sport-specific.
 *
 * Changing the age group re-applies that age's scoring default: the
 * coach is still in the wizard and sees the result on the next step.
 * The team's players on the field stay inside the age's range.
 */
export async function updateTeamBasics(
  teamId: string,
  name: string,
  ageGroup: string,
  shape?: TeamGameShape,
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
    .select("sport, age_group, on_field_size, quarter_length_seconds")
    .eq("id", teamId)
    .single();
  if (!team) return { success: false, error: "Team not found." };

  const sport = teamSport(team.sport);
  const cfg = getSportConfig(sport);
  const ageCfg = cfg.ageGroups.find((a) => a.id === ageGroup);
  if (!ageCfg) {
    return { success: false, error: `Invalid age group "${ageGroup}" for ${cfg.name}.` };
  }

  const update: {
    name: string;
    age_group: string;
    track_scoring?: boolean;
    on_field_size: number | null;
    quarter_length_seconds: number | null;
  } = {
    name: trimmed,
    age_group: ageGroup,
    // What the coach set, else the team's own, inside the age's range.
    on_field_size: storedOnFieldSize(
      ageCfg,
      shape?.onFieldSize !== undefined ? shape.onFieldSize : (team.on_field_size as number | null),
    ),
    quarter_length_seconds: team.quarter_length_seconds as number | null,
  };
  if (shape?.periodSeconds !== undefined) {
    try {
      update.quarter_length_seconds = storedPeriodSeconds(ageCfg, shape.periodSeconds);
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
  if (team.age_group !== ageGroup) {
    update.track_scoring = defaultTrackScoring(sport, ageGroup);
  }

  // Past games keep the length they were played with (UX round 2).
  try {
    await pinPlayedPeriodLength(supabase, teamId);
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }

  const { error: updateError } = await supabase.from("teams").update(update).eq("id", teamId);
  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}`, "layout");
  redirect(`/teams/${teamId}/setup?step=config`);
}
