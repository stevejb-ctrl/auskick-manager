"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSportConfig, teamSport } from "@/lib/sports";
import type { ActionResult, Sport } from "@/lib/types";

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
 * scoring toggle and existing games are left as they are.
 */
export async function setTeamAgeGroup(
  teamId: string,
  ageGroup: string,
): Promise<ActionResult> {
  const { supabase, error } = await getAuthedAdmin(teamId);
  if (error) return { success: false, error };

  const { data: team } = await supabase.from("teams").select("sport").eq("id", teamId).single();
  const sport = teamSport((team as { sport?: Sport | null } | null)?.sport);
  const cfg = getSportConfig(sport);
  if (!cfg.ageGroups.some((a) => a.id === ageGroup)) {
    return { success: false, error: `Invalid age group "${ageGroup}" for ${cfg.name}.` };
  }

  const { error: updateError } = await supabase
    .from("teams")
    .update({ age_group: ageGroup })
    .eq("id", teamId);
  if (updateError) return { success: false, error: updateError.message };

  revalidatePath(`/teams/${teamId}`, "layout");
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
