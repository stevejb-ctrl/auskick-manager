import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TeamSongSettings } from "@/components/team/TeamSongSettings";

interface SettingsPageProps {
  params: { teamId: string };
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: team }, { data: membership }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, song_url, song_start_seconds")
      .eq("id", params.teamId)
      .single(),
    user
      ? supabase
          .from("team_memberships")
          .select("role")
          .eq("team_id", params.teamId)
          .eq("user_id", user.id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  if (!team) notFound();

  const isAdmin = membership?.role === "admin";

  return (
    <div className="space-y-6">
      <TeamSongSettings
        teamId={params.teamId}
        currentSongUrl={team.song_url ?? null}
        currentStartSeconds={team.song_start_seconds ?? 0}
        isAdmin={isAdmin}
      />
    </div>
  );
}
