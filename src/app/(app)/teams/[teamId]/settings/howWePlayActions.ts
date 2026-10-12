"use server";

// Team › How we play and wizard step 2 (UX plan §7.8). Coaches only:
// managers run games but don't change how the team plays.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { effectivePolicy, getSportPlaybook } from "@/lib/playbook";
import { resolveTeamPlaybook, sanitizeOverrides } from "@/lib/playbook/team";
import { normaliseRole, prefsFromRole, roleModelFor, type PlayerRole } from "@/lib/playbook/roles";
import { getAgeGroupConfig } from "@/lib/sports";
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

export interface PositionInput {
  /** An existing team_positions.id, a default key ("chb") or "new-…". */
  key: string;
  label: string;
  name: string;
  line: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * AFL open ages: save the team's named positions (UX plan 3.4), in
 * order. Existing positions keep their ids so kids' home positions
 * follow a rename; removed ones are archived, not deleted. When a
 * default position ("chb") is first saved, prefs that pointed at the
 * default key move to the new row. Returns the ids in input order.
 */
export async function saveTeamPositions(
  teamId: string,
  list: PositionInput[],
): Promise<ActionResult<{ ids: string[] }>> {
  const { supabase, user, error } = await authedCoach(teamId);
  if (error || !user) return { success: false, error: error ?? "Unauthenticated." };

  const [{ data: team }, { data: row }] = await Promise.all([
    supabase.from("teams").select("sport, age_group").eq("id", teamId).single(),
    supabase.from("team_playbooks").select("policy_overrides").eq("team_id", teamId).maybeSingle(),
  ]);
  if (!team) return { success: false, error: "Team not found." };
  const sport = ((team.sport as Sport | null) ?? "afl") as Sport;
  const ageGroup = team.age_group as string;
  const policy = effectivePolicy(sport, ageGroup, (row?.policy_overrides ?? {}) as PolicyOverrides);
  const ageCfg = getAgeGroupConfig(sport, ageGroup);
  if (getSportPlaybook(sport).positionModel(policy, ageCfg.defaultOnFieldSize).kind !== "custom") {
    return { success: false, error: "This team's positions are set by its age group." };
  }

  const max = Math.max(ageCfg.maxOnFieldSize, ageCfg.defaultOnFieldSize);
  if (list.length < 1 || list.length > max) {
    return { success: false, error: `Name between 1 and ${max} positions.` };
  }
  const clean = list.map((p) => ({
    key: p.key,
    label: p.label.trim().toUpperCase(),
    name: p.name.trim() || null,
    line: p.line,
  }));
  for (const p of clean) {
    if (p.label.length < 1 || p.label.length > 4) {
      return { success: false, error: "Position labels are 1 to 4 characters." };
    }
    if (p.line !== "back" && p.line !== "mid" && p.line !== "fwd") {
      return { success: false, error: "Unknown line." };
    }
    if (p.name && p.name.length > 40) return { success: false, error: "Position names are up to 40 characters." };
  }

  const { data: existing } = await supabase
    .from("team_positions")
    .select("id")
    .eq("team_id", teamId)
    .is("archived_at", null);
  const existingIds = new Set((existing ?? []).map((r) => r.id as string));

  const ids: string[] = [];
  const moved: { from: string; to: string }[] = [];
  for (let sort = 0; sort < clean.length; sort++) {
    const p = clean[sort];
    const fields = {
      label: p.label,
      name: p.name,
      line: p.line as "back" | "mid" | "fwd",
      sort,
      on_field_size: ageCfg.defaultOnFieldSize,
    };
    if (UUID.test(p.key) && existingIds.has(p.key)) {
      const { error: e } = await supabase.from("team_positions").update(fields).eq("id", p.key);
      if (e) return { success: false, error: e.message };
      ids.push(p.key);
      existingIds.delete(p.key);
    } else {
      const { data: inserted, error: e } = await supabase
        .from("team_positions")
        .insert({ team_id: teamId, ...fields })
        .select("id")
        .single();
      if (e || !inserted) return { success: false, error: e?.message ?? "Couldn't add a position." };
      ids.push(inserted.id as string);
      if (!p.key.startsWith("new-")) moved.push({ from: p.key, to: inserted.id as string });
    }
  }

  if (existingIds.size > 0) {
    const { error: e } = await supabase
      .from("team_positions")
      .update({ archived_at: new Date().toISOString() })
      .in("id", Array.from(existingIds));
    if (e) return { success: false, error: e.message };
  }
  for (const m of moved) {
    await supabase
      .from("player_position_prefs")
      .update({ position_key: m.to })
      .eq("team_id", teamId)
      .eq("position_key", m.from);
  }

  revalidatePath(`/teams/${teamId}`, "layout");
  return { success: true, data: { ids } };
}

/**
 * Save one player's role (UX plan 3.5): replaces their home / also /
 * not-here rows for this unit (positions or lines) and their keep-on
 * flag. Keys are checked against the team's current role model.
 */
export async function savePlayerRole(
  teamId: string,
  playerId: string,
  role: PlayerRole,
): Promise<ActionResult> {
  const { supabase, user, error } = await authedCoach(teamId);
  if (error || !user) return { success: false, error: error ?? "Unauthenticated." };

  const [{ data: team }, { data: row }, { data: positions }, { data: player }] = await Promise.all([
    supabase.from("teams").select("sport, age_group").eq("id", teamId).single(),
    supabase
      .from("team_playbooks")
      .select("strategy, policy_overrides, season_balance, season_balance_since")
      .eq("team_id", teamId)
      .maybeSingle(),
    supabase
      .from("team_positions")
      .select("id, label, name, line, sort, archived_at")
      .eq("team_id", teamId)
      .is("archived_at", null),
    supabase.from("players").select("id").eq("id", playerId).eq("team_id", teamId).maybeSingle(),
  ]);
  if (!team) return { success: false, error: "Team not found." };
  if (!player) return { success: false, error: "Player not found." };
  const sport = ((team.sport as Sport | null) ?? "afl") as Sport;
  const ageCfg = getAgeGroupConfig(sport, team.age_group as string);
  const resolved = resolveTeamPlaybook({
    sport,
    ageGroup: ageCfg.id,
    onFieldSize: ageCfg.defaultOnFieldSize,
    row: row ?? null,
    positions: positions ?? [],
  });
  const model = roleModelFor(resolved);
  if (!model) return { success: false, error: "Every player rotates through every zone at this age." };
  const clean = normaliseRole(
    model.home ? role : { ...role, home: null, also: [] },
    model.options.map((o) => o.key),
  );

  // Replace this unit's rows and the keep-on flag; rows for the other
  // unit (e.g. line prefs kept from an earlier strategy) stay.
  const del = supabase.from("player_position_prefs").delete().eq("team_id", teamId).eq("player_id", playerId);
  const { error: delError } =
    model.unit === "position"
      ? await del.or("position_key.not.is.null,kind.eq.keep_on")
      : await del.is("position_key", null);
  if (delError) return { success: false, error: delError.message };

  const rows = prefsFromRole(clean, model.unit).map((r) => ({ ...r, team_id: teamId, player_id: playerId }));
  if (rows.length > 0) {
    const { error: insError } = await supabase.from("player_position_prefs").insert(rows);
    if (insError) return { success: false, error: insError.message };
  }

  revalidatePath(`/teams/${teamId}`, "layout");
  return { success: true };
}
