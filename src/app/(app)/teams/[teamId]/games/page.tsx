import { Suspense } from "react";
import { createClient, getUser } from "@/lib/supabase/server";
import { AddGameSection } from "@/components/games/AddGameSection";
import { GameList } from "@/components/games/GameList";
import { Spinner } from "@/components/ui/Spinner";

interface GamesPageProps {
  params: { teamId: string };
}

export default async function GamesPage({ params }: GamesPageProps) {
  const supabase = createClient();

  const {
    data: { user },
  } = await getUser();

  const [membershipResult, teamResult] = await Promise.all([
    user
      ? supabase
          .from("team_memberships")
          .select("role")
          .eq("team_id", params.teamId)
          .eq("user_id", user.id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("teams")
      .select("age_group, playhq_url")
      .eq("id", params.teamId)
      .single(),
  ]);

  const isAdmin = membershipResult.data?.role === "admin";
  const team = teamResult.data;
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
        <AddGameSection
          teamId={params.teamId}
          ageGroup={ageGroup}
          existingExternalIds={existingExternalIds}
          initialUrl={
            (team as { playhq_url?: string | null } | null)?.playhq_url ?? ""
          }
        />
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
