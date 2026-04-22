import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScoringStep } from "@/components/setup/ScoringStep";
import { SquadStep } from "@/components/setup/SquadStep";
import { GamesStep } from "@/components/setup/GamesStep";
import { DoneStep } from "@/components/setup/DoneStep";
import type { AgeGroup, Player } from "@/lib/types";

type SetupQueryStep = "config" | "squad" | "games" | "done";

const VALID_STEPS: SetupQueryStep[] = ["config", "squad", "games", "done"];

interface SetupPageProps {
  params: { teamId: string };
  searchParams: { step?: string };
}

function normalizeStep(raw: string | undefined): SetupQueryStep {
  if (raw && (VALID_STEPS as string[]).includes(raw)) return raw as SetupQueryStep;
  return "config";
}

export default async function SetupPage({ params, searchParams }: SetupPageProps) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.log("[SetupPage] enter", {
    teamId: params.teamId,
    step: searchParams.step,
    hasUser: !!user,
    userId: user?.id,
  });

  if (!user) {
    console.log("[SetupPage] no user → /login");
    redirect(`/login?next=/teams/${params.teamId}/setup`);
  }

  const step = normalizeStep(searchParams.step);

  // Fetch the team — the `teams: read` RLS policy calls is_team_member()
  // (a SECURITY DEFINER function) which is the same gate used everywhere
  // else in the app.  If the user is not a member the SELECT returns null
  // and we redirect to /dashboard.  Individual mutations in each step are
  // separately guarded by is_team_admin() inside their server actions, so
  // there is no privilege-escalation risk from removing a page-level
  // admin check here.
  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("name, age_group, track_scoring, playhq_url")
    .eq("id", params.teamId)
    .single();

  console.log("[SetupPage] team fetch", {
    teamId: params.teamId,
    found: !!team,
    error: teamError?.message,
  });

  if (!team) {
    console.log("[SetupPage] team null → /dashboard");
    redirect("/dashboard");
  }

  const ageGroup = (team.age_group ?? "U10") as AgeGroup;
  const teamName = team.name as string;

  if (step === "config") {
    return (
      <ScoringStep
        teamId={params.teamId}
        ageGroup={ageGroup}
        initialEnabled={team.track_scoring ?? false}
      />
    );
  }

  if (step === "squad") {
    const { data: playersRaw } = await supabase
      .from("players")
      .select("*")
      .eq("team_id", params.teamId)
      .order("jersey_number");
    const players = (playersRaw ?? []) as Player[];

    return (
      <SquadStep
        teamId={params.teamId}
        ageGroup={ageGroup}
        players={players}
      />
    );
  }

  if (step === "games") {
    const { data: imported } = await supabase
      .from("games")
      .select("external_id")
      .eq("team_id", params.teamId)
      .eq("external_source", "playhq");
    const existingExternalIds = (imported ?? [])
      .map((g) => g.external_id)
      .filter((v): v is string => !!v);

    const { data: gamesRaw } = await supabase
      .from("games")
      .select("id, opponent, scheduled_at, round_number, location")
      .eq("team_id", params.teamId)
      .order("scheduled_at", { ascending: true });

    return (
      <GamesStep
        teamId={params.teamId}
        ageGroup={ageGroup}
        existingExternalIds={existingExternalIds}
        playhqUrl={(team.playhq_url as string | null) ?? ""}
        games={gamesRaw ?? []}
      />
    );
  }

  // step === "done"
  return <DoneStep teamId={params.teamId} teamName={teamName} />;
}
