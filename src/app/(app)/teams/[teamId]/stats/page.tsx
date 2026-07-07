import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { bucketFillIns, replayGame } from "@/lib/dashboard/eventReplay";
import { FILL_IN_STATS_ID, type Player, type Sport } from "@/lib/types";
import {
  deriveSeasons,
  filterBySeason,
  computePlayerStats,
  computePositionFit,
  computeHeadToHead,
  computeQuarterScoring,
  computeAttendance,
} from "@/lib/dashboard/aggregators";
import {
  replayNetballGameForStats,
  computeNetballPlayerStats,
  computeNetballChemistry,
  computeNetballHeadToHead,
  computeNetballAttendance,
} from "@/lib/dashboard/netballAggregators";
import type { GameSnapshot, Season } from "@/lib/dashboard/types";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { NetballDashboardShell } from "@/components/dashboard/NetballDashboardShell";
import { LeagueDashboardShell } from "@/components/dashboard/LeagueDashboardShell";
import { aggregateLeagueSeasonFromGames } from "@/lib/dashboard/leagueAggregators";
import { netballSport, getEffectiveQuarterSeconds, getAgeGroupConfig } from "@/lib/sports";
import type { GameEvent } from "@/lib/types";

interface StatsPageProps {
  params: { teamId: string };
  searchParams: { season?: string };
}

