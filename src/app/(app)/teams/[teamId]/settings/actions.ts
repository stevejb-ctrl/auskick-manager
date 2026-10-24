"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgeGroupConfig, getSportConfig, isBasketball, isSoccer, isTouch, teamSport } from "@/lib/sports";
import { soccerFamilyAgeGroup, soccerFamilyRules } from "@/lib/sports/soccer/family";
import { mixedRuleColumns } from "@/lib/sports/touch/mixed";
import type { MixedRule } from "@/lib/sports/touch/types";
import type { ActionResult, Sport } from "@/lib/types";
import { storedOnFieldSize, teamOnFieldSize } from "@/lib/games/newGameDefaults";
import { pinPlayedPeriodLength } from "@/lib/games/pinPlayedPeriodLength";

const BUCKET = "team-songs";
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
]);

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

/** Extract the storage object path from a public Supabase Storage URL. */
function storagePathFromUrl(url: string): string | null {
  try {
    const marker = `/object/public/${BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(url.slice(idx + marker.length));
  } catch {
    return null;
  }
}

/**
 * Upload a new team song (or replace the existing one).
 * Accepts FormData with:
 *   - "song"          File   — the audio file
 *   - "start_seconds" string — integer seconds to start playback from
 */
export async function saveSong(
  teamId: string,
  formData: FormData
): Promise<ActionResult & { song_url?: string }> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const file = formData.get("song") as File | null;
  const startSeconds = Math.max(
    0,
    parseInt((formData.get("start_seconds") as string | null) ?? "0", 10) || 0
  );
  const durationSeconds = Math.min(
    120,
    Math.max(5, parseInt((formData.get("duration_seconds") as string | null) ?? "15", 10) || 15)
  );

  if (!file || file.size === 0) return { success: false, error: "No file selected." };
  if (file.size > MAX_BYTES) return { success: false, error: "File too large (max 20 MB)." };
  if (!ALLOWED_MIME.has(file.type)) {
    return { success: false, error: "Unsupported file type. Use MP3, M4A, AAC, WAV or OGG." };
  }

  // Derive a safe extension
  const nameLower = file.name.toLowerCase();
  const dotIdx = nameLower.lastIndexOf(".");
  const ext = dotIdx !== -1 ? nameLower.slice(dotIdx) : ".mp3";

  // Use a timestamp so each upload gets a unique URL (CDN cache-busting)
  const storagePath = `${teamId}/song-${Date.now()}${ext}`;

  const admin = createAdminClient();

  // Delete any existing song file first
  const { data: existing } = await supabase
    .from("teams")
    .select("song_url")
    .eq("id", teamId)
    .single();
  if (existing?.song_url) {
    const oldPath = storagePathFromUrl(existing.song_url);
    if (oldPath) await admin.storage.from(BUCKET).remove([oldPath]);
  }

  // Upload new file
  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });

  if (uploadError) return { success: false, error: uploadError.message };

  const {
    data: { publicUrl },
  } = admin.storage.from(BUCKET).getPublicUrl(storagePath);

  // Persist to teams table
  const { error: updateError } = await supabase
    .from("teams")
    .update({ song_url: publicUrl, song_start_seconds: startSeconds, song_duration_seconds: durationSeconds })
    .eq("id", teamId);

  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}/settings`);
  return { success: true, song_url: publicUrl };
}

/**
 * Save a public URL (YouTube or direct audio) as the team song.
 * No file is uploaded — the URL is stored directly in the teams table.
 */
export async function saveSongUrl(
  teamId: string,
  url: string,
  startSeconds: number,
  durationSeconds: number
): Promise<ActionResult & { song_url?: string }> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const trimmed = url.trim();
  if (!trimmed.startsWith("https://")) {
    return { success: false, error: "URL must start with https://" };
  }

  const { error: updateError } = await supabase
    .from("teams")
    .update({
      song_url: trimmed,
      song_start_seconds: Math.max(0, startSeconds),
      song_duration_seconds: Math.min(120, Math.max(5, durationSeconds)),
    })
    .eq("id", teamId);

  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}/settings`);
  return { success: true, song_url: trimmed };
}

/** Toggle whether the team song plays on goals. The URL is preserved. */
export async function setSongEnabled(
  teamId: string,
  enabled: boolean
): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const { error: updateError } = await supabase
    .from("teams")
    .update({ song_enabled: enabled })
    .eq("id", teamId);

  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}/settings`);
  return { success: true };
}

/** Update song timing (start + duration) without re-uploading the file or URL. */
export async function updateSongTiming(
  teamId: string,
  startSeconds: number,
  durationSeconds: number
): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const { error: updateError } = await supabase
    .from("teams")
    .update({
      song_start_seconds: Math.max(0, startSeconds),
      song_duration_seconds: Math.min(120, Math.max(5, durationSeconds)),
    })
    .eq("id", teamId);

  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}/settings`);
  return { success: true };
}

/** Rename the team. Admin only. */
export async function renameTeam(
  teamId: string,
  newName: string
): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const trimmed = newName.trim();
  if (trimmed.length === 0) return { success: false, error: "Name can't be empty." };
  if (trimmed.length > 80) return { success: false, error: "Name is too long (80 chars max)." };

  const { error: updateError } = await supabase
    .from("teams")
    .update({ name: trimmed })
    .eq("id", teamId);

  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}`, "layout");
  return { success: true };
}

