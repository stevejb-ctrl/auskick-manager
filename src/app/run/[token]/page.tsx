import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { LiveGame } from "@/components/live/LiveGame";
import { AvailabilityList } from "@/components/games/AvailabilityList";
import { FormattedDateTime } from "@/components/ui/FormattedDateTime";
import { replayGame, seasonZoneMinutes, zoneCapsFor } from "@/lib/fairness";
import { AGE_GROUPS, ageGroupOf } from "@/lib/ageGroups";
import type { Game, GameEvent, LiveAuth, Player } from "@/lib/types";

export const dynamic = "force-dynamic";

interface RunPageProps {
  params: { token: string };
}

function GameHeader({ teamName, g }: { teamName: string; g: Game }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
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
      <h2 className="mt-1 text-xl font-bold text-gray-900">
        {teamName} vs {g.opponent}
      </h2>
      {g.location && (
        <p className="mt-1 text-sm text-gray-500">{g.location}</p>
      )}
      {g.notes && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">
          {g.notes}
        </p>
      )}
    </div>
  );
}

export default async function RunPage({ params }: RunPageProps) {
  noStore();
  const admin = createAdminClient();

  const { data: game } = await admin
    .from("games")
    .select("*")
    .eq("share_token", params.token)
    .maybeSingle();
  if (!game) notFound();
  const g = game as Game;

  const { data: teamRow } = await admin
    .from("teams")
    .select("name, track_scoring, age_group, song_url, song_start_seconds, song_duration_seconds")
    .eq("id", g.team_id)
    .single();
  const teamName = teamRow?.name ?? "Team";
  const trackScoring = teamRow?.track_scoring ?? false;
  const ageGroup = ageGroupOf(teamRow?.age_group);
  const positionModel = AGE_GROUPS[ageGroup].positionModel;
  const songUrl = teamRow?.song_url ?? null;
  const songStartSeconds = teamRow?.song_start_seconds ?? 0;
  const songDurationSeconds = teamRow?.song_duration_seconds ?? 15;

  const auth: LiveAuth = { kind: "token", token: params.token };

  const { data: thisGameEvents } = await admin
    .from("game_events")
    .select("*")
    .eq("game_id", g.id)
    .order("created_at");
  const hasStarted = (thisGameEvents ?? []).some((e) => e.type === "lineup_set");

  if (hasStarted) {
    const state = replayGame((thisGameEvents ?? []) as GameEvent[]);
    const [{ data: squadPlayers }, { data: teamGames }, { data: gameAvail }] =
      await Promise.all([
        admin
          .from("players")
          .select("*")
          .eq("team_id", g.team_id)
          .eq("is_active", true)
          .order("jersey_number"),
        admin.from("games").select("id").eq("team_id", g.team_id),
        admin
          .from("game_availability")
          .select("player_id, status")
          .eq("game_id", g.id)
          .eq("status", "available"),
      ]);
    const allActive = (squadPlayers ?? []) as Player[];
    const availableIds = new Set((gameAvail ?? []).map((a) => a.player_id));
    const inGameIds = new Set<string>();
    if (state.lineup) {
      const l = state.lineup;
      for (const id of [
        ...l.back,
        ...l.hback,
        ...l.mid,
        ...l.hfwd,
        ...l.fwd,
        ...l.bench,
      ])
        inGameIds.add(id);
    }
    const allSquad = allActive.filter(
      (p) => availableIds.has(p.id) || inGameIds.has(p.id)
    );
    const priorGameIds = (teamGames ?? [])
      .map((t) => t.id)
      .filter((id) => id !== g.id);
    const { data: allTeamEvents } = priorGameIds.length
      ? await admin.from("game_events").select("*").in("game_id", priorGameIds)
      : { data: [] as GameEvent[] };
    const season = seasonZoneMinutes((allTeamEvents ?? []) as GameEvent[]);

    return (
      <div className="mx-auto max-w-2xl space-y-4 p-3">
        <GameHeader teamName={teamName} g={g} />
        <LiveGame
          auth={auth}
          gameId={g.id}
          teamName={teamName}
          opponentName={g.opponent}
          trackScoring={trackScoring}
          subIntervalSeconds={g.sub_interval_seconds}
          squadPlayers={allSquad}
          initialState={state}
          season={season}
          zoneCaps={zoneCapsFor(g.on_field_size, positionModel)}
          positionModel={positionModel}
          songUrl={songUrl}
          songStartSeconds={songStartSeconds}
          songDurationSeconds={songDurationSeconds}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-3">
      <GameHeader teamName={teamName} g={g} />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
          Who&apos;s here today?
        </h3>
        <AvailabilityList
          auth={auth}
          teamId={g.team_id}
          gameId={g.id}
          canEdit
        />
      </section>

      <div className="flex justify-end">
        <Link
          href={`/run/${params.token}/lineup`}
          className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          Continue to starting lineup →
        </Link>
      </div>
    </div>
  );
}
