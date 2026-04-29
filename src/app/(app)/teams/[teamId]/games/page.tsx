import { Suspense } from "react";
import { createClient, getUser } from "@/lib/supabase/server";
import { AddGameSection } from "@/components/games/AddGameSection";
import { GameList } from "@/components/games/GameList";
import { GamesFilter, type GamesFilterValue } from "@/components/games/GamesFilter";
import { Spinner } from "@/components/ui/Spinner";
import { getAgeGroupConfig } from "@/lib/sports";
import type { Sport } from "@/lib/types";
import { Eyebrow } from "@/components/sf";

interface GamesPageProps {
  params: { teamId: string };
  searchParams?: { filter?: string };
}

function parseFilter(raw: string | undefined): GamesFilterValue {
  if (raw === "upcoming" || raw === "final") return raw;
  return "all";
}

export default async function GamesPage({
  params,
  searchParams,
}: GamesPageProps) {
  const supabase = createClient();
  const filter = parseFilter(searchParams?.filter);

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
      .select("age_group, sport, playhq_url")
      .eq("id", params.teamId)
      .single(),
  ]);

  const isAdmin = membershipResult.data?.role === "admin";
  const team = teamResult.data;
  const sport = ((team as { sport?: string | null } | null)?.sport ?? "afl") as Sport;
  const ageGroupCfg = getAgeGroupConfig(sport, team?.age_group as string | null);

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
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Eyebrow>2026 Season</Eyebrow>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tightest text-ink sm:text-[32px]">
            Games
          </h1>
        </div>
        <GamesFilter />
      </header>

      {isAdmin && (
        <AddGameSection
          teamId={params.teamId}
          ageGroup={ageGroupCfg}
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
        <GameList teamId={params.teamId} filter={filter} />
      </Suspense>
    </div>
  );
}