/** Remove the team song entirely. */
export async function deleteSong(teamId: string): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const { data: existing } = await supabase
    .from("teams")
    .select("song_url")
    .eq("id", teamId)
    .single();

  if (existing?.song_url) {
    const oldPath = storagePathFromUrl(existing.song_url);
    if (oldPath) {
      const admin = createAdminClient();
      await admin.storage.from(BUCKET).remove([oldPath]);
    }
  }

  const { error: updateError } = await supabase
    .from("teams")
    .update({ song_url: null, song_start_seconds: 0 })
    .eq("id", teamId);

  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}/settings`);
  return { success: true };
}


/**
 * Team › Season › Age group. Validated against the team's sport; the
 * scoring toggle and existing games are left as they are. The team's
 * own players on the field are kept inside the new age's range.
 */
export async function setTeamAgeGroup(
  teamId: string,
  ageGroup: string,
): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const { data: team } = await supabase.from("teams").select("sport, on_field_size").eq("id", teamId).single();
  if (!team) return { success: false, error: "Team not found." };
  const sport = teamSport((team as { sport?: Sport | null }).sport);
  const cfg = getSportConfig(sport);
  const ageCfg = cfg.ageGroups.find((a) => a.id === ageGroup);
  if (!ageCfg) {
    return { success: false, error: `Invalid age group "${ageGroup}" for ${cfg.name}.` };
  }

  // Past games keep the length they were played with (UX round 2).
  try {
    await pinPlayedPeriodLength(supabase, teamId);
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }

  const { error: updateError } = await supabase
    .from("teams")
    .update({
      age_group: ageGroup,
      on_field_size: storedOnFieldSize(ageCfg, (team as { on_field_size?: number | null }).on_field_size),
    })
    .eq("id", teamId);
  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}`, "layout");
  return { success: true };
}

/**
 * Team › Season › Players on the field: the team's competition's size
 * (competitions differ by state). New games start from it; NULL (or the
 * age group's own) = the age group's default. It must be inside the age
 * group's range.
 */
export async function setTeamOnFieldSize(
  teamId: string,
  size: number | null,
): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const { data: team } = await supabase.from("teams").select("sport, age_group").eq("id", teamId).single();
  if (!team) return { success: false, error: "Team not found." };
  const sport = teamSport((team as { sport?: Sport | null }).sport);
  const ageCfg = getAgeGroupConfig(sport, (team as { age_group?: string | null }).age_group ?? null);
  if (size !== null && (!Number.isInteger(size) || size < ageCfg.minOnFieldSize || size > ageCfg.maxOnFieldSize)) {
    return {
      success: false,
      error: `${ageCfg.label} plays ${ageCfg.minOnFieldSize} to ${ageCfg.maxOnFieldSize} on the field.`,
    };
  }

  const { error: updateError } = await supabase
    .from("teams")
    .update({ on_field_size: storedOnFieldSize(ageCfg, size) })
    .eq("id", teamId);
  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}/settings`);
  revalidatePath(`/teams/${teamId}/games`);
  return { success: true };
}

/** Team › Danger zone › Leave team — removes the caller's own membership. */
export async function leaveTeam(teamId: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthenticated." };

  const { error: deleteError } = await supabase
    .from("team_memberships")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", user.id);
  if (deleteError) {
    // guard_last_team_admin (migration 0052)
    if (deleteError.message.includes("last_admin")) {
      return {
        success: false,
        error: "You're the team's only coach. Make someone else a coach first, or delete the team.",
      };
    }
    return { success: false, error: deleteError.message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Team › Danger zone › Delete team. Coaches only (RLS "teams: delete"),
 * and the caller must have typed the team's name. Squad, games, events
 * and memberships cascade.
 */
export async function deleteTeam(teamId: string, confirmName: string): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const { data: team } = await supabase.from("teams").select("name").eq("id", teamId).single();
  if (!team) return { success: false, error: "Team not found." };
  if (confirmName.trim() !== (team.name as string).trim()) {
    return { success: false, error: "Type the team name exactly to confirm." };
  }

  const { error: deleteError } = await supabase.from("teams").delete().eq("id", teamId);
  if (deleteError) return { success: false, error: deleteError.message };

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Team › Season › Halves or quarters: the competition plays 2 × 20 or
 * 4 × 10 (basketball), or 4 × 15 or 2 × 30 (hockey: VIC plays halves)
 * (migration 0069's teams.period_count). Touch and Oztag choose halves
 * or one continuous period instead (0071's 1). Null = the age group's
 * own (basketball's, touch's and Oztag's halves; hockey's halves to U12,
 * quarters from U13), so a later change of age follows the new age.
 * Only a sport that lets a team choose takes it. The period-length
 * override is cleared with it: a half's length isn't a quarter's.
 */
export async function setTeamPeriodCount(teamId: string, count: 1 | 2 | 4 | null): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const { data: team } = await supabase.from("teams").select("sport, age_group").eq("id", teamId).single();
  if (!team) return { success: false, error: "Team not found." };
  const sport = teamSport((team as { sport?: Sport | null }).sport);
  const halvesOrQuarters = count === null || count === 2 || count === 4;
  // The age group's own count, which stores as null.
  let own: number;
  if (isTouch(sport)) {
    if (count !== null && count !== 1 && count !== 2) return { success: false, error: "Halves or one period only." };
    own = 2;
  } else if (isBasketball(sport)) {
    if (!halvesOrQuarters) return { success: false, error: "Halves or quarters only." };
    own = 2;
  } else if (isSoccer(sport) && soccerFamilyRules(sport).halvesOrQuarters) {
    if (!halvesOrQuarters) return { success: false, error: "Halves or quarters only." };
    own = soccerFamilyAgeGroup(sport, (team as { age_group?: string | null }).age_group ?? null).periodCount;
  } else {
    return { success: false, error: "Only basketball, hockey, touch and Oztag teams choose their periods." };
  }

  // Past games keep the length they were played with (UX round 2).
  try {
    await pinPlayedPeriodLength(supabase, teamId);
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }

  const { error: updateError } = await supabase
    .from("teams")
    .update({ period_count: count === own ? null : count, quarter_length_seconds: null })
    .eq("id", teamId);
  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}/settings`);
  revalidatePath(`/teams/${teamId}/games`);
  return { success: true };
}

