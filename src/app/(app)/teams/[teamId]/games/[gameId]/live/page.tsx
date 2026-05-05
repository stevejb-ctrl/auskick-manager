import { notFound, redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { LineupPicker } from "@/components/live/LineupPicker";
import { LiveGame } from "@/components/live/LiveGame";
import { NetballLiveGame } from "@/components/netball/NetballLiveGame";
import { GameInfoHeader } from "@/components/games/GameInfoHeader";
import { ResetGameButton } from "@/components/games/ResetGameButton";
import {
  replayGame,
  seasonZoneMinutes,
  seasonLoanMinutes,
  seasonAvailability,
  zoneCapsFor,
} from "@/lib/fairness";
import { AGE_GROUPS, ageGroupOf } from "@/lib/ageGroups";
import { getAgeGroupConfig, getEffectiveQuarterSeconds, getSportConfig, netballSport } from "@/lib/sports";
import { replayNetballGame } from "@/lib/sports/netball/fairness";
import type { FillIn, Game, GameEvent, Player, Sport } from "@/lib/types";

/**
 * A fill-in player is stored in `game_fill_ins` but needs to look like a
 * normal Player to the live UI (same id shape, same lookups). This projects
 * one into that shape. Their ids stay unique UUIDs so game_events can
 * reference them directly.
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

interface LivePageProps {
  params: { teamId: string; gameId: string };
}

export default async function LivePage({ params }: LivePageProps) {
  const supabase = createClient();

  const {
    data: { user },
  } = await getUser();
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
      <div className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
        Only admins and game managers can run a live game.
      </div>
    );
  }

  const [{ data: game }, { data: teamRow }, { data: thisGameEvents }] = await Promise.all([
    supabase
      .from("games")
      .select("*")
      .eq("id", params.gameId)
      .eq("team_id", params.teamId)
      .single(),
    supabase
      .from("teams")
      .select("name, sport, track_scoring, age_group, quarter_length_seconds, song_url, song_start_seconds, song_duration_seconds, song_enabled, chip_a_mode, chip_b_mode, chip_c_mode")
      .eq("id", params.teamId)
      .single(),
    supabase
      .from("game_events")
      .select("*")
      .eq("game_id", params.gameId)
      .order("created_at"),
  ]);
  if (!game) notFound();
  const g = game as Game;
  const teamName = teamRow?.name ?? "Team";
  const sport: Sport = (teamRow?.sport as Sport | undefined) ?? "afl";
  // track_scoring is sport-agnostic — both AFL and netball flows
  // honour it. Hoisted ABOVE the netball branch (was nested inside
  // the AFL branch) so plan 04-04's NetballLiveGame can consume it.
  // NETBALL-04 / NETBALL-07: this single source flows through to
  // the +G button gate, GS/GA scoring confirm gate, undo chip
  // gate, score-bug numeric gate, walkthrough scoring-step gate,
  // and the summary-card result+goals-line gate.
  const trackScoring = teamRow?.track_scoring ?? false;

  // ─── Netball branch ───────────────────────────────────────
  // Netball uses its own component tree (different lineup shape,
  // no mid-play subs, goals-only scoring). Branch early so none
  // of the AFL-specific helpers below run for netball games.
  if (sport === "netball") {
    const ageCfgN = netballSport.ageGroups.find((a) => a.id === teamRow?.age_group)
      ?? netballSport.ageGroups.find((a) => a.id === "open")!;
    // Three-level resolution, most specific wins:
    //   1. game.quarter_length_seconds — set in the pre-game lineup
    //      picker when this match runs to a non-standard length
    //      (finals, weather, double-header).
    //   2. team.quarter_length_seconds — coach's league plays a
    //      different quarter length than the age-group default.
    //   3. ageGroup.periodSeconds — sport-config default (10 min).
    const quarterLengthSeconds = getEffectiveQuarterSeconds(
      { quarter_length_seconds: (teamRow as { quarter_length_seconds?: number | null } | null)?.quarter_length_seconds ?? null },
      ageCfgN,
      { quarter_length_seconds: g.quarter_length_seconds },
    );

    const [
      { data: avail },
      { data: players },
      { data: teamGames },
      { data: fillInRows },
    ] = await Promise.all([
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
      supabase
        .from("game_fill_ins")
        .select("*")
        .eq("game_id", params.gameId)
        .order("created_at"),
    ]);

    // Match-day fill-ins are stored separately in game_fill_ins, but
    // need to look like regular Players to the live UI (same id shape,
    // appear in availableIds, render in NetballLineupPicker, etc.).
    // We can't piggy-back on game_availability for them — that table's
    // player_id has a FK to public.players(id), which fill-ins
    // deliberately don't appear in (the FK rejects the upsert with
    // 23503 and addFillIn's silent best-effort write is doomed). So
    // fill-ins are treated as IMPLICITLY AVAILABLE here: they're added
    // to the squad AND their ids are merged into availableIds. Coach
    // already had the agency to "would not show up if unavailable"
    // by simply not adding them to game_fill_ins in the first place.
    const fillInsForLive = ((fillInRows ?? []) as FillIn[]).map((f) =>
      fillInToPlayer(f, params.teamId),
    );
    const squad = [...((players ?? []) as Player[]), ...fillInsForLive];
    // availableIds also unions in any player_arrived event ids — late
    // arrivals are unconditionally available regardless of what
    // game_availability currently says about them. This rescues the
    // case where addLateArrival's availability upsert silently failed
    // earlier (the existing "unavailable" row got left in place) so
    // the late arrival's id was never picked up by the suggester or
    // the bench strip otherwise. Latest behaviour writes both, but
    // older games may have the audit event without a flipped row.
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
      .filter((id) => id !== params.gameId);
    const { data: seasonEvents } = otherGameIds.length
      ? await supabase.from("game_events").select("*").in("game_id", otherGameIds)
      : { data: [] as GameEvent[] };

    const state = replayNetballGame((thisGameEvents ?? []) as GameEvent[]);
    // Pre-kickoff = no lineup_set event yet. The starting-lineup
    // surface is intentionally minimal — back-to-availability
    // breadcrumb + the picker itself — so we hide the round/date
    // header strip AND the Restart Game button on this branch.
    // There's nothing to reset yet, and the page header would just
    // be visual noise on a one-purpose screen.
    const isPreKickoff = state.lineup === null;

    return (
      <div className="space-y-3">
        {!isPreKickoff && <GameInfoHeader teamName={teamName} g={g} compact />}
        <NetballLiveGame
          auth={{ kind: "team", teamId: params.teamId }}
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
          seasonEvents={(seasonEvents ?? []) as GameEvent[]}
          trackScoring={trackScoring}
          clockMultiplier={g.clock_multiplier ?? 1}
        />
        {isAdmin && !isPreKickoff && (
          <div className="border-t border-hairline pt-4">
            <ResetGameButton
              auth={{ kind: "team", teamId: params.teamId }}
              gameId={params.gameId}
            />
          </div>
        )}
      </div>
    );
  }

  // ─── AFL branch (existing behaviour) ──────────────────────
  // (`trackScoring` is hoisted above the netball branch so both
  // sports share the same source — see the const at the top of
  // this function.)
  const ageGroup = ageGroupOf(teamRow?.age_group);
  const songEnabled = teamRow?.song_enabled ?? true;
  const songUrl = songEnabled ? (teamRow?.song_url ?? null) : null;
  const songStartSeconds = teamRow?.song_start_seconds ?? 0;
  const songDurationSeconds = teamRow?.song_duration_seconds ?? 15;
  const positionModel = AGE_GROUPS[ageGroup].positionModel;
  void getSportConfig; // exported for future use; keep import alive.

  const hasStarted = (thisGameEvents ?? []).some((e) => e.type === "lineup_set");

  const ageCfg = AGE_GROUPS[ageGroup];
  // D-26 / D-27: compute the effective quarter length (seconds → ms) so
  // LiveGame's countdown cap and hooter trigger respect per-team and
  // per-game overrides instead of a hardcoded constant. Mirrors the
  // netball branch's call above. Three-level resolution, most specific
  // wins: game.quarter_length_seconds → team.quarter_length_seconds →
  // ageGroup.periodSeconds (= 12 min for AFL U10). Uses the sport-config
  // AgeGroupConfig (not the legacy AGE_GROUPS record) because
  // getEffectiveQuarterSeconds expects the sport-config shape.
  const ageCfgSport = getAgeGroupConfig("afl", ageGroup);
  const quarterMs = getEffectiveQuarterSeconds(
    { quarter_length_seconds: (teamRow as { quarter_length_seconds?: number | null } | null)?.quarter_length_seconds ?? null },
    ageCfgSport,
    { quarter_length_seconds: g.quarter_length_seconds },
  ) * 1000;
  const zoneCaps = zoneCapsFor(g.on_field_size, positionModel);

  // Per-chip mode (split / group). Both branches below use this:
  // hasStarted → LiveGame (mid-game suggester via QuarterBreak),
  // !hasStarted → LineupPicker (pre-game suggester).
  const teamChipModes = {
    a: ((teamRow as { chip_a_mode?: "split" | "group" } | null)?.chip_a_mode ?? "split") as import("@/lib/chips").ChipMode,
    b: ((teamRow as { chip_b_mode?: "split" | "group" } | null)?.chip_b_mode ?? "split") as import("@/lib/chips").ChipMode,
    c: ((teamRow as { chip_c_mode?: "split" | "group" } | null)?.chip_c_mode ?? "split") as import("@/lib/chips").ChipMode,
  };

  if (hasStarted) {
    const state = replayGame((thisGameEvents ?? []) as GameEvent[]);
    const [
      { data: squadPlayers },
      { data: teamGames },
      { data: fillInRows },
    ] = await Promise.all([
      supabase
        .from("players")
        .select("*")
        .eq("team_id", params.teamId)
        .eq("is_active", true)
        .order("jersey_number"),
      supabase.from("games").select("id").eq("team_id", params.teamId),
      supabase
        .from("game_fill_ins")
        .select("*")
        .eq("game_id", params.gameId)
        .order("created_at"),
    ]);
    const fillInsForLive = ((fillInRows ?? []) as FillIn[]).map((f) =>
      fillInToPlayer(f, params.teamId)
    );
    // Pass the full active squad (+ fill-ins) — LateArrivalMenu needs
    // non-available players as candidates, and LiveGame filters
    // in-field/bench itself.
    const allSquad = [
      ...((squadPlayers ?? []) as Player[]),
      ...fillInsForLive,
    ];
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
    const loanMins = seasonLoanMinutes((allTeamEvents ?? []) as GameEvent[]);
    const seasonAvail = seasonAvailability((allTeamEvents ?? []) as GameEvent[]);

    return (
      <div className="space-y-3">
        <GameInfoHeader teamName={teamName} g={g} compact />
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
          seasonAvailability={seasonAvail}
          seasonLoanMinutes={loanMins}
          zoneCaps={zoneCaps}
          positionModel={positionModel}
          currentOnFieldSize={g.on_field_size}
          minOnFieldSize={ageCfgSport.minOnFieldSize}
          maxOnFieldSize={ageCfgSport.maxOnFieldSize}
          defaultOnFieldSize={ageCfgSport.defaultOnFieldSize}
          chipModeByKey={teamChipModes}
          exitHref={`/teams/${params.teamId}/games/${params.gameId}`}
          songUrl={songUrl}
          songStartSeconds={songStartSeconds}
          songDurationSeconds={songDurationSeconds}
          quarterMs={quarterMs}
        />
        {isAdmin && (
          <div className="border-t border-hairline pt-4">
            <ResetGameButton
              auth={{ kind: "team", teamId: params.teamId }}
              gameId={params.gameId}
            />
          </div>
        )}
      </div>
    );
  }

  // Pre-kick-off: build picker data.
  const [
    { data: avail },
    { data: players },
    { data: teamGames },
    { data: fillInRows },
  ] = await Promise.all([
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
    supabase
      .from("game_fill_ins")
      .select("*")
      .eq("game_id", params.gameId)
      .order("created_at"),
  ]);

  const fillInsForPicker = ((fillInRows ?? []) as FillIn[]).map((f) =>
    fillInToPlayer(f, params.teamId)
  );
  const allActive = [
    ...((players ?? []) as Player[]),
    ...fillInsForPicker,
  ];
  // Fill-ins are implicitly available: game_availability.player_id has
  // an FK to public.players(id) which fill-ins deliberately don't
  // appear in, so the row addFillIn tries to upsert there is silently
  // rejected (23503). Treating fill-ins as "always available" matches
  // the intent — a coach only adds someone to game_fill_ins because
  // they showed up on the day.
  const availableIds = new Set((avail ?? []).map((a) => a.player_id));
  for (const f of fillInsForPicker) availableIds.add(f.id);
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

  // Pre-game saved lineup. Picker pre-populates from this if present;
  // null/missing falls back to the fairness suggester.
  const { data: draftRow } = await supabase
    .from("game_lineup_drafts")
    .select("*")
    .eq("game_id", params.gameId)
    .maybeSingle();
  const initialDraft = draftRow as import("@/lib/types").LineupDraft | null;

  return (
    <div className="space-y-4">
      {availablePlayers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-hairline bg-surface-alt px-4 py-6 text-center text-sm text-ink-mute">
          No players marked available — go back and set availability first.
        </p>
      ) : (
        <LineupPicker
          auth={{ kind: "team", teamId: params.teamId }}
          gameId={params.gameId}
          players={availablePlayers}
          season={season}
          defaultOnFieldSize={ageCfg.defaultOnFieldSize}
          minOnFieldSize={ageCfg.minOnFieldSize}
          maxOnFieldSize={ageCfg.maxOnFieldSize}
          positionModel={positionModel}
          gameMinutes={(ageCfg.quarterSeconds * 4) / 60}
          backHref={`/teams/${params.teamId}/games/${params.gameId}`}
          initialDraft={initialDraft}
          chipModeByKey={teamChipModes}
        />
      )}
    </div>
  );
}
