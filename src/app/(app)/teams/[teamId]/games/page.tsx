import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { CreateGameForm } from "@/components/games/CreateGameForm";
import { GameList } from "@/components/games/GameList";
import { TrackScoringToggle } from "@/components/games/TrackScoringToggle";
import { Spinner } from "@/components/ui/Spinner";

interface GamesPageProps {
  params: { teamId: string };
}

export default async function GamesPage({ params }: GamesPageProps) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data: membership } = await supabase
      .from("team_memberships")
      .select("role")
      .eq("team_id", params.teamId)
      .eq("user_id", user.id)
      .single();
    isAdmin = membership?.role === "admin";
  }

  const { data: team } = await supabase
    .from("teams")
    .select("track_scoring")
    .eq("id", params.teamId)
    .single();
  const trackScoring = team?.track_scoring ?? false;

  return (
    <div className="space-y-6">
      {isAdmin && (
        <TrackScoringToggle teamId={params.teamId} initialEnabled={trackScoring} />
      )}

      {isAdmin && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-800">Create game</h2>
          <CreateGameForm teamId={params.teamId} />
        </div>
      )}

      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        }
      >
        <GameList teamId={params.teamId} />
      </Suspense>
    </div>
  );
}
