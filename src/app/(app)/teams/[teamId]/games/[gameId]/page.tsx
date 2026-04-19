import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AvailabilityList } from "@/components/games/AvailabilityList";
import { ShareRunnerLink } from "@/components/games/ShareRunnerLink";
import { ResetGameButton } from "@/components/games/ResetGameButton";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import { Spinner } from "@/components/ui/Spinner";
import type { Game } from "@/lib/types";

interface GameDetailPageProps {
  params: { teamId: string; gameId: string };
}

export default async function GameDetailPage({ params }: GameDetailPageProps) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: game }, { data: membership }] = await Promise.all([
    supabase
      .from("games")
      .select("*")
      .eq("id", params.gameId)
      .eq("team_id", params.teamId)
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

  if (!game) notFound();

  const g = game as Game;
  const role = membership?.role;
  const canEdit = role === "admin" || role === "game_manager";
  const canRun = canEdit;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/teams/${params.teamId}/games`}
          className="text-sm text-gray-500 hover:text-brand-600"
        >
          ← Games
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-baseline gap-2">
          {g.round_number != null && (
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-600">
              Round {g.round_number}
            </span>
          )}
          <span className="text-xs text-gray-400">
            <FormattedDateTime iso={g.scheduled_at} mode="long" />
          </span>
        </div>
        <h2 className="mt-1 text-xl font-bold text-gray-900">vs {g.opponent}</h2>
        {g.location && <p className="mt-1 text-sm text-gray-500">{g.location}</p>}
        {g.on_field_size < 12 && (
          <p className="mt-1 text-sm font-medium text-amber-700">
            Short-handed: {g.on_field_size} on field
          </p>
        )}
        {g.notes && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{g.notes}</p>
        )}
        {canRun && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/teams/${params.teamId}/games/${params.gameId}/live`}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              {g.status === "upcoming" ? "Start game" : "Open live game"}
            </Link>
            {role === "admin" && <ShareRunnerLink token={g.share_token} />}
            {role === "admin" && g.status !== "upcoming" && (
              <ResetGameButton teamId={params.teamId} gameId={params.gameId} />
            )}
          </div>
        )}
      </div>

      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        }
      >
        <AvailabilityList
          auth={{ kind: "team", teamId: params.teamId }}
          teamId={params.teamId}
          gameId={params.gameId}
          canEdit={canEdit}
        />
      </Suspense>
    </div>
  );
}