/**
 * Team › Game-day extras › Track fouls (basketball): the coach's foul
 * tally on the live screen (migration 0069's teams.track_fouls).
 */
export async function setTeamTrackFouls(teamId: string, enabled: boolean): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const { data: team } = await supabase.from("teams").select("sport").eq("id", teamId).single();
  if (!team) return { success: false, error: "Team not found." };
  if (teamSport((team as { sport?: Sport | null }).sport) !== "basketball") {
    return { success: false, error: "Only basketball teams track fouls." };
  }

  const { error: updateError } = await supabase.from("teams").update({ track_fouls: enabled }).eq("id", teamId);
  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}/settings`);
  return { success: true };
}

/**
 * Team › Season › Mixed team (touch, Oztag): the most boys on the field
 * and the fewest girls and boys (migration 0071), or null for a team that
 * isn't mixed. A team that stops being mixed loses its girl's-try
 * setting too. Who counts as a girl or a boy is asked at the lineup.
 */
export async function setTeamMixedRule(teamId: string, rule: MixedRule | null): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const { data: team } = await supabase.from("teams").select("sport, age_group").eq("id", teamId).single();
  if (!team) return { success: false, error: "Team not found." };
  const sport = teamSport((team as { sport?: Sport | null }).sport);
  if (!isTouch(sport)) return { success: false, error: "Only touch and Oztag teams can be mixed." };
  if (rule) {
    const size = getAgeGroupConfig(sport, (team as { age_group?: string | null }).age_group ?? null).maxOnFieldSize;
    const whole = [rule.maxBoys, rule.minGirls, rule.minBoys].every((n) => Number.isInteger(n) && n >= 0 && n <= size);
    if (!whole) return { success: false, error: `Each number is between 0 and ${size}.` };
    if (rule.minBoys > rule.maxBoys) return { success: false, error: "The fewest boys can't be more than the most." };
    if (rule.minGirls + rule.minBoys > size) return { success: false, error: `The fewest girls and boys add up to more than ${size} on the field.` };
  }

  const { error: updateError } = await supabase
    .from("teams")
    .update({ ...mixedRuleColumns(rule), ...(rule ? {} : { girls_try_double: null }) })
    .eq("id", teamId);
  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}/settings`);
  revalidatePath(`/teams/${teamId}/squad`);
  return { success: true };
}

/**
 * Team › Game-day extras › A girl's try counts 2 (Oztag mixed, ITF rule
 * 4.3): on by default (null); a competition that doesn't play it turns
 * it off (false).
 */
export async function setTeamGirlsTryDouble(teamId: string, enabled: boolean): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const { data: team } = await supabase.from("teams").select("sport").eq("id", teamId).single();
  if (!team) return { success: false, error: "Team not found." };
  if (teamSport((team as { sport?: Sport | null }).sport) !== "oztag") {
    return { success: false, error: "Only Oztag teams count a girl's try as 2." };
  }

  const { error: updateError } = await supabase
    .from("teams")
    .update({ girls_try_double: enabled ? null : false })
    .eq("id", teamId);
  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}/settings`);
  return { success: true };
}
