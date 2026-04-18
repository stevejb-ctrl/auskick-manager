"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

export async function createTeam(
  userId: string,
  name: string
): Promise<ActionResult & { teamId?: string }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== userId) {
    return { success: false, error: "Unauthenticated." };
  }

  // Insert without .select() — using RETURNING would evaluate the SELECT
  // policy before the handle_new_team trigger adds the membership row.
  const { error: insertError } = await supabase
    .from("teams")
    .insert({ name, created_by: user.id });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  // Separate fetch — trigger has now run, membership exists, SELECT policy passes.
  const { data: team, error: fetchError } = await supabase
    .from("teams")
    .select("id")
    .eq("created_by", user.id)
    .eq("name", name)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (fetchError || !team) {
    revalidatePath("/dashboard");
    redirect("/dashboard");
  }

  revalidatePath("/dashboard");
  redirect(`/teams/${team.id}/squad`);
}
