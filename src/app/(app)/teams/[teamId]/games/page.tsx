import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { CreateGameForm } from "@/components/games/CreateGameForm";
import { GameList } from "@/components/games/GameList";
import { ImportFixturesButton } from "@/components/games/ImportFixturesButton";
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
    .select("track_scoring, age_group")
    .eq("id", params.teamId)
    .single();
  const trackScoring = team?.track_scoring ?? false;
  const ageGroup = (team?.age_group ?? "U10") as import("@/lib/types").AgeGroup;

  let existingExternalIds: string[] = [];
  if (isAdmin) {
    const { data: imported } = await supabase
      .from("games")
      .select("external_id")
      .eq("team_id", params.teamId)
      .eq("external_source", "playhq");
    existingExternalIds = (imported ?? [])
      .map((g) => g.external_id)
      .filter((v): v is string => !!v);
  }

  return (
    <div className="space-y-6">
      {isAdmin && (
        <TrackScoringToggle teamId={params.teamId} initialEnabled={trackScoring} />
      )}

      {isAdmin && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-gray-800">Create game</h2>
            <ImportFixturesButton
              teamId={params.teamId}
              existingExternalIds={existingExternalIds}
            />
          </div>
          <CreateGameForm teamId={params.teamId} ageGroup={ageGroup} />
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