export default async function StatsPage({ params, searchParams }: StatsPageProps) {
  const supabase = createClient();

  // Verify team exists + user has access (layout already guards this, but be explicit)
  const { data: team } = await supabase
    .from("teams")
    .select("id, name, sport, track_scoring, age_group, quarter_length_seconds")
    .eq("id", params.teamId)
    .single();

  if (!team) notFound();
  const sport: Sport = (team as { sport?: Sport } | null)?.sport ?? "afl";

  // Fetch players, all games, availability in parallel
  const [{ data: playersRaw }, { data: gamesRaw }, { data: availabilityRaw }] =
    await Promise.all([
      supabase
        .from("players")
        .select("*")
        .eq("team_id", params.teamId)
        .order("jersey_number"),
      supabase
        .from("games")
        .select("*")
        .eq("team_id", params.teamId)
        .order("scheduled_at"),
      supabase
        .from("game_availability")
        .select("game_id, player_id, status")
        .eq("status", "available"),
    ]);

  const players = playersRaw ?? [];
  const allGames = gamesRaw ?? [];
  const availability = availabilityRaw ?? [];

  // Derive seasons from all games (not just completed)
  const seasons: Season[] = deriveSeasons(allGames);

  if (seasons.length === 0) {
    return (
      <DashboardShell
        seasons={[]}
        selectedYear={0}
        playerNames={{}}
        playerStats={[]}
        positionFit={[]}
        headToHead={[]}
        quarterScoring={[]}
        attendance={[]}
        totalGames={0}
        hasZoneData={false}
        hasScoringData={false}
      />
    );
  }

  const selectedYear = searchParams.season
    ? parseInt(searchParams.season, 10)
    : seasons[0].year;

  // Two filters running together: status="completed" weeds out
  // upcoming / in-progress games, AND we require a `game_finalised`
  // event in the event log. The event check is the canonical
  // "this game was truly played to the siren and the coach hit
  // Finalise" signal — robust against any case where status got
  // out of sync (e.g. a failed reset that wiped events but didn't
  // flip status, or a stale write). Steve 2026-05-13: restarted
  // games were showing up in stats; this is the belt-and-braces
  // fix.
  const candidateGames = filterBySeason(allGames, selectedYear).filter(
    (g) => g.status === "completed"
  );
  // Pull events for ALL candidates up front so we can both verify
  // finalisation AND build the per-game snapshots below without a
  // second query.
  const candidateIds = candidateGames.map((g) => g.id);
  const { data: eventsRaw } = candidateIds.length > 0
    ? await supabase
        .from("game_events")
        .select("*")
        .in("game_id", candidateIds)
        .order("created_at")
    : { data: [] as GameEvent[] };
  const eventsArr = (eventsRaw ?? []) as GameEvent[];
  const finalisedGameIds = new Set<string>();
  for (const ev of eventsArr) {
    if (ev.type === "game_finalised") finalisedGameIds.add(ev.game_id);
  }
  const seasonGames = candidateGames.filter((g) => finalisedGameIds.has(g.id));
  const eventsByGame = new Map<string, GameEvent[]>();
  for (const ev of eventsArr) {
    if (!finalisedGameIds.has(ev.game_id)) continue;
    const arr = eventsByGame.get(ev.game_id) ?? [];
    arr.push(ev);
    eventsByGame.set(ev.game_id, arr);
  }

  // ─── Rugby league branch ──────────────────────────────────
  // Junior RL stats are shaped by the laws: tries (4) + conversions
  // (2), FR/DH vest history, kickoff rotation, and §6 unbroken-
  // period compliance. The shared aggregator pipes through the
  // same replay engines the live UI uses so live ↔ post-game
  // numbers stay consistent.
  if (sport === "rugby_league") {
    const eventsByGameRecord: Record<string, GameEvent[]> = {};
    eventsByGame.forEach((evs, gid) => {
      eventsByGameRecord[gid] = evs;
    });
    const aggregate = aggregateLeagueSeasonFromGames(
      seasonGames,
      eventsByGameRecord,
      sport,
      team.age_group,
    );
    const playerNames: Record<string, string> = Object.fromEntries(
      players.map((p) => [p.id, p.full_name]),
    );
    return (
      <LeagueDashboardShell
        seasons={seasons}
        selectedYear={selectedYear}
        playerNames={playerNames}
        aggregate={aggregate}
        totalGames={seasonGames.length}
      />
    );
  }

  // ─── Netball branch ───────────────────────────────────────
  // Netball runs its own stats pipeline — different scoring (goals
  // only, no behinds), different time buckets (three thirds, not
  // five zones), and the AFL aggregators are zone-shaped from the
  // ground up. We branch early so none of the AFL code below
  // accidentally runs on netball events.
  if (sport === "netball") {
    const ageCfg =
      netballSport.ageGroups.find((a) => a.id === team.age_group) ??
      netballSport.ageGroups.find((a) => a.id === "open")!;
    let snapshots: ReturnType<typeof replayNetballGameForStats>[] = [];
    if (seasonGames.length > 0) {
      snapshots = seasonGames.map((g) => {
        const evs = eventsByGame.get(g.id) ?? [];
        const qSec = getEffectiveQuarterSeconds(
          { quarter_length_seconds: team.quarter_length_seconds ?? null },
          ageCfg,
          { quarter_length_seconds: g.quarter_length_seconds },
        );
        return replayNetballGameForStats(g.id, evs, qSec);
      });
    }
    const playerStats = computeNetballPlayerStats(players, snapshots);
    const chemistry = computeNetballChemistry(snapshots);
    const headToHead = computeNetballHeadToHead(seasonGames, snapshots);
    const attendanceRows = computeNetballAttendance(
      players,
      seasonGames,
      (availability ?? []) as import("@/lib/types").GameAvailability[],
    );
    const playerNames: Record<string, string> = Object.fromEntries(
      players.map((p) => [p.id, p.full_name]),
    );
    const hasPlayData = playerStats.some((s) => s.totalMs > 0);
    const hasScoringData = snapshots.some(
      (s) =>
        Object.keys(s.teamGoalsByQtr).length > 0 ||
        Object.keys(s.oppGoalsByQtr).length > 0,
    );
    const hasAvailabilityData = availability.some((a) =>
      seasonGames.some((g) => g.id === a.game_id),
    );
    return (
      <NetballDashboardShell
        seasons={seasons}
        selectedYear={selectedYear}
        playerNames={playerNames}
        playerStats={playerStats}
        chemistry={chemistry}
        headToHead={headToHead}
        attendance={attendanceRows}
        totalGames={seasonGames.length}
        hasPlayData={hasPlayData}
        hasScoringData={hasScoringData}
        hasAvailabilityData={hasAvailabilityData}
      />
    );
  }

  // Build snapshots from the pre-fetched, finalisation-filtered
  // events. fill_ins still need their own query (separate table).
  let snapshots: GameSnapshot[] = [];
  const fillInIds = new Set<string>();
  if (seasonGames.length > 0) {
    const gameIds = seasonGames.map((g) => g.id);
    const { data: fillInRaw } = await supabase
      .from("game_fill_ins")
      .select("id")
      .in("game_id", gameIds);
    for (const f of fillInRaw ?? []) fillInIds.add(f.id);

    // Nominal quarter length per game — clamps a runaway clock so a
    // quarter left running past the hooter can't inflate minutes /
    // AVG/G. Resolves game override → team default → age default.
    const aflAgeCfg = getAgeGroupConfig("afl", team.age_group);
    const gameById = new Map(seasonGames.map((g) => [g.id, g]));
    snapshots = Array.from(eventsByGame.entries()).map(([gid, evs]) => {
      const g = gameById.get(gid);
      const quarterSec = getEffectiveQuarterSeconds(
        { quarter_length_seconds: team.quarter_length_seconds ?? null },
        aflAgeCfg,
        { quarter_length_seconds: g?.quarter_length_seconds ?? null },
      );
      return bucketFillIns(replayGame(gid, evs, quarterSec * 1000), fillInIds);
    });
  }

  // Derive data availability flags
  const hasZoneData =
    snapshots.some((s) => Object.keys(s.playerZoneMs).length > 0);
  const hasScoringData = snapshots.some(
    (s) =>
      Object.keys(s.teamScoreByQtr).length > 0 ||
      Object.keys(s.oppScoreByQtr).length > 0
  );

  // Build player name lookup — add a synthetic entry for the fill-in bucket
  // so downstream rows render as "Fill-In" rather than a bare UUID.
  const playerNames: Record<string, string> = Object.fromEntries(
    players.map((p) => [p.id, p.full_name])
  );
  if (fillInIds.size > 0) playerNames[FILL_IN_STATS_ID] = "Fill-In";

  // Synthetic Fill-In player so computePlayerStats finds a name/jersey for
  // the bucketed id. is_active=false keeps it out of attendance %.
  const playersWithFillIn = fillInIds.size > 0
    ? [
        ...players,
        {
          id: FILL_IN_STATS_ID,
          team_id: params.teamId,
          full_name: "Fill-In",
          jersey_number: 0,
          is_active: false,
          created_by: "",
          created_at: "",
          updated_at: "",
        } satisfies Player,
      ]
    : players;

  // Compute all sections
  const playerStats = computePlayerStats(playersWithFillIn, snapshots, seasonGames);
  const positionFit = computePositionFit(snapshots);
  const headToHead = computeHeadToHead(seasonGames, snapshots);
  const quarterScoring = computeQuarterScoring(snapshots);
  const attendanceRows = computeAttendance(
    players,
    seasonGames,
    (availability ?? []) as import("@/lib/types").GameAvailability[],
    snapshots
  );

  return (
    <DashboardShell
      seasons={seasons}
      selectedYear={selectedYear}
      playerNames={playerNames}
      playerStats={playerStats}
      positionFit={positionFit}
      headToHead={headToHead}
      quarterScoring={quarterScoring}
      attendance={attendanceRows}
      totalGames={seasonGames.length}
      hasZoneData={hasZoneData}
      hasScoringData={hasScoringData}
    />
  );
}
