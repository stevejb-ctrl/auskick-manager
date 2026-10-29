import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { bucketFillIns, replayGame } from "@/lib/dashboard/eventReplay";
import { FILL_IN_STATS_ID, type Player, type Sport } from "@/lib/types";
import {
  defaultSeasonYear,
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
import { leagueStatsColumns } from "@/lib/dashboard/leagueStatsColumns";
import { rugbyScoreWords } from "@/lib/sports/rugby_league/fairness";
import { aflBranch, netballSport, getEffectiveQuarterSeconds, getAgeGroupConfig, isBasketball, isRugby, isSoccer, isTouch, teamSport, periodLabels } from "@/lib/sports";
import { SoccerDashboardShell } from "@/components/dashboard/SoccerDashboardShell";
import { BasketballDashboardShell } from "@/components/dashboard/BasketballDashboardShell";
import { aggregateBasketballSeason } from "@/lib/dashboard/basketballAggregators";
import { basketballAgeGroupForTeam } from "@/lib/sports/basketball";
import { TouchDashboardShell } from "@/components/dashboard/TouchDashboardShell";
import { aggregateTouchSeason } from "@/lib/dashboard/touchAggregators";
import { touchAgeGroupForTeam } from "@/lib/sports/touch/family";
import { teamMixedRule } from "@/lib/sports/touch/mixed";
import { aggregateSoccerSeason } from "@/lib/dashboard/soccerAggregators";
import { soccerFamilyAgeGroupForTeam } from "@/lib/sports/soccer/family";
import type { GameEvent } from "@/lib/types";
import { distinctFullNames } from "@/lib/names";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoresKept } from "@/lib/results";
import {
  playedScoreOf,
  withPlayedHeadToHead,
  withPlayedNetballHeadToHead,
  withPlayedTotals,
  type PlayedResult,
} from "@/lib/games/playedScore";
import { loadTeamPlaybook } from "@/lib/playbook/load";
import { loadRollup } from "@/lib/playbook/rollupStore";
import { seasonFromRollup } from "@/lib/playbook/rollup";
import { gridUnits, seasonBalanceGrid } from "@/lib/playbook/seasonGrid";
import type { SeasonBalanceSectionProps } from "@/components/dashboard/SeasonBalanceGrid";

interface StatsPageProps {
  params: { teamId: string };
  searchParams: { season?: string; balance?: string };
}

