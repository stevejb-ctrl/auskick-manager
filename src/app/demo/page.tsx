import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { AGE_GROUPS } from "@/lib/ageGroups";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  noStore();
  const admin = createAdminClient();

  const { data: team } = await admin
    .from("teams")
    .select("id, age_group")
    .eq("is_demo", true)
    .limit(1)
    .maybeSingle();

  if (!team) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-center text-ink-dim">
          Demo not set up yet — check back soon.
        </p>
      </div>
    );
  }

  const { data: adminRow } = await admin
    .from("team_memberships")
    .select("user_id")
    .eq("team_id", team.id)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (!adminRow) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-center text-ink-dim">Demo configuration error.</p>
      </div>
    );
  }

  // Clean up any leftover in-progress demo games before creating a fresh one.
  await admin
    .from("games")
    .update({ status: "completed" })
    .eq("team_id", team.id)
    .neq("status", "completed");

  const cfg = AGE_GROUPS["U10"];

  const { data: newGame } = await admin
    .from("games")
    .insert({
      team_id: team.id,
      opponent: "Demo Opponent",
      scheduled_at: new Date().toISOString(),
      location: null,
      notes: null,
      on_field_size: cfg.defaultOnFieldSize,
      sub_interval_seconds: cfg.subIntervalSeconds,
      clock_multiplier: 8,
      created_by: adminRow.user_id,
    })
    .select("id, share_token")
    .single();

  if (!newGame) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-center text-ink-dim">
          Could not start demo — please try again.
        </p>
      </div>
    );
  }

  const { data: players } = await admin
    .from("players")
    .select("id")
    .eq("team_id", team.id)
    .eq("is_active", true);

  if (players && players.length > 0) {
    await admin.from("game_availability").insert(
      players.map((p) => ({
        game_id: newGame.id,
        player_id: p.id,
        status: "available" as const,
      }))
    );
  }

  redirect(`/run/${newGame.share_token}`);
}
