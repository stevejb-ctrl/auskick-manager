import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { LiveGame } from "@/components/live/LiveGame";
import { NetballLiveGame } from "@/components/netball/NetballLiveGame";
import { AvailabilityList } from "@/components/games/AvailabilityList";
import { GameInfoHeader } from "@/components/games/GameInfoHeader";
import { ResetGameButton } from "@/components/games/ResetGameButton";
import { replayGame, seasonZoneMinutes, seasonLoanMinutes, seasonAvailability, zoneCapsFor } from "@/lib/fairness";
import { replayNetballGame } from "@/lib/sports/netball/fairness";
import { AGE_GROUPS, ageGroupOf } from "@/lib/ageGroups";
import { getAgeGroupConfig, getEffectiveQuarterSeconds, netballSport } from "@/lib/sports";
import type { FillIn, Game, GameEvent, LiveAuth, Player, Sport } from "@/lib/types";

export const dynamic = "force-dynamic";

interface RunPageProps {
  params: { token: string };
}

/**
 * A fill-in player is stored in `game_fill_ins` but needs to look like a
 * normal Player to the live UI. Mirrors the same helper on the
 * team-coach live page; duplicated here rather than imported because
 * the team-coach version lives behind a route group.
 */
function fillInToPlayer(f: FillIn, teamId: string): Player {
  return {
    id: f.id,
    team_id: teamId,
    full_name: f.full_name,
    jersey_number: f.jersey_number,
    is_active: true,
    created_by: f.created_by ?? "",
    created_at: f.created_at,
    updated_at: f.created_at,
  };
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
    .select("name, sport, track_scoring, age_group, quarter_length_seconds, song_url, song_start_seconds, song_duration_seconds, song_enabled")
    .eq("id", g.team_id)
    .single();
  const teamName = teamRow?.name ?? "Team";
  const trackScoring = teamRow?.track_scoring ?? false;
  // Netball has no jersey numbers — hide the # input on AddFillInForm
  // (and feed the right live-game component below).
  const sport: Sport = ((teamRow as { sport?: Sport } | null)?.sport) ?? "afl";

  const auth: LiveAuth = { kind: "token", token: params.token };

  const { data: thisGameEvents } = await admin
    .from("game_events")
    .select("*")
    .eq("game_id", g.id)
    .order("created_at");
  const hasStarted = (thisGameEvents ?? []).some((e) => e.type === "lineup_set");

  // ─── Netball branch ─────────────────────────────────────────
  // Netball games render through NetballLiveGame; the AFL LiveGame
  // doesn't understand the lineup shape or the period-break-only sub
  // model. Branch here so the runner-token flow on a netball game
  // (e.g. the public `/demo` redirect on sirennetball.com.au) lands
  // in the right shell with the right clock semantics.
  //
  // NetballLiveGame has a built-in pre-kickoff lineup picker (renders
  // when initialLineup is null), so we don't need a separate /lineup
  // step — the runner lands here and either picks the starting lineup
  // (pre-kickoff) or sees the live court (mid-game). The /lineup
  // route handler bounces back here for netball games.
  if (sport === "netball") {
    const ageCfgN =
      netballSport.ageGroups.find((a) => a.id === teamRow?.age_group) ??
      netballSport.ageGroups.find((a) => a.id === "open")!;
    const quarterLengthSeconds = getEffectiveQuarterSeconds(
      {
        quarter_length_seconds:
          (teamRow as { quarter_length_seconds?: number | null } | null)
            ?.quarter_length_seconds ?? null,
      },
      ageCfgN,
      { quarter_length_seconds: g.quarter_length_seconds },
    );

    const [
      { data: avail },
      { data: players },
      { data: teamGames },
      { data: fillInRows },
    ] = await Promise.all([
      admin
        .from("game_availability")
        .select("player_id, status")
        .eq("game_id", g.id)
        .eq("status", "available"),
      admin
        .from("players")
        .select("*")
        .eq("team_id", g.team_id)
        .eq("is_active", true)
        .order("jersey_number"),
      admin.from("games").select("id").eq("team_id", g.team_id),
      admin
        .from("game_fill_ins")
        .select("*")
        .eq("game_id", g.id)
        .order("created_at"),
    ]);

    const fillInsForLive = ((fillInRows ?? []) as FillIn[]).map((f) =>
      fillInToPlayer(f, g.team_id),
    );
    const squad = [...((players ?? []) as Player[]), ...fillInsForLive];
    const lateArrivedFromEvents = ((thisGameEvents ?? []) as GameEvent[])
      .filter((e) => e.type === "player_arrived" && e.player_id)
      .map((e) => e.player_id as string);
    const availableIds = Array.from(
      new Set<string>([
        ...(avail ?? []).map((a) => a.player_id),
        ...fillInsForLive.map((f) => f.id),
        ...lateArrivedFromEvents,
      ]),
    );

    const otherGameIds = (teamGames ?? [])
      .map((t) => t.id)
      .filter((id) => id !== g.id);
    const { data: seasonEventsNetball } = otherGameIds.length
      ? await admin.from("game_events").select("*").in("game_id", otherGameIds)
      : { data: [] as GameEvent[] };

    const state = replayNetballGame((thisGameEvents ?? []) as GameEvent[]);
    const isPreKickoff = state.lineup === null;
    void hasStarted;
    return (
      <div className="space-y-3 p-3">
        {!isPreKickoff && <GameInfoHeader teamName={teamName} g={g} compact />}
        <NetballLiveGame
          auth={auth}
          game={g}
          teamName={teamName}
          squad={squad}
          availableIds={availableIds}
          ageGroup={ageCfgN}
          quarterLengthSeconds={quarterLengthSeconds}
          initialLineup={state.lineup}
          currentQuarter={state.currentQuarter}
          quarterElapsedMs={state.quarterElapsedMs}
          quarterStartedAt={state.quarterStartedAt}
          teamScore={state.teamScore}
          opponentScore={state.opponentScore}
          playerGoals={state.playerGoals}
          quarterEnded={state.quarterEnded}
          finalised={state.finalised}
          thisGameEvents={(thisGameEvents ?? []) as GameEvent[]}
          seasonEvents={(seasonEventsNetball ?? []) as GameEvent[]}
          trackScoring={trackScoring}
          clockMultiplier={g.clock_multiplier ?? 1}
        />
        <div className="border-t border-hairline pt-4">
          <ResetGameButton auth={auth} gameId={g.id} />
        </div>
      </div>
    );
  }

  // ─── AFL branch (existing behaviour) ────────────────────────
  const ageGroup = ageGroupOf(teamRow?.age_group);
  const positionModel = AGE_GROUPS[ageGroup].positionModel;
  // D-26 / D-27: same wiring as the team-coach branch in
  // (app)/teams/[teamId]/games/[gameId]/live/page.tsx. The runner-token
  // page renders the same <LiveGame> component for AFL games, so the
  // hooter and countdown surfaces need the same per-game/per-team-aware
  // duration. Three-level resolution: game → team → ageGroup default.
  const ageCfgSport = getAgeGroupConfig("afl", ageGroup);
  const quarterMs = getEffectiveQuarterSeconds(
    { quarter_length_seconds: (teamRow as { quarter_length_seconds?: number | null } | null)?.quarter_length_seconds ?? null },
    ageCfgSport,
    { quarter_length_seconds: g.quarter_length_seconds },
  ) * 1000;
  // When the admin has disabled the song, hide the URL from the live page
  // so no playback is attempted (iframe/audio simply never mounts).
  const songEnabled = teamRow?.song_enabled ?? true;
  const songUrl = songEnabled ? (teamRow?.song_url ?? null) : null;
  const songStartSeconds = teamRow?.song_start_seconds ?? 0;
  const songDurationSeconds = teamRow?.song_duration_seconds ?? 15;

  if (hasStarted) {
    const state = replayGame((thisGameEvents ?? []) as GameEvent[]);
    const [{ data: squadPlayers }, { data: teamGames }] = await Promise.all([
      admin
        .from("players")
        .select("*")
        .eq("team_id", g.team_id)
        .eq("is_active", true)
        .order("jersey_number"),
      admin.from("games").select("id").eq("team_id", g.team_id),
    ]);
    // Pass the full active squad — LateArrivalMenu needs non-available
    // players as candidates, and LiveGame filters in-field/bench itself.
    const allSquad = (squadPlayers ?? []) as Player[];
    const priorGameIds = (teamGames ?? [])
      .map((t) => t.id)
      .filter((id) => id !== g.id);
    const { data: allTeamEvents } = priorGameIds.length
      ? await admin.from("game_events").select("*").in("game_id", priorGameIds)
      : { data: [] as GameEvent[] };
    const season = seasonZoneMinutes((allTeamEvents ?? []) as GameEvent[]);
    const loanMins = seasonLoanMinutes((allTeamEvents ?? []) as GameEvent[]);
    const seasonAvail = seasonAvailability((allTeamEvents ?? []) as GameEvent[]);

    return (
      <div className="space-y-3 p-3">
        <GameInfoHeader teamName={teamName} g={g} compact />
        <LiveGame
          auth={auth}
          gameId={g.id}
          teamName={teamName}
          opponentName={g.opponent}
          trackScoring={trackScoring}
          subIntervalSeconds={g.sub_interval_seconds}
          clockMultiplier={g.clock_multiplier ?? 1}
          squadPlayers={allSquad}
          initialState={state}
          season={season}
          seasonAvailability={seasonAvail}
          seasonLoanMinutes={loanMins}
          zoneCaps={zoneCapsFor(g.on_field_size, positionModel)}
          positionModel={positionModel}
          songUrl={songUrl}
          songStartSeconds={songStartSeconds}
          songDurationSeconds={songDurationSeconds}
          quarterMs={quarterMs}
        />
        <div className="border-t border-hairline pt-4">
          <ResetGameButton auth={auth} gameId={g.id} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-3">
      <GameInfoHeader teamName={teamName} g={g} />

      <section className="space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-micro text-ink-dim">
          Who&apos;s here today?
        </h3>
        <AvailabilityList
          auth={auth}
          teamId={g.team_id}
          gameId={g.id}
          canMarkAvailability
          canManageMatch
          showJerseyNumber
        />
      </section>

      <div className="flex justify-end">
        <Link
          href={`/run/${params.token}/lineup`}
          className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-warm transition-colors duration-fast ease-out-quart hover:bg-brand-700"
        >
          Continue to starting lineup →
        </Link>
      </div>
    </div>
  );
}
