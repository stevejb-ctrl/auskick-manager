import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TeamSongSettings } from "@/components/team/TeamSongSettings";
import { TeamNameSettings } from "@/components/team/TeamNameSettings";
import { TrackScoringToggle } from "@/components/games/TrackScoringToggle";

interface SettingsPageProps {
  params: { teamId: string };
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: team }, { data: songData }, { data: membership }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, track_scoring")
      .eq("id", params.teamId)
      .single(),
    supabase
      .from("teams")
      .select("song_url, song_start_seconds, song_duration_seconds")
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
      <TeamNameSettings
        teamId={params.teamId}
        currentName={team.name}
        isAdmin={isAdmin}
      />
      <TrackScoringToggle
        teamId={params.teamId}
        initialEnabled={team.track_scoring ?? false}
        isAdmin={isAdmin}
      />
      <TeamSongSettings
        teamId={params.teamId}
        currentSongUrl={songData?.song_url ?? null}
        currentStartSeconds={songData?.song_start_seconds ?? 0}
        currentDurationSeconds={songData?.song_duration_seconds ?? 15}
        isAdmin={isAdmin}
      />
    </div>
  );
}
