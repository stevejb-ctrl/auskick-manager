"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, AgeGroup } from "@/lib/types";

export async function createTeam(
  userId: string,
  name: string,
  ageGroup: AgeGroup = "U10"
): Promise<ActionResult & { teamId?: string }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== userId) {
    return { success: false, error: "Unauthenticated." };
  }

  // Pre-generate the team ID so we can redirect straight to the setup
  // wizard without a round-trip SELECT.  The trigger still fires and
  // creates the admin membership row inside the same DB transaction.
  const teamId = crypto.randomUUID();

  const { error: insertError } = await supabase
    .from("teams")
    .insert({ id: teamId, name, created_by: user.id, age_group: ageGroup });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  revalidatePath("/dashboard");
  redirect(`/teams/${teamId}/setup?step=config`);
}
