import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // Fetch team + membership via the service-role client.
  //
  // Background: on a freshly-created team the RLS-backed SELECT from the
  // user's cookie client was intermittently returning null here, even
  // though the AFTER INSERT trigger on `teams` had already created the
  // admin membership row in the same DB transaction as the team insert.
  // The `teams: read` policy calls `is_team_member()` (SECURITY DEFINER
  // using auth.uid()) and it works fine everywhere else in the app, so
  // the failure mode was specific to this page's server-component
  // request — most likely a cookie/session propagation edge case in the
  // just-after-redirect window.
  //
  // We side-step the RLS dependency entirely here by fetching with the
  // service-role client, then doing an explicit membership check of our
  // own.  Individual mutations in each step are still gated by
  // `is_team_admin()` inside their server actions, so bypassing RLS on
  // this read-only page does not widen the privilege surface.
  const adminClient = createAdminClient();

  const [
    { data: team, error: teamError },
    { data: membership, error: membershipError },
  ] = await Promise.all([
    adminClient
      .from("teams")
      .select("name, age_group, track_scoring, playhq_url")
      .eq("id", params.teamId)
      .maybeSingle(),
    adminClient
      .from("team_memberships")
      .select("role")
      .eq("team_id", params.teamId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  console.log("[SetupPage] admin fetch", {
    teamId: params.teamId,
    teamFound: !!team,
    teamError: teamError?.message,
    membershipRole: membership?.role,
    membershipError: membershipError?.message,
  });

  if (!team || !membership) {
    console.log("[SetupPage] team or membership missing → /dashboard", {
      hasTeam: !!team,
      hasMembership: !!membership,
    });
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

  // step === "done" — fetch counts for the summary card.  Admin client
  // keeps this consistent with the team fetch above (RLS-agnostic);
  // head+count is cheap and avoids hauling back full rows.
  const [{ count: playerCount }, { count: gameCount }] = await Promise.all([
    adminClient
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("team_id", params.teamId)
      .eq("is_active", true),
    adminClient
      .from("games")
      .select("id", { count: "exact", head: true })
      .eq("team_id", params.teamId),
  ]);

  return (
    <DoneStep
      teamId={params.teamId}
      teamName={teamName}
      playerCount={playerCount ?? 0}
      gameCount={gameCount ?? 0}
      scoringEnabled={team.track_scoring ?? false}
    />
  );
}
