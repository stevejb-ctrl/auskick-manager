import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { bucketFillIns, replayGame } from "@/lib/dashboard/eventReplay";
import { FILL_IN_STATS_ID, type Player, type Sport } from "@/lib/types";
import {
  deriveSeasons,
  filterBySeason,
  computePlayerStats,
  computeWinningCombinations,
  topCombosPerZone,
  computePlayerChemistry,
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
import { netballSport, getEffectiveQuarterSeconds } from "@/lib/sports";
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
        combosByZone={{}}
        chemistryPairs={[]}
        positionFit={[]}
        headToHead={[]}
        quarterScoring={[]}
        attendance={[]}
        totalGames={0}
        hasZoneData={false}
        hasScoringData={false}
        hasAvailabilityData={false}
      />
    );
  }

  const selectedYear = searchParams.season
    ? parseInt(searchParams.season, 10)
    : seasons[0].year;

  const seasonGames = filterBySeason(allGames, selectedYear).filter(
    (g) => g.status === "completed"
  );

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
      const gameIds = seasonGames.map((g) => g.id);
      const { data: eventsRaw } = await supabase
        .from("game_events")
        .select("*")
        .in("game_id", gameIds)
        .order("created_at");
      const events = (eventsRaw ?? []) as GameEvent[];
      const byGame = new Map<string, GameEvent[]>();
      for (const ev of events) {
        const arr = byGame.get(ev.game_id) ?? [];
        arr.push(ev);
        byGame.set(ev.game_id, arr);
      }
      snapshots = seasonGames.map((g) => {
        const evs = byGame.get(g.id) ?? [];
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

  // Fetch events for all completed season games (one query)
  let snapshots: GameSnapshot[] = [];
  const fillInIds = new Set<string>();
  if (seasonGames.length > 0) {
    const gameIds = seasonGames.map((g) => g.id);
    const [{ data: eventsRaw }, { data: fillInRaw }] = await Promise.all([
      supabase
        .from("game_events")
        .select("*")
        .in("game_id", gameIds)
        .order("created_at"),
      supabase.from("game_fill_ins").select("id").in("game_id", gameIds),
    ]);

    for (const f of fillInRaw ?? []) fillInIds.add(f.id);

    if (eventsRaw && eventsRaw.length > 0) {
      // Group by game_id
      const byGame = new Map<string, typeof eventsRaw>();
      for (const ev of eventsRaw) {
        const arr = byGame.get(ev.game_id) ?? [];
        arr.push(ev);
        byGame.set(ev.game_id, arr);
      }
      snapshots = Array.from(byGame.entries()).map(([gid, evs]) =>
        bucketFillIns(replayGame(gid, evs), fillInIds)
      );
    }
  }

  // Derive data availability flags
  const hasZoneData =
    snapshots.some((s) => Object.keys(s.playerZoneMs).length > 0);
  const hasScoringData = snapshots.some(
    (s) =>
      Object.keys(s.teamScoreByQtr).length > 0 ||
      Object.keys(s.oppScoreByQtr).length > 0
  );
  const hasAvailabilityData = availability.some((a) =>
    seasonGames.some((g) => g.id === a.game_id)
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
  const combos = computeWinningCombinations(snapshots);
  const combosByZone = topCombosPerZone(combos);
  const chemistryPairs = computePlayerChemistry(snapshots);
  const positionFit = computePositionFit(snapshots);
  const headToHead = computeHeadToHead(seasonGames, snapshots);
  const quarterScoring = computeQuarterScoring(snapshots);
  const attendanceRows = computeAttendance(
    players,
    seasonGames,
    (availability ?? []) as import("@/lib/types").GameAvailability[]
  );

  return (
    <DashboardShell
      seasons={seasons}
      selectedYear={selectedYear}
      playerNames={playerNames}
      playerStats={playerStats}
      combosByZone={combosByZone}
      chemistryPairs={chemistryPairs}
      positionFit={positionFit}
      headToHead={headToHead}
      quarterScoring={quarterScoring}
      attendance={attendanceRows}
      totalGames={seasonGames.length}
      hasZoneData={hasZoneData}
      hasScoringData={hasScoringData}
      hasAvailabilityData={hasAvailabilityData}
    />
  );
}
