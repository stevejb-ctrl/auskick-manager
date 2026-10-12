"use server";

// Team › How we play and wizard step 2 (UX plan §7.8). Coaches only:
// managers run games but don't change how the team plays.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { effectivePolicy, getSportPlaybook } from "@/lib/playbook";
import { sanitizeOverrides } from "@/lib/playbook/team";
import type { PolicyOverrides, SeasonBalanceSetting } from "@/lib/playbook/types";
import type { ActionResult, Sport } from "@/lib/types";

const BALANCE: SeasonBalanceSetting[] = ["off", "light", "balanced", "strong"];

async function authedCoach(teamId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, error: "Unauthenticated." } as const;
  const { data: membership } = await supabase
    .from("team_memberships")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .single();
  if (membership?.role !== "admin") {
    return { supabase, user, error: "Only a coach can change how the team plays." } as const;
  }
  return { supabase, user, error: null } as const;
}

export interface HowWePlayPatch {
  strategy?: string;
  policyOverrides?: PolicyOverrides;
  seasonBalance?: SeasonBalanceSetting;
}

/**
 * Save part of a team's How we play. Overrides are clamped to what the
 * age policy allows; a strategy must be one the (new) policy offers.
 */
export async function saveHowWePlay(teamId: string, patch: HowWePlayPatch): Promise<ActionResult> {
  const { supabase, user, error } = await authedCoach(teamId);
  if (error || !user) return { success: false, error: error ?? "Unauthenticated." };

  const [{ data: team }, { data: existing }] = await Promise.all([
    supabase.from("teams").select("sport, age_group").eq("id", teamId).single(),
    supabase
      .from("team_playbooks")
      .select("strategy, policy_overrides, season_balance")
      .eq("team_id", teamId)
      .maybeSingle(),
  ]);
  if (!team) return { success: false, error: "Team not found." };
  const sport = ((team.sport as Sport | null) ?? "afl") as Sport;
  const ageGroup = team.age_group as string;

  const overrides = sanitizeOverrides(
    sport,
    ageGroup,
    patch.policyOverrides ?? ((existing?.policy_overrides ?? {}) as PolicyOverrides),
  );
  const policy = effectivePolicy(sport, ageGroup, overrides);

  let strategy = existing?.strategy ?? null;
  if (patch.strategy !== undefined) {
    const offered = getSportPlaybook(sport).strategies(policy);
    if (!offered.some((s) => s.id === patch.strategy)) {
      return { success: false, error: "That way of rotating isn't available for this age group." };
    }
    strategy = patch.strategy;
  }

  let seasonBalance = existing?.season_balance ?? null;
  if (patch.seasonBalance !== undefined) {
    if (!BALANCE.includes(patch.seasonBalance)) {
      return { success: false, error: "Unknown season balance setting." };
    }
    seasonBalance = patch.seasonBalance;
  }

  const { error: upsertError } = await supabase.from("team_playbooks").upsert(
    {
      team_id: teamId,
      strategy,
      policy_overrides: overrides,
      season_balance: seasonBalance,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "team_id" },
  );
  if (upsertError) return { success: false, error: upsertError.message };

  revalidatePath(`/teams/${teamId}`, "layout");
  return { success: true };
}

/**
 * "Reset season balance" (§7.5): only games from now on count towards
 * who's owed time where. Stats and history are untouched.
 */
export async function resetSeasonBalance(teamId: string): Promise<ActionResult<{ since: string }>> {
  const { supabase, user, error } = await authedCoach(teamId);
  if (error || !user) return { success: false, error: error ?? "Unauthenticated." };
  const since = new Date().toISOString();
  const { error: upsertError } = await supabase.from("team_playbooks").upsert(
    { team_id: teamId, season_balance_since: since, updated_by: user.id, updated_at: since },
    { onConflict: "team_id" },
  );
  if (upsertError) return { success: false, error: upsertError.message };
  revalidatePath(`/teams/${teamId}`, "layout");
  return { success: true, data: { since } };
}
