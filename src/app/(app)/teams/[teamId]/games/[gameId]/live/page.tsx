import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LineupPicker } from "@/components/live/LineupPicker";
import { LiveGame } from "@/components/live/LiveGame";
import { ResetGameButton } from "@/components/games/ResetGameButton";
import {
  replayGame,
  seasonZoneMinutes,
  zoneCapsFor,
} from "@/lib/fairness";
import { AGE_GROUPS, ageGroupOf } from "@/lib/ageGroups";
import type { Game, GameEvent, Player } from "@/lib/types";

interface LivePageProps {
  params: { teamId: string; gameId: string };
}

export default async function LivePage({ params }: LivePageProps) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("team_memberships")
    .select("role")
    .eq("team_id", params.teamId)
    .eq("user_id", user.id)
    .single();

  const isAdmin = membership?.role === "admin";
  const canRun = isAdmin || membership?.role === "game_manager";
  if (!canRun) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Only admins and game managers can run a live game.
      </div>
    );
  }

  const [{ data: game }, { data: teamRow }] = await Promise.all([
    supabase
      .from("games")
      .select("*")
      .eq("id", params.gameId)
      .eq("team_id", params.teamId)
      .single(),
    supabase
      .from("teams")
      .select("name, track_scoring, age_group, song_url, song_start_seconds")
      .eq("id", params.teamId)
      .single(),
  ]);
  if (!game) notFound();
  const g = game as Game;
  const teamName = teamRow?.name ?? "Team";
  const trackScoring = teamRow?.track_scoring ?? false;
  const ageGroup = ageGroupOf(teamRow?.age_group);
  const songUrl = teamRow?.song_url ?? null;
  const songStartSeconds = teamRow?.song_start_seconds ?? 0;
  const positionModel = AGE_GROUPS[ageGroup].positionModel;

  // Has the game already started? (any lineup_set event)
  const { data: thisGameEvents } = await supabase
    .from("game_events")
    .select("*")
    .eq("game_id", params.gameId)
    .order("created_at");
  const hasStarted = (thisGameEvents ?? []).some((e) => e.type === "lineup_set");

  const ageCfg = AGE_GROUPS[ageGroup];
  const zoneCaps = zoneCapsFor(g.on_field_size, positionModel);

  if (hasStarted) {
    const state = replayGame((thisGameEvents ?? []) as GameEvent[]);
    const [{ data: squadPlayers }, { data: teamGames }, { data: gameAvail }] =
      await Promise.all([
        supabase
          .from("players")
          .select("*")
          .eq("team_id", params.teamId)
          .eq("is_active", true)
          .order("jersey_number"),
        supabase.from("games").select("id").eq("team_id", params.teamId),
        supabase
          .from("game_availability")
          .select("player_id, status")
          .eq("game_id", params.gameId)
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
      .filter((id) => id !== params.gameId);
    const { data: allTeamEvents } = priorGameIds.length
      ? await supabase
          .from("game_events")
          .select("*")
          .in("game_id", priorGameIds)
      : { data: [] as GameEvent[] };
    const season = seasonZoneMinutes((allTeamEvents ?? []) as GameEvent[]);

    return (
      <div className="space-y-4">
        <LiveGame
          auth={{ kind: "team", teamId: params.teamId }}
          gameId={params.gameId}
          teamName={teamName}
          opponentName={g.opponent}
          trackScoring={trackScoring}
          subIntervalSeconds={g.sub_interval_seconds}
          squadPlayers={allSquad}
          initialState={state}
          season={season}
          zoneCaps={zoneCaps}
          positionModel={positionModel}
          exitHref={`/teams/${params.teamId}/games/${params.gameId}`}
          songUrl={songUrl}
          songStartSeconds={songStartSeconds}
        />
        {isAdmin && (
          <div className="border-t border-gray-200 pt-4">
            <ResetGameButton teamId={params.teamId} gameId={params.gameId} />
          </div>
        )}
      </div>
    );
  }

  // Pre-kick-off: build picker data.
  const [{ data: avail }, { data: players }, { data: teamGames }] = await Promise.all([
    supabase
      .from("game_availability")
      .select("player_id, status")
      .eq("game_id", params.gameId)
      .eq("status", "available"),
    supabase
      .from("players")
      .select("*")
      .eq("team_id", params.teamId)
      .eq("is_active", true)
      .order("jersey_number"),
    supabase.from("games").select("id").eq("team_id", params.teamId),
  ]);

  const allActive = (players ?? []) as Player[];
  const availableIds = new Set((avail ?? []).map((a) => a.player_id));
  const availablePlayers = allActive.filter((p) => availableIds.has(p.id));

  // Season events: all events for this team's prior games.
  const otherGameIds = (teamGames ?? [])
    .map((t) => t.id)
    .filter((id) => id !== params.gameId);
  const { data: seasonEvents } = otherGameIds.length
    ? await supabase
        .from("game_events")
        .select("*")
        .in("game_id", otherGameIds)
    : { data: [] as GameEvent[] };

  const season = seasonZoneMinutes((seasonEvents ?? []) as GameEvent[]);

  return (
    <div className="space-y-4">
      {availablePlayers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          No players marked available — go back and set availability first.
        </p>
      ) : (
        <LineupPicker
          auth={{ kind: "team", teamId: params.teamId }}
          gameId={params.gameId}
          players={availablePlayers}
          season={season}
          defaultOnFieldSize={g.on_field_size}
          minOnFieldSize={ageCfg.minOnFieldSize}
          maxOnFieldSize={ageCfg.maxOnFieldSize}
          positionModel={positionModel}
        />
      )}
    </div>
  );
}