// A game that's on (or sitting at full time, not finished) isn't in the
// stats until it's finished. Say so, with the way back to it: a coach
// whose game never finished saw "0 completed games" and "No data yet"
// with no hint why (usability pass, 26 Oct 2026).
export default async function StatsPage(props: StatsPageProps) {
  const supabase = createClient();
  const { data: unfinished } = await supabase
    .from("games")
    .select("id, opponent")
    .eq("team_id", props.params.teamId)
    .eq("status", "in_progress")
    .order("scheduled_at");
  const games = (unfinished ?? []) as { id: string; opponent: string }[];
  if (games.length === 0) return <StatsBody {...props} />;
  return (
    <div className="space-y-4">
      <div role="status" data-testid="stats-unfinished-games" className="rounded-md border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
        <p>
          {games.length === 1
            ? "A game isn't finished yet, so it isn't in these stats. Finish it at full time to count its minutes."
            : `${games.length} games aren't finished yet, so they aren't in these stats. Finish each at full time to count their minutes.`}
        </p>
        <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          {games.map((g) => (
            <li key={g.id}>
              <Link href={`/teams/${props.params.teamId}/games/${g.id}/live`} className="font-semibold underline underline-offset-2">
                Open the game against {g.opponent}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <StatsBody {...props} />
    </div>
  );
}

async function StatsBody({ params, searchParams }: StatsPageProps) {
  const supabase = createClient();

  // Verify team exists + user has access (layout already guards this, but be explicit)
  const { data: team } = await supabase
    .from("teams")
    .select("id, name, sport, track_scoring, age_group, quarter_length_seconds, period_count, track_fouls, mixed_max_boys, mixed_min_girls, mixed_min_boys")
    .eq("id", params.teamId)
    .single();

  if (!team) notFound();
  const sport: Sport = teamSport((team as { sport?: Sport } | null)?.sport);

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

  // Two kids with the same name read "Ava Smith #3" / "#12" (or (1) / (2))
  // in every table and the chat text (round 3 edge testing, 24 Oct 2026).
  const fullNames = distinctFullNames(playersRaw ?? []);
  const players = (playersRaw ?? []).map((p) => ({ ...p, full_name: fullNames.get(p.id) ?? p.full_name }));
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

  // The season just played, not the newest with any fixture.
  const selectedYear = searchParams.season
    ? parseInt(searchParams.season, 10)
    : (defaultSeasonYear(allGames) ?? seasons[0].year);

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
  // Games marked played with their final score (no events, so no replay):
  // they count as played games and results, never as minutes or scorers
  // (lib/games/playedScore, migration 0076).
  const gamesWithEvents = new Set(eventsArr.map((ev) => ev.game_id));
  const playedResults: PlayedResult[] = candidateGames.flatMap((g) => {
    const score = gamesWithEvents.has(g.id) ? null : playedScoreOf(g);
    return score ? [{ opponent: g.opponent as string, score }] : [];
  });
  const playedScores = playedResults.map((p) => p.score);
  const totalGames = seasonGames.length + playedResults.length;
  const withPlayedAggregate = <A extends { totals: { games: number; wins: number; draws: number; losses: number } }>(
    aggregate: A,
    forKey: Extract<keyof A["totals"], string>,
    againstKey: Extract<keyof A["totals"], string>,
  ): A => ({ ...aggregate, totals: withPlayedTotals(aggregate.totals, forKey, againstKey, playedScores) });
  const eventsByGame = new Map<string, GameEvent[]>();
  for (const ev of eventsArr) {
    if (!finalisedGameIds.has(ev.game_id)) continue;
    const arr = eventsByGame.get(ev.game_id) ?? [];
    arr.push(ev);
    eventsByGame.set(ev.game_id, arr);
  }

  // Which games kept score: each game's own record, not the switch today.
  // A game played with scoring off counts as played, never as a result
  // (UX round 3, 24 Oct 2026: Head-to-head counted one as a draw).
  const keptIds = new Set(
    seasonGames
      .filter((g) => scoresKept(sport, g, team.track_scoring ?? false, eventsByGame.get(g.id) ?? []))
      .map((g) => g.id),
  );
  const keptScore = (gameId: string) => keptIds.has(gameId);

  // ─── Season balance (UX plan 4.4 / 4.5) ───────────────────
  // Players × units from the per-game rollup (backfilled here for games
  // finalised before it existed), in the unit the team's strategy
  // balances; "Since reset" when the coach has reset season balance.
  const { resolved: playbook } = await loadTeamPlaybook(supabase, params.teamId, sport, team.age_group);
  // Basketball plays the team's halves or quarters, as does hockey; a
  // soccer-family team's age group is its own sport's; touch and Oztag
  // play halves or one period.
  const teamPeriodCount = (team as { period_count?: number | null }).period_count ?? null;
  const balanceAgeCfg = isBasketball(sport)
    ? basketballAgeGroupForTeam(team.age_group, teamPeriodCount)
    : isSoccer(sport)
      ? soccerFamilyAgeGroupForTeam(sport, team.age_group, teamPeriodCount)
      : isTouch(sport)
        ? touchAgeGroupForTeam(sport, team.age_group, teamPeriodCount)
      : getAgeGroupConfig(sport, team.age_group);
  const seasonGameById = new Map(seasonGames.map((g) => [g.id, g]));
  const periodSecondsOf = (gameId: string) =>
    getEffectiveQuarterSeconds(
      { quarter_length_seconds: team.quarter_length_seconds ?? null },
      balanceAgeCfg,
      { quarter_length_seconds: seasonGameById.get(gameId)?.quarter_length_seconds ?? null },
    );
  const rollupRows = await loadRollup(
    supabase,
    createAdminClient(),
    sport,
    params.teamId,
    eventsByGame,
    periodSecondsOf,
  );
  const balanceSince = playbook.seasonBalanceSince;
  const useSince = searchParams.balance === "since" && !!balanceSince;
  const { unit: gridUnit, columns: gridColumns } = gridUnits(sport, playbook.strategy.balanceUnit, playbook.positions);
  const seasonBalance: SeasonBalanceSectionProps = {
    grid: seasonBalanceGrid({
      time: seasonFromRollup(rollupRows, gridUnit, useSince ? balanceSince : null),
      players: players.map((p) => ({ id: p.id, name: p.full_name })),
      columns: gridColumns,
      periodMs:
        getEffectiveQuarterSeconds(
          { quarter_length_seconds: team.quarter_length_seconds ?? null },
          balanceAgeCfg,
        ) * 1000,
    }),
    periodWord: periodLabels(sport, balanceAgeCfg).label,
    reset: balanceSince
      ? {
          since: useSince,
          sinceLabel: new Date(balanceSince).toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
          wholeHref: `?season=${selectedYear}`,
          sinceHref: `?season=${selectedYear}&balance=since`,
        }
      : undefined,
  };

  // ─── Football (soccer) branch ─────────────────────────────
  // Goals, the result (when scoring is on), minutes and time in goal,
  // through soccer's own replay.
  if (isSoccer(sport)) {
    return (
      <SoccerDashboardShell
        seasons={seasons}
        selectedYear={selectedYear}
        playerNames={Object.fromEntries(players.map((p) => [p.id, p.full_name]))}
        aggregate={withPlayedAggregate(aggregateSoccerSeason(seasonGames, eventsByGame, keptScore), "goalsFor", "goalsAgainst")}
        totalGames={totalGames}
        trackScoring={keptIds.size > 0 || playedResults.length > 0}
        withKeeper={soccerFamilyAgeGroupForTeam(sport, team.age_group, teamPeriodCount).keeper !== "none"}
        seasonBalance={playbook.strategy.balanceUnit ? seasonBalance : undefined}
      />
    );
  }

  // ─── Basketball branch ────────────────────────────────────
  // Points, the result (when scoring is on), minutes, guard and forward
  // time, and fouls, through basketball's own replay.
  if (isBasketball(sport)) {
    const ageB = basketballAgeGroupForTeam(team.age_group, (team as { period_count?: number | null }).period_count ?? null);
    return (
      <BasketballDashboardShell
        seasons={seasons}
        selectedYear={selectedYear}
        playerNames={Object.fromEntries(players.map((p) => [p.id, p.full_name]))}
        aggregate={withPlayedAggregate(aggregateBasketballSeason(seasonGames, eventsByGame, keptScore), "pointsFor", "pointsAgainst")}
        totalGames={totalGames}
        trackScoring={keptIds.size > 0 || playedResults.length > 0}
        trackFouls={(team as { track_fouls?: boolean | null }).track_fouls ?? ageB.tracksFoulsDefault}
        withLines={playbook.strategy.id !== "minutes"}
        seasonBalance={playbook.strategy.balanceUnit ? seasonBalance : undefined}
      />
    );
  }

  // ─── Touch and Oztag branch ───────────────────────────────
  // Tries, the result (when scoring is on), minutes and time in each
  // lane, through the touch family's own replay. A mixed team says its
  // boys and girls are evened separately.
  if (isTouch(sport)) {
    return (
      <TouchDashboardShell
        seasons={seasons}
        selectedYear={selectedYear}
        playerNames={Object.fromEntries(players.map((p) => [p.id, p.full_name]))}
        aggregate={withPlayedAggregate(aggregateTouchSeason(seasonGames, eventsByGame, keptScore), "pointsFor", "pointsAgainst")}
        totalGames={totalGames}
        trackScoring={keptIds.size > 0 || playedResults.length > 0}
        withLanes={playbook.strategy.id !== "minutes"}
        mixed={teamMixedRule(team as { mixed_max_boys?: number | null; mixed_min_girls?: number | null; mixed_min_boys?: number | null }) !== null}
        seasonBalance={playbook.strategy.balanceUnit ? seasonBalance : undefined}
      />
    );
  }

  // ─── Rugby league branch ──────────────────────────────────
  // Junior RL stats are shaped by the laws: tries (4) + conversions
  // (2), FR/DH vest history, kickoff rotation, and §6 unbroken-
  // period compliance. U13+ (international laws) adds penalty and
  // field goals and drops the junior laws. The shared aggregator
  // pipes through the same replay engines the live UI uses so
  // live ↔ post-game numbers stay consistent.
  if (isRugby(sport)) {
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
        aggregate={{
          ...aggregate,
          // Played games: a game and its points; their tries weren't kept.
          totals: {
            ...aggregate.totals,
            games: aggregate.totals.games + playedResults.length,
            points: aggregate.totals.points + playedScores.reduce((s, p) => s + p.us, 0),
            opponentPoints: aggregate.totals.opponentPoints + playedScores.reduce((s, p) => s + p.them, 0),
          },
        }}
        totalGames={totalGames}
        seasonBalance={seasonBalance}
        columns={leagueStatsColumns(balanceAgeCfg)}
        words={rugbyScoreWords(sport)}
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
    const headToHead = withPlayedNetballHeadToHead(computeNetballHeadToHead(seasonGames, snapshots, keptScore), playedResults);
    const attendanceRows = computeNetballAttendance(
      players,
      seasonGames,
      (availability ?? []) as import("@/lib/types").GameAvailability[],
      snapshots,
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
        totalGames={totalGames}
        hasPlayData={hasPlayData}
        // Netball's only use of it: whether Head-to-head has results.
        hasScoringData={hasScoringData || playedResults.length > 0}
        hasAvailabilityData={hasAvailabilityData || hasPlayData}
        seasonBalance={seasonBalance}
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
    const aflAgeCfg = getAgeGroupConfig(aflBranch(sport), team.age_group);
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
  const headToHead = withPlayedHeadToHead(computeHeadToHead(seasonGames, snapshots, keptScore), playedResults);
  const quarterScoring = computeQuarterScoring(snapshots.filter((s) => keptScore(s.gameId)));
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
      totalGames={totalGames}
      hasZoneData={hasZoneData}
      hasScoringData={hasScoringData}
      seasonBalance={seasonBalance}
    />
  );
}
