"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  DELETE_CONFIRMATION_WORD,
  GRACE_DAYS,
} from "@/lib/account/constants";
import type { ActionResult } from "@/lib/types";

/**
 * Schedule the current user's account for deletion in GRACE_DAYS.
 *
 * Soft-delete: no data is removed at this point — we only set the
 * timestamp columns. The nightly Supabase Edge Function
 * `purge-deleted-accounts` does the real wipe once
 * `deletion_scheduled_for` has passed.
 *
 * During the grace period the user can keep using the app normally
 * (so they can decide to restore), but every authenticated screen
 * surfaces a `DeletionScheduledBanner` reminding them of the date.
 *
 * Confirmation: the caller must pass the literal string "delete"
 * (case-insensitive, trimmed). The modal in
 * src/components/account/DeleteAccountModal.tsx enforces this on the
 * client too; we duplicate the check server-side so a direct API
 * call still has to clear the bar.
 */
export async function requestDeleteAccount(
  confirmation: string,
): Promise<ActionResult> {
  if (
    typeof confirmation !== "string" ||
    confirmation.trim().toLowerCase() !== DELETE_CONFIRMATION_WORD
  ) {
    return {
      success: false,
      error: `Type "${DELETE_CONFIRMATION_WORD}" to confirm.`,
    };
  }

  const {
    data: { user },
  } = await getUser();
  if (!user) return { success: false, error: "Not signed in." };

  const supabase = createClient();
  const now = new Date();
  const scheduled = new Date(now);
  scheduled.setUTCDate(scheduled.getUTCDate() + GRACE_DAYS);

  const { error } = await supabase
    .from("profiles")
    .update({
      deletion_requested_at: now.toISOString(),
      deletion_scheduled_for: scheduled.toISOString(),
    })
    .eq("id", user.id);

  if (error) return { success: false, error: error.message };

  // Banner is rendered from the (app) layout via a profile read; bust
  // every authed route so the schedule shows up on the very next render.
  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Cancel a pending deletion. Nulls both schedule columns. Idempotent —
 * calling it on an account that wasn't scheduled is a no-op.
 */
export async function restoreAccount(): Promise<ActionResult> {
  const {
    data: { user },
  } = await getUser();
  if (!user) return { success: false, error: "Not signed in." };

  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      deletion_requested_at: null,
      deletion_scheduled_for: null,
    })
    .eq("id", user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}
