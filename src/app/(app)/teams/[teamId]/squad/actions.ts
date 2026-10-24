"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAgeGroupConfig, teamSport } from "@/lib/sports";
import type { ParsedPlayer } from "@/lib/squadPaste";
import type { ActionResult, Sport } from "@/lib/types";
import { teamSportById } from "@/lib/sports/teamSportById";

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

async function squadCapFor(
  supabase: ReturnType<typeof createClient>,
  teamId: string
): Promise<number> {
  // The team's own sport config — the AFL-only AGE_GROUPS map gave
  // netball and league teams AFL U10's cap (20) whatever their age.
  const { data: team } = await supabase
    .from("teams")
    .select("sport, age_group")
    .eq("id", teamId)
    .single();
  const row = team as { sport?: Sport | null; age_group?: string | null } | null;
  const sport = row ? teamSport(row.sport) : await teamSportById(teamId);
  // No such team: no room in its squad.
  if (!sport) return 0;
  return getAgeGroupConfig(sport, row?.age_group).maxSquadSize;
}

/**
 * Add several players at once (the pasted-list path). All or nothing:
 * checks the squad cap and taken jersey numbers first so a coach never
 * ends up with half a list added.
 */
export async function addPlayers(
  teamId: string,
  players: ParsedPlayer[],
): Promise<ActionResult & { added?: number }> {
  const { supabase, user, error } = await getAuthedAdmin(teamId);
  if (error || !user) return { success: false, error: error ?? "Unauthenticated." };
  if (players.length === 0) return { success: false, error: "No players to add." };

  const maxPlayers = await squadCapFor(supabase, teamId);
  // Every kid, active or not: a number stays an inactive kid's (the
  // database's unique index), so the clash names them.
  const { data: everyone } = await supabase
    .from("players")
    .select("full_name, jersey_number, is_active")
    .eq("team_id", teamId);
  const activeCount = (everyone ?? []).filter((p) => p.is_active).length;
  if (activeCount + players.length > maxPlayers) {
    const room = Math.max(0, maxPlayers - activeCount);
    return {
      success: false,
      error: `That's ${players.length} players but there's room for ${room} (squad max ${maxPlayers}).`,
    };
  }
  for (const p of players) {
    const owner = p.jersey_number != null ? (everyone ?? []).find((k) => k.jersey_number === p.jersey_number) : null;
    if (owner) return { success: false, error: jerseyTakenMessage(p.jersey_number!, owner) };
  }

  const { error: insertError } = await supabase.from("players").insert(
    players.map((p) => ({
      team_id: teamId,
      full_name: p.full_name,
      jersey_number: p.jersey_number,
      created_by: user.id,
    })),
  );
  if (insertError) {
    if (insertError.code === "23505") {
      return { success: false, error: "One of those jersey numbers is already taken." };
    }
    return { success: false, error: insertError.message };
  }

  revalidatePath(`/teams/${teamId}/squad`);
  revalidatePath(`/teams/${teamId}/setup`);
  return { success: true, added: players.length };
}

export async function addPlayer(
  teamId: string,
  fullName: string,
  jerseyNumber: number | null,
  chip: "a" | "b" | "c" | null = null,
  /** Touch and Oztag mixed teams: who the kid counts as under the rule. */
  mixedGroup: "girl" | "boy" | null = null,
): Promise<ActionResult> {
  const { supabase, user, error } = await getAuthedAdmin(teamId);
  if (error || !user) return { success: false, error: error ?? "Unauthenticated." };

  const maxPlayers = await squadCapFor(supabase, teamId);

  const { count } = await supabase
    .from("players")
    .select("*", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("is_active", true);

  if ((count ?? 0) >= maxPlayers) {
    return {
      success: false,
      error: `Squad is full (${maxPlayers} players maximum).`,
    };
  }

  const { error: insertError } = await supabase.from("players").insert({
    team_id: teamId,
    full_name: fullName,
    jersey_number: jerseyNumber,
    chip,
    ...(mixedGroup === "girl" || mixedGroup === "boy" ? { mixed_group: mixedGroup } : {}),
    created_by: user.id,
  });

  if (insertError) {
    if (insertError.code === "23505" && jerseyNumber != null) {
      return { success: false, error: await jerseyTakenError(supabase, teamId, jerseyNumber) };
    }
    return { success: false, error: insertError.message };
  }

  revalidatePath(`/teams/${teamId}/squad`);
  return { success: true };
}

/** "Jersey #8 is Sam Lee's (inactive)." — whose, so the coach can choose. */
function jerseyTakenMessage(n: number, owner: { full_name: string; is_active: boolean }): string {
  return `Jersey #${n} is ${owner.full_name}'s${owner.is_active ? "" : " (inactive)"}.`;
}

async function jerseyTakenError(
  supabase: ReturnType<typeof createClient>,
  teamId: string,
  n: number,
): Promise<string> {
  const { data: owner } = await supabase
    .from("players")
    .select("full_name, is_active")
    .eq("team_id", teamId)
    .eq("jersey_number", n)
    .maybeSingle();
  return owner ? jerseyTakenMessage(n, owner) : `Jersey #${n} is already taken.`;
}

export async function updatePlayer(
  teamId: string,
  playerId: string,
  patch: {
    full_name?: string;
    jersey_number?: number | null;
    is_active?: boolean;
    chip?: "a" | "b" | "c" | null;
    /** Touch and Oztag mixed teams: who the kid counts as under the rule. */
    mixed_group?: "girl" | "boy" | null;
  },
): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const { error: updateError } = await supabase
    .from("players")
    .update(patch)
    .eq("id", playerId)
    .eq("team_id", teamId);

  if (updateError) {
    if (updateError.code === "23505" && patch.jersey_number != null) {
      return { success: false, error: await jerseyTakenError(supabase, teamId, patch.jersey_number) };
    }
    return { success: false, error: updateError.message };
  }

  revalidatePath(`/teams/${teamId}/squad`);
  return { success: true };
}

export async function deactivatePlayer(
  teamId: string,
  playerId: string
): Promise<ActionResult> {
  return updatePlayer(teamId, playerId, { is_active: false });
}

export async function reactivatePlayer(
  teamId: string,
  playerId: string
): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const maxPlayers = await squadCapFor(supabase, teamId);

  const { count } = await supabase
    .from("players")
    .select("*", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("is_active", true);

  if ((count ?? 0) >= maxPlayers) {
    return { success: false, error: "Squad is full — deactivate another player first." };
  }

  return updatePlayer(teamId, playerId, { is_active: true });
}
