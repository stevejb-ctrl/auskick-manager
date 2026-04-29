import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { LiveGame } from "@/components/live/LiveGame";
import { AvailabilityList } from "@/components/games/AvailabilityList";
import { GameInfoHeader } from "@/components/games/GameInfoHeader";
import { ResetGameButton } from "@/components/games/ResetGameButton";
import { replayGame, seasonZoneMinutes, seasonLoanMinutes, zoneCapsFor } from "@/lib/fairness";
import { AGE_GROUPS, ageGroupOf } from "@/lib/ageGroups";
import { getAgeGroupConfig, getEffectiveQuarterSeconds } from "@/lib/sports";
import type { Game, GameEvent, LiveAuth, Player, Sport } from "@/lib/types";

export const dynamic = "force-dynamic";

interface RunPageProps {
  params: { token: string };
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
  const ageGroup = ageGroupOf(teamRow?.age_group);
  // Netball has no jersey numbers — hide the # input on AddFillInForm.
  const sport: Sport = ((teamRow as { sport?: Sport } | null)?.sport) ?? "afl";
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

  const auth: LiveAuth = { kind: "token", token: params.token };

  const { data: thisGameEvents } = await admin
    .from("game_events")
    .select("*")
    .eq("game_id", g.id)
    .order("created_at");
  const hasStarted = (thisGameEvents ?? []).some((e) => e.type === "lineup_set");

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
          showJerseyNumber={sport !== "netball"}
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
