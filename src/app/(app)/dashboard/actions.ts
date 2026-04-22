"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, AgeGroup } from "@/lib/types";

export async function createTeam(
  userId: string,
  name: string,
  ageGroup: AgeGroup = "U10"
): Promise<ActionResult & { teamId?: string; redirectUrl?: string }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== userId) {
    return { success: false, error: "Unauthenticated." };
  }

  // Pre-generate the team ID so we can return the setup-wizard URL
  // directly without a post-insert SELECT round-trip.  The trigger still
  // fires and creates the admin membership row inside the same DB
  // transaction.
  const teamId = crypto.randomUUID();

  const { error: insertError } = await supabase
    .from("teams")
    .insert({ id: teamId, name, created_by: user.id, age_group: ageGroup });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  revalidatePath("/dashboard");

  // Return the URL instead of calling redirect() so the client component
  // can use router.push() — redirect() thrown from inside startTransition
  // is not reliably caught by Next.js 14's client-side navigation.
  return {
    success: true,
    teamId,
    redirectUrl: `/teams/${teamId}/setup?step=config`,
  };
}
