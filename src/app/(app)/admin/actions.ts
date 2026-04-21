"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

const ALLOWED_COLORS = new Set([
  "brand",
  "warn",
  "ok",
  "info",
  "danger",
  "neutral",
]);

function sanitizeColor(color: string): string {
  return ALLOWED_COLORS.has(color) ? color : "brand";
}

// ─── Tag CRUD ─────────────────────────────────────────────────

export async function createTag(
  name: string,
  color: string
): Promise<ActionResult> {
  await requireSuperAdmin();
  const trimmed = name.trim();
  if (trimmed.length === 0) return { success: false, error: "Name required." };
  if (trimmed.length > 40) {
    return { success: false, error: "Name too long (40 chars max)." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("contact_tags")
    .insert({ name: trimmed, color: sanitizeColor(color) });

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/tags");
  revalidatePath("/admin/users");
  return { success: true };
}

export async function updateTag(
  id: string,
  name: string,
  color: string
): Promise<ActionResult> {
  await requireSuperAdmin();
  const trimmed = name.trim();
  if (trimmed.length === 0) return { success: false, error: "Name required." };
  if (trimmed.length > 40) {
    return { success: false, error: "Name too long (40 chars max)." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("contact_tags")
    .update({ name: trimmed, color: sanitizeColor(color) })
    .eq("id", id);

  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/tags");
  revalidatePath("/admin/users");
  return { success: true };
}

export async function deleteTag(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("contact_tags").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/tags");
  revalidatePath("/admin/users");
  return { success: true };
}

// ─── Profile <-> tag assignment ───────────────────────────────

export async function addTagToProfile(
  profileId: string,
  tagId: string
): Promise<ActionResult> {
  const { user } = await requireSuperAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("profile_tags")
    .insert({ profile_id: profileId, tag_id: tagId, assigned_by: user.id });
  // Swallow unique-violation — idempotent add.
  if (error && !String(error.message).includes("duplicate key")) {
    return { success: false, error: error.message };
  }
  revalidatePath(`/admin/users/${profileId}`);
  revalidatePath("/admin/users");
  return { success: true };
}

export async function removeTagFromProfile(
  profileId: string,
  tagId: string
): Promise<ActionResult> {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("profile_tags")
    .delete()
    .eq("profile_id", profileId)
    .eq("tag_id", tagId);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/users/${profileId}`);
  revalidatePath("/admin/users");
  return { success: true };
}

// ─── Notes ────────────────────────────────────────────────────

export async function addNote(
  profileId: string,
  body: string
): Promise<ActionResult> {
  const { user } = await requireSuperAdmin();
  const trimmed = body.trim();
  if (trimmed.length === 0) return { success: false, error: "Note is empty." };
  if (trimmed.length > 4000) {
    return { success: false, error: "Note too long (4000 chars max)." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("contact_notes").insert({
    profile_id: profileId,
    author_id: user.id,
    body: trimmed,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/users/${profileId}`);
  return { success: true };
}

export async function deleteNote(noteId: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const admin = createAdminClient();

  // Fetch first so we can revalidate the correct profile page.
  const { data: existing } = await admin
    .from("contact_notes")
    .select("profile_id")
    .eq("id", noteId)
    .maybeSingle();

  const { error } = await admin.from("contact_notes").delete().eq("id", noteId);
  if (error) return { success: false, error: error.message };

  if (existing?.profile_id) {
    revalidatePath(`/admin/users/${existing.profile_id}`);
  }
  return { success: true };
}

// ─── Preferences (manual unsubscribe toggle) ─────────────────
// Today this only persists the preference — it becomes meaningful when
// email ships and the send path checks `unsubscribed_at`.

export async function setUnsubscribed(
  profileId: string,
  unsubscribed: boolean,
  reason?: string
): Promise<ActionResult> {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const { error } = await admin.from("contact_preferences").upsert({
    profile_id: profileId,
    unsubscribed_at: unsubscribed ? new Date().toISOString() : null,
    unsub_reason: unsubscribed ? (reason ?? null) : null,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath(`/admin/users/${profileId}`);
  revalidatePath("/admin/users");
  return { success: true };
}
