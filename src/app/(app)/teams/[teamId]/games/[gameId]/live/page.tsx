import { notFound, redirect } from "next/navigation";
import { createClient, getUser, getMembership } from "@/lib/supabase/server";
import { AFL_SCORE_TYPES, standingScores } from "@/lib/live/undoStack";
import { getSeasonEvents } from "@/lib/season";
import { loadTeamPlaybook } from "@/lib/playbook/load";
import { roleModelFor, rolesFromPrefs } from "@/lib/playbook/roles";
import { withThirdsToday } from "@/lib/playbook/dayLines";
import { replayLocks } from "@/lib/live/locks";
import type { RoleSheetConfig } from "@/components/playbook/useRoleSheet";
import { aflPlaybookInput, withBalanceSeason, withSnapshot } from "@/lib/sports/afl/engine";
import { netballPlaybookInput, withNetballSnapshot } from "@/lib/sports/netball/engine";
import { leaguePlaybookInput } from "@/lib/sports/rugby_league/engine";
import { seasonBalanceWeight, withKickoffSnapshot } from "@/lib/playbook/seasonBalance";
import { seasonTimeByUnit } from "@/lib/playbook/seasonTime";
import { LineupPicker } from "@/components/live/LineupPicker";
import { LiveGame } from "@/components/live/LiveGame";
import { NetballLiveGame } from "@/components/netball/NetballLiveGame";
import { LeagueLiveGame } from "@/components/league/LeagueLiveGame";
import { LeagueLineupPicker } from "@/components/league/LeagueLineupPicker";
import { SoccerLiveGame } from "@/components/soccer/SoccerLiveGame";
import { SoccerLineupPicker } from "@/components/soccer/SoccerLineupPicker";
import type { SoccerLineup } from "@/lib/sports/soccer/lineup";
import type { SoccerSeasonBalance } from "@/lib/sports/soccer/suggest";
import { soccerFamilyAgeGroupForTeam } from "@/lib/sports/soccer/family";
import { soccerHowWePlay } from "@/lib/sports/soccer/playbook";
import { BasketballLiveGame } from "@/components/basketball/BasketballLiveGame";
import { BasketballLineupPicker } from "@/components/basketball/BasketballLineupPicker";
import type { BasketballLineup } from "@/lib/sports/basketball/lineup";
import type { BasketballSeasonBalance } from "@/lib/sports/basketball/suggest";
import { basketballAgeGroupForTeam } from "@/lib/sports/basketball";
import { basketballHowWePlay } from "@/lib/sports/basketball/playbook";
import { TouchLiveGame } from "@/components/touch/TouchLiveGame";
import { TouchLineupPicker } from "@/components/touch/TouchLineupPicker";
import type { TouchLineup } from "@/lib/sports/touch/lineup";
import type { TouchSeasonBalance } from "@/lib/sports/touch/suggest";
import { touchAgeGroupForTeam } from "@/lib/sports/touch/family";
import { touchHowWePlay } from "@/lib/sports/touch/familyPlaybook";
import { girlsTryCountsDouble, teamMixedRule } from "@/lib/sports/touch/mixed";
import { AflWalkthroughOffer, LeagueWalkthroughOffer } from "@/components/live/WalkthroughOffer";
import { LiveTopBar } from "@/components/live/LiveTopBar";
import { ParentScoreboard } from "@/components/live/ParentScoreboard";
import { GameDayAvailabilityPanel } from "@/components/games/GameDayAvailabilityPanel";
import { activeOrInGameFilter } from "@/lib/live/presentPlayers";
import { teamOnFieldSize } from "@/lib/games/newGameDefaults";
import {
  replayGame,
  seasonZoneMinutes,
  seasonLoanMinutes,
  seasonAvailability,
  zoneCapsFor,
} from "@/lib/fairness";
import { aflBranch, aflPositionModel, getAgeGroupConfig, getEffectiveQuarterSeconds, getSportConfig, isBasketball, isRugby, isSoccer, isTouch, netballSport, teamSport, periodLabels } from "@/lib/sports";
import { replayNetballGame } from "@/lib/sports/netball/fairness";
import { replayRugbyGame, rugbyPoints } from "@/lib/sports/rugby_league/fairness";
import { normalizeChipMode } from "@/lib/chips";
import type { FillIn, Game, GameEvent, LeagueLineup, MixedGroup, Player, Sport } from "@/lib/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { teamSportById } from "@/lib/sports/teamSportById";
import { LiveSync } from "@/components/live/LiveSync";
import { readLiveSyncStamp } from "@/lib/live/liveSyncStamp";
import { backfillNetballCourt, filterLineupToAvailable, inSquadOrder } from "@/lib/live/lineupDraft";

/**
 * A fill-in player is stored in `game_fill_ins` but needs to look like a
 * normal Player to the live UI (same id shape, same lookups). This projects
 * one into that shape. Their ids stay unique UUIDs so game_events can
 * reference them directly.
 */
/** The lineup's player role sheet: coaches only, and only when How we play has roles. */
function coachRoleSheet(
  isAdmin: boolean,
  resolved: Parameters<typeof roleModelFor>[0],
  prefs: Parameters<typeof rolesFromPrefs>[0],
): RoleSheetConfig | undefined {
  if (!isAdmin) return undefined;
  const model = roleModelFor(resolved);
  return model ? { model, roles: rolesFromPrefs(prefs, model.unit) } : undefined;
}

function fillInToPlayer(f: FillIn, teamId: string): Player {
  return {
    id: f.id,
    team_id: teamId,
    full_name: f.full_name,
    jersey_number: f.jersey_number,
    // Touch and Oztag mixed teams: who a fill-in counts as (0071).
    mixed_group: f.mixed_group ?? null,
    is_active: true,
    created_by: f.created_by ?? "",
    created_at: f.created_at,
    updated_at: f.created_at,
  };
}

/**
 * When and where the game is, and the squad kids not here, for the Game
 * plan's copied text, as the game page's plan says them (UX round 2,
 * 24 Oct 2026: parents had to ask).
 */
function gamePlanDetails(g: Game, squad: Player[], availableIds: Set<string> | string[]) {
  const here = new Set(availableIds);
  return {
    scheduledAt: g.scheduled_at,
    venue: g.location,
    out: squad.filter((p) => !here.has(p.id)).map((p) => p.full_name.trim().split(/\s+/)[0]),
  };
}

interface LivePageProps {
  params: { teamId: string; gameId: string };
}

// The coach's page keeps in step with the other phone on the game (a
// parent's game-day link, a co-manager): LiveSync. The game's stamp is
// read before the page's own data, so a write landing in between makes
// the next check refresh rather than be missed.
export default async function LivePage(props: LivePageProps) {
  const stamp = await readLiveSyncStamp(createClient(), props.params.gameId);
  const body = await LivePageBody(props);
  return (
    <>
      <LiveSync stamp={stamp} syncUrl={`/teams/${props.params.teamId}/games/${props.params.gameId}/live/sync`} />
      {body}
    </>
  );
}

async function LivePageBody({ params }: LivePageProps) {
  const supabase = createClient();

  const {
    data: { user },
  } = await getUser();
  if (!user) redirect("/login");

  // Cached: any server action invoked from this page that calls
  // getMembership(teamId, user.id) in the same request will hit
  // this result instead of round-tripping again.
  const membership = await getMembership(params.teamId, user.id);

  const isAdmin = membership?.role === "admin";
  const canRun = isAdmin || membership?.role === "game_manager";

  const [{ data: game }, { data: teamRow }, { data: thisGameEvents }] = await Promise.all([
    supabase
      .from("games")
      .select("*")
      .eq("id", params.gameId)
      .eq("team_id", params.teamId)
      .single(),
    supabase
      .from("teams")
      .select("name, sport, track_scoring, track_zone_time, age_group, quarter_length_seconds, on_field_size, period_count, track_fouls, mixed_max_boys, mixed_min_girls, mixed_min_boys, girls_try_double, allow_mid_quarter_subs, song_url, song_start_seconds, song_duration_seconds, song_enabled, chip_a_label, chip_b_label, chip_c_label, chip_a_mode, chip_b_mode, chip_c_mode")
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
  // The squad for this game: the active kids, and any kid its events name
  // (deactivated mid-game, they stay on: UX round 3, 24 Oct 2026).
  const squadFilter = activeOrInGameFilter((thisGameEvents ?? []) as GameEvent[]);
  const teamName = teamRow?.name ?? "Team";
  const sport: Sport = teamRow ? teamSport(teamRow.sport) : ((await teamSportById(params.teamId)) ?? notFound());
  // track_scoring is sport-agnostic — both AFL and netball flows
  // honour it. Hoisted ABOVE the netball branch (was nested inside
  // the AFL branch) so plan 04-04's NetballLiveGame can consume it.
  // NETBALL-04 / NETBALL-07: this single source flows through to
  // the +G button gate, GS/GA scoring confirm gate, undo chip
  // gate, score-bug numeric gate, walkthrough scoring-step gate,
  // and the summary-card result+goals-line gate.
  const trackScoring = teamRow?.track_scoring ?? false;

  // Parents follow the game read-only: a self-refreshing scoreboard,
  // not the old "only coaches and managers" dead end (UX plan §6).
  if (!canRun) {
    // A soccer-family team plays its own halves or quarters (hockey).
    const parentAgeCfg = isSoccer(sport)
      ? soccerFamilyAgeGroupForTeam(
          sport,
          teamRow?.age_group ?? null,
          (teamRow as { period_count?: number | null } | null)?.period_count ?? null,
        )
      : getAgeGroupConfig(sport, teamRow?.age_group ?? null);
    const periodLabel = (parentAgeCfg.periodLabel ?? "quarter") as "quarter" | "half" | "period";
    return (
      <div className="space-y-4">
        <LiveTopBar exitHref={`/teams/${params.teamId}/games/${params.gameId}`} game={g} />
        <ParentScoreboard
          sport={sport}
          teamName={teamName}
          opponent={g.opponent}
          events={(thisGameEvents ?? []) as GameEvent[]}
          trackScoring={trackScoring}
          periodLabel={periodLabel}
        />
      </div>
    );
  }
  // Netball-only: opt-in mid-quarter subs. Default false so existing
  // teams keep the break-only sub behaviour they've always had.
  // AFL ignores this — AFL has its own interchange flow.
  //
  // Steve 2026-05-17: now supports a per-game override on
  // `games.allow_mid_quarter_subs` (migration 0036). Resolution
  // order: game override → team default → false. Coaches flip the
  // per-game value via a toggle in the netball pre-game Game
  // settings collapse; the team-level toggle on the settings page
  // remains as the team-wide default.
  const teamAllowMidQuarterSubs =
    (teamRow as { allow_mid_quarter_subs?: boolean | null } | null)
      ?.allow_mid_quarter_subs ?? false;
  const gameAllowMidQuarterSubs =
    (g as { allow_mid_quarter_subs?: boolean | null }).allow_mid_quarter_subs ??
    null;
  const allowMidQuarterSubs =
    gameAllowMidQuarterSubs ?? teamAllowMidQuarterSubs;

  // Per-chip mode (split / group). Both branches below use this:
  // hasStarted → LiveGame (mid-game suggester via QuarterBreak),
  // !hasStarted → LineupPicker (pre-game suggester). The netball
  // branch below also threads it through `<NetballLiveGame>` so
  // chip placement applies to netball rotations too (Steve
  // 2026-05-16 AFL parity).
  // Chip modes — normalised through `normalizeChipMode` so any
  // unknown value (stale client write, future enum extension)
  // collapses to "split" rather than corrupting the column or
  // breaking the type. Includes the new zone-preference modes
  // (forward / centre / back) introduced for the RL F/B chip
  // letter overlay; RL teams only ever pick forward / back from
  // the picker, centre is AFL-only and inert for RL. Steve
  // 2026-05-20.
  const teamChipModes = {
    a: normalizeChipMode(
      (teamRow as { chip_a_mode?: string | null } | null)?.chip_a_mode,
    ),
    b: normalizeChipMode(
      (teamRow as { chip_b_mode?: string | null } | null)?.chip_b_mode,
    ),
    c: normalizeChipMode(
      (teamRow as { chip_c_mode?: string | null } | null)?.chip_c_mode,
    ),
  };
  // Chip labels — RL uses these to title the Forwards / Backs cards
  // in the lineup picker. AFL + netball just pass them through to
  // CohortChipsSettings (already wired in settings/page.tsx).
  const teamChipLabels = {
    a: (teamRow as { chip_a_label?: string | null } | null)?.chip_a_label ?? null,
    b: (teamRow as { chip_b_label?: string | null } | null)?.chip_b_label ?? null,
    c: (teamRow as { chip_c_label?: string | null } | null)?.chip_c_label ?? null,
  };
  // Team hype song — same lift-up rationale as teamChipModes
  // (Steve 2026-05-16). Was below the netball branch and only
  // threaded to AFL <LiveGame>; netball coaches who configured a
  // song got the row stored but never heard it. NetballLiveGame
  // now consumes these via the shared `useHypeSong` hook.
  const songEnabledTop = teamRow?.song_enabled ?? true;
  const songUrlTop = songEnabledTop ? (teamRow?.song_url ?? null) : null;
  const songStartSecondsTop = teamRow?.song_start_seconds ?? 0;
  const songDurationSecondsTop = teamRow?.song_duration_seconds ?? 15;

  // ─── Soccer family branch ─────────────────────────────────
  // Football (soccer), futsal and hockey (.planning/SOCCER-PLAN.md,
  // FOUR-SPORTS-PLAN.md): a keeper slot and lines, rolling subs or
  // windows, halves (or hockey's quarters), goals, each sport in its own
  // words. Before kick-off the lineup picker; after it the live game.
  // None of the other sports' helpers below run for these games.
  if (isSoccer(sport)) {
    // The team's own age group, in its halves or quarters (hockey).
    const ageCfgS = soccerFamilyAgeGroupForTeam(
      sport,
      teamRow?.age_group ?? null,
      (teamRow as { period_count?: number | null } | null)?.period_count ?? null,
    );
    const periodSecondsS = getEffectiveQuarterSeconds(
      {
        quarter_length_seconds:
          (teamRow as { quarter_length_seconds?: number | null } | null)?.quarter_length_seconds ?? null,
      },
      ageCfgS,
      { quarter_length_seconds: g.quarter_length_seconds },
    );
    const [{ data: avail }, { data: players }, { data: fillInRows }] = await Promise.all([
      supabase.from("game_availability").select("player_id, status").eq("game_id", params.gameId).eq("status", "available").order("player_id"),
      supabase.from("players").select("*").eq("team_id", params.teamId).or(squadFilter).order("jersey_number").order("full_name").order("id"),
      supabase.from("game_fill_ins").select("*").eq("game_id", params.gameId).order("created_at"),
    ]);
    const fillIns = ((fillInRows ?? []) as FillIn[]).map((f) => fillInToPlayer(f, params.teamId));
    const squad = [...((players ?? []) as Player[]), ...fillIns];
    const events = (thisGameEvents ?? []) as GameEvent[];
    // Here today: availability rows, fill-ins, and late arrivals.
    const availableIds = new Set<string>([
      ...(avail ?? []).map((a) => a.player_id),
      ...fillIns.map((f) => f.id),
      ...events.filter((e) => e.type === "player_arrived" && e.player_id).map((e) => e.player_id as string),
    ]);
    const availablePlayers = squad.filter((p) => availableIds.has(p.id));
    // How we play: the keeper strategy, keen keepers and kids who'd
    // rather not go in goal, and season balance (a game under way plays
    // what it kicked off with).
    const howWePlay = soccerHowWePlay(
      await loadTeamPlaybook(supabase, params.teamId, sport, teamRow?.age_group ?? null),
      sport,
      ageCfgS.id,
      g.playbook_snapshot,
    );
    // Season time per line and in goal (this game left out) feeds the
    // suggestions: the keeper by season keeper minutes, lines by debt.
    const seasonEvents = (await getSeasonEvents(params.teamId)).filter((e) => e.game_id !== params.gameId);
    const season: SoccerSeasonBalance = {
      time: seasonTimeByUnit(sport, seasonEvents as GameEvent[], "line", { since: howWePlay.since }),
      weight: howWePlay.balance === "off" ? 0 : seasonBalanceWeight(sport, howWePlay.balance),
      periodMs: periodSecondsS * 1000,
    };
    // Lent minutes in the season's other games, for the long-press sheet.
    const seasonLoanMinsS = seasonLoanMinutes(seasonEvents as GameEvent[]);

    if (!events.some((e) => e.type === "lineup_set")) {
      const { data: draftRow } = await supabase
        .from("game_lineup_drafts")
        .select("lineup, updated_at")
        .eq("game_id", params.gameId)
        .maybeSingle();
      const initialDraft = draftRow
        ? {
            lineup: (draftRow as { lineup: unknown }).lineup as SoccerLineup,
            updated_at: (draftRow as { updated_at: string }).updated_at,
          }
        : null;
      // Kids lent before kick-off (the latest loan event per kid wins).
      const lent = new Map<string, { ts: string; loaned: boolean }>();
      for (const ev of events) {
        if (ev.type !== "player_loan" || !ev.player_id) continue;
        const loaned = (ev.metadata as { loaned?: boolean } | null)?.loaned ?? true;
        const cur = lent.get(ev.player_id);
        if (!cur || cur.ts < ev.created_at) lent.set(ev.player_id, { ts: ev.created_at, loaned });
      }
      const initialLoanedIds = Array.from(lent.entries())
        .filter(([, v]) => v.loaned)
        .map(([id]) => id);
      const soccerAvailabilityPanel = (
        <GameDayAvailabilityPanel
          auth={{ kind: "team", teamId: params.teamId }}
          teamId={params.teamId}
          gameId={params.gameId}
          squad={(players ?? []) as Player[]}
          availableIds={availableIds}
          fillInCount={fillIns.length}
          canManageMatch
          showJerseyNumber={getSportConfig(sport).jerseyNumbers}
        />
      );
      return (
        <div className="space-y-4">
          <LiveTopBar exitHref={`/teams/${params.teamId}/games/${params.gameId}`} game={g} />
          {availablePlayers.length === 0 ? (
            <>
              {soccerAvailabilityPanel}
              <EmptyState title="Mark who's here to build the lineup." />
            </>
          ) : (
            <SoccerLineupPicker
              // Suggest again when who's here changes.
              key={Array.from(availableIds).sort().join(",")}
              auth={{ kind: "team", teamId: params.teamId }}
              sport={sport}
              gameId={params.gameId}
              players={availablePlayers}
              ageGroup={ageCfgS}
              onFieldSize={g.on_field_size}
              defaultSubMinutes={g.sub_interval_seconds / 60}
              season={season}
              keeperStrategy={howWePlay.keeperStrategy}
              keeperPrefs={howWePlay.prefs}
              seasonLoanMinutes={seasonLoanMinsS}
              initialDraft={initialDraft}
              initialLoanedIds={initialLoanedIds}
              availabilityPanel={soccerAvailabilityPanel}
            />
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <SoccerLiveGame
          auth={{ kind: "team", teamId: params.teamId }}
          sport={sport}
          game={g}
          teamName={teamName}
          squad={squad}
          ageGroup={ageCfgS}
          periodSeconds={periodSecondsS}
          subIntervalSeconds={g.sub_interval_seconds}
          clockMultiplier={g.clock_multiplier ?? 1}
          trackScoring={trackScoring}
          events={events}
          season={season}
          keeperStrategy={howWePlay.keeperStrategy}
          keeperPrefs={howWePlay.prefs}
          seasonLoanMinutes={seasonLoanMinsS}
          isAdmin={isAdmin}
          exitHref={`/teams/${params.teamId}/games/${params.gameId}`}
        />
      </div>
    );
  }

  // ─── Basketball branch ────────────────────────────────────
  // Basketball's own family (.planning/BASKETBALL-PLAN.md): five on
  // court, optional positions (How we play's rotation), rolling subs at
  // a dead ball, halves or quarters, 1/2/3-point baskets, fouls. Before
  // tip-off the lineup picker; after it the live game. None of the other
  // sports' helpers below run for a basketball game.
  if (isBasketball(sport)) {
    const teamExtras = teamRow as { quarter_length_seconds?: number | null; period_count?: number | null; track_fouls?: boolean | null } | null;
    const ageCfgB = basketballAgeGroupForTeam(teamRow?.age_group ?? null, teamExtras?.period_count ?? null);
    const periodSecondsB = getEffectiveQuarterSeconds(
      { quarter_length_seconds: teamExtras?.quarter_length_seconds ?? null },
      ageCfgB,
      { quarter_length_seconds: g.quarter_length_seconds },
    );
    const trackFouls = teamExtras?.track_fouls ?? ageCfgB.tracksFoulsDefault;
    const [{ data: avail }, { data: players }, { data: fillInRows }] = await Promise.all([
      supabase.from("game_availability").select("player_id, status").eq("game_id", params.gameId).eq("status", "available").order("player_id"),
      supabase.from("players").select("*").eq("team_id", params.teamId).or(squadFilter).order("jersey_number").order("full_name").order("id"),
      supabase.from("game_fill_ins").select("*").eq("game_id", params.gameId).order("created_at"),
    ]);
    const fillIns = ((fillInRows ?? []) as FillIn[]).map((f) => fillInToPlayer(f, params.teamId));
    const squad = [...((players ?? []) as Player[]), ...fillIns];
    const events = (thisGameEvents ?? []) as GameEvent[];
    // Here today: availability rows, fill-ins, and late arrivals.
    const availableIds = new Set<string>([
      ...(avail ?? []).map((a) => a.player_id),
      ...fillIns.map((f) => f.id),
      ...events.filter((e) => e.type === "player_arrived" && e.player_id).map((e) => e.player_id as string),
    ]);
    const availablePlayers = squad.filter((p) => availableIds.has(p.id));
    // How we play: the rotation, home lines and positions, ball
    // handlers, and season balance (a game under way plays what it
    // tipped off with).
    const howWePlay = basketballHowWePlay(
      await loadTeamPlaybook(supabase, params.teamId, sport, teamRow?.age_group ?? null),
      ageCfgB.id,
      g.playbook_snapshot,
    );
    // Season time per line, or per position under the position
    // strategies (this game left out), feeds the suggestions.
    const seasonEvents = (await getSeasonEvents(params.teamId)).filter((e) => e.game_id !== params.gameId);
    const seasonUnit = howWePlay.strategy === "position-by-position" || howWePlay.strategy === "set-positions" ? "position" : "line";
    const season: BasketballSeasonBalance = {
      time: seasonTimeByUnit(sport, seasonEvents as GameEvent[], seasonUnit, { since: howWePlay.since }),
      weight: howWePlay.balance === "off" ? 0 : seasonBalanceWeight(sport, howWePlay.balance),
      periodMs: periodSecondsB * 1000,
    };
    // Lent minutes in the season's other games, for the long-press sheet.
    const seasonLoanMinsB = seasonLoanMinutes(seasonEvents as GameEvent[]);

    if (!events.some((e) => e.type === "lineup_set")) {
      const { data: draftRow } = await supabase
        .from("game_lineup_drafts")
        .select("lineup, updated_at")
        .eq("game_id", params.gameId)
        .maybeSingle();
      const initialDraft = draftRow
        ? {
            lineup: (draftRow as { lineup: unknown }).lineup as BasketballLineup,
            updated_at: (draftRow as { updated_at: string }).updated_at,
          }
        : null;
      // Kids lent before tip-off (the latest loan event per kid wins).
      const lent = new Map<string, { ts: string; loaned: boolean }>();
      for (const ev of events) {
        if (ev.type !== "player_loan" || !ev.player_id) continue;
        const loaned = (ev.metadata as { loaned?: boolean } | null)?.loaned ?? true;
        const cur = lent.get(ev.player_id);
        if (!cur || cur.ts < ev.created_at) lent.set(ev.player_id, { ts: ev.created_at, loaned });
      }
      const initialLoanedIds = Array.from(lent.entries())
        .filter(([, v]) => v.loaned)
        .map(([id]) => id);
      const basketballAvailabilityPanel = (
        <GameDayAvailabilityPanel
          auth={{ kind: "team", teamId: params.teamId }}
          teamId={params.teamId}
          gameId={params.gameId}
          squad={(players ?? []) as Player[]}
          availableIds={availableIds}
          fillInCount={fillIns.length}
          canManageMatch
          showJerseyNumber={getSportConfig(sport).jerseyNumbers}
        />
      );
      return (
        <div className="space-y-4">
          <LiveTopBar exitHref={`/teams/${params.teamId}/games/${params.gameId}`} game={g} />
          {availablePlayers.length === 0 ? (
            <>
              {basketballAvailabilityPanel}
              <EmptyState title="Mark who's here to build the lineup." />
            </>
          ) : (
            <BasketballLineupPicker
              // Suggest again when who's here changes.
              key={Array.from(availableIds).sort().join(",")}
              auth={{ kind: "team", teamId: params.teamId }}
              gameId={params.gameId}
              players={availablePlayers}
              ageGroup={ageCfgB}
              onCourtSize={g.on_field_size}
              defaultSubMinutes={g.sub_interval_seconds / 60}
              strategy={howWePlay.strategy}
              prefs={howWePlay.prefs}
              season={season}
              seasonLoanMinutes={seasonLoanMinsB}
              initialDraft={initialDraft}
              initialLoanedIds={initialLoanedIds}
              availabilityPanel={basketballAvailabilityPanel}
            />
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <BasketballLiveGame
          auth={{ kind: "team", teamId: params.teamId }}
          game={g}
          teamName={teamName}
          squad={squad}
          ageGroup={ageCfgB}
          periodSeconds={periodSecondsB}
          subIntervalSeconds={g.sub_interval_seconds}
          clockMultiplier={g.clock_multiplier ?? 1}
          trackScoring={trackScoring}
          trackFouls={trackFouls}
          threePointers={ageCfgB.threePointers}
          events={events}
          strategy={howWePlay.strategy}
          prefs={howWePlay.prefs}
          season={season}
          seasonLoanMinutes={seasonLoanMinsB}
          isAdmin={isAdmin}
          exitHref={`/teams/${params.teamId}/games/${params.gameId}`}
        />
      </div>
    );
  }

  // ─── Touch and Oztag branch ───────────────────────────────
  // The touch family (.planning/FOUR-SPORTS-PLAN.md): lanes or none (How
  // we play's rotation), unlimited rolling subs, halves or one period,
  // tries, and a mixed team's boys' cap. Before the start the lineup
  // picker; after it the live game. None of the other sports' helpers
  // below run for a touch or Oztag game.
  if (isTouch(sport)) {
    const teamExtras = teamRow as {
      quarter_length_seconds?: number | null;
      period_count?: number | null;
      mixed_max_boys?: number | null;
      mixed_min_girls?: number | null;
      mixed_min_boys?: number | null;
      girls_try_double?: boolean | null;
    } | null;
    const ageCfgT = touchAgeGroupForTeam(sport, teamRow?.age_group ?? null, teamExtras?.period_count ?? null);
    const periodSecondsT = getEffectiveQuarterSeconds(
      { quarter_length_seconds: teamExtras?.quarter_length_seconds ?? null },
      ageCfgT,
      { quarter_length_seconds: g.quarter_length_seconds },
    );
    const mixedRule = teamMixedRule(teamExtras);
    const girlsTryDouble = girlsTryCountsDouble(ageCfgT, mixedRule, teamExtras?.girls_try_double);
    const [{ data: avail }, { data: players }, { data: fillInRows }] = await Promise.all([
      supabase.from("game_availability").select("player_id, status").eq("game_id", params.gameId).eq("status", "available").order("player_id"),
      supabase.from("players").select("*").eq("team_id", params.teamId).or(squadFilter).order("jersey_number").order("full_name").order("id"),
      supabase.from("game_fill_ins").select("*").eq("game_id", params.gameId).order("created_at"),
    ]);
    const fillIns = ((fillInRows ?? []) as FillIn[]).map((f) => fillInToPlayer(f, params.teamId));
    const squad = [...((players ?? []) as Player[]), ...fillIns];
    const events = (thisGameEvents ?? []) as GameEvent[];
    // Who each kid counts as under a mixed team's rule (squad and fill-ins).
    const groups: Record<string, MixedGroup | null> = mixedRule
      ? Object.fromEntries(squad.map((p) => [p.id, p.mixed_group ?? null]))
      : {};
    // Here today: availability rows, fill-ins, and late arrivals.
    const availableIds = new Set<string>([
      ...(avail ?? []).map((a) => a.player_id),
      ...fillIns.map((f) => f.id),
      ...events.filter((e) => e.type === "player_arrived" && e.player_id).map((e) => e.player_id as string),
    ]);
    const availablePlayers = squad.filter((p) => availableIds.has(p.id));
    // How we play: the rotation, home lanes, and season balance (a game
    // under way plays what it started with).
    const howWePlay = touchHowWePlay(
      sport,
      await loadTeamPlaybook(supabase, params.teamId, sport, teamRow?.age_group ?? null),
      ageCfgT.id,
      g.playbook_snapshot,
    );
    // Season time per lane (this game left out) feeds the suggestions.
    const seasonEvents = (await getSeasonEvents(params.teamId)).filter((e) => e.game_id !== params.gameId);
    const season: TouchSeasonBalance = {
      time: seasonTimeByUnit(sport, seasonEvents as GameEvent[], "line", { since: howWePlay.since }),
      weight: howWePlay.balance === "off" ? 0 : seasonBalanceWeight(sport, howWePlay.balance),
      periodMs: periodSecondsT * 1000,
    };
    // Lent minutes in the season's other games, for the long-press sheet.
    const seasonLoanMinsT = seasonLoanMinutes(seasonEvents as GameEvent[]);

    if (!events.some((e) => e.type === "lineup_set")) {
      const { data: draftRow } = await supabase
        .from("game_lineup_drafts")
        .select("lineup, updated_at")
        .eq("game_id", params.gameId)
        .maybeSingle();
      const initialDraft = draftRow
        ? {
            lineup: (draftRow as { lineup: unknown }).lineup as TouchLineup,
            updated_at: (draftRow as { updated_at: string }).updated_at,
          }
        : null;
      // Kids lent before the start (the latest loan event per kid wins).
      const lent = new Map<string, { ts: string; loaned: boolean }>();
      for (const ev of events) {
        if (ev.type !== "player_loan" || !ev.player_id) continue;
        const loaned = (ev.metadata as { loaned?: boolean } | null)?.loaned ?? true;
        const cur = lent.get(ev.player_id);
        if (!cur || cur.ts < ev.created_at) lent.set(ev.player_id, { ts: ev.created_at, loaned });
      }
      const initialLoanedIds = Array.from(lent.entries())
        .filter(([, v]) => v.loaned)
        .map(([id]) => id);
      const touchAvailabilityPanel = (
        <GameDayAvailabilityPanel
          auth={{ kind: "team", teamId: params.teamId }}
          teamId={params.teamId}
          gameId={params.gameId}
          squad={(players ?? []) as Player[]}
          availableIds={availableIds}
          fillInCount={fillIns.length}
          canManageMatch
          showJerseyNumber={getSportConfig(sport).jerseyNumbers}
        />
      );
      return (
        <div className="space-y-4">
          <LiveTopBar exitHref={`/teams/${params.teamId}/games/${params.gameId}`} game={g} />
          {availablePlayers.length === 0 ? (
            <>
              {touchAvailabilityPanel}
              <EmptyState title="Mark who's here to build the lineup." />
            </>
          ) : (
            <TouchLineupPicker
              // Suggest again when who's here changes.
              key={Array.from(availableIds).sort().join(",")}
              auth={{ kind: "team", teamId: params.teamId }}
              sport={sport}
              gameId={params.gameId}
              players={availablePlayers}
              ageGroup={ageCfgT}
              onFieldSize={g.on_field_size}
              defaultSubMinutes={g.sub_interval_seconds / 60}
              strategy={howWePlay.strategy}
              prefs={howWePlay.prefs}
              season={season}
              mixedRule={mixedRule}
              initialGroups={groups}
              initialDraft={initialDraft}
              initialLoanedIds={initialLoanedIds}
              availabilityPanel={touchAvailabilityPanel}
              seasonLoanMinutes={seasonLoanMinsT}
            />
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <TouchLiveGame
          auth={{ kind: "team", teamId: params.teamId }}
          sport={sport}
          game={g}
          teamName={teamName}
          squad={squad}
          ageGroup={ageCfgT}
          periodSeconds={periodSecondsT}
          subIntervalSeconds={g.sub_interval_seconds}
          clockMultiplier={g.clock_multiplier ?? 1}
          trackScoring={trackScoring}
          girlsTryDouble={girlsTryDouble}
          mixedRule={mixedRule}
          mixedGroups={groups}
          events={events}
          strategy={howWePlay.strategy}
          prefs={howWePlay.prefs}
          season={season}
          isAdmin={isAdmin}
          exitHref={`/teams/${params.teamId}/games/${params.gameId}`}
          seasonLoanMinutes={seasonLoanMinsT}
        />
      </div>
    );
  }

  // ─── Rugby league branch ──────────────────────────────────
  // Junior rugby league uses rolling subs (like AFL) but is
  // positionless, scores tries (4) + conversions (2), and rotates
  // vests + kickers across periods (those rules live in Phases
  // 4-5; Phase 3 ships the core flow without them). The branch
  // forks here so none of the AFL zone-minutes / netball position-
  // count helpers below run for an RL game.
  if (isRugby(sport)) {
    const rugbyCfg = getSportConfig(sport);
    const ageCfgL =
      rugbyCfg.ageGroups.find((a) => a.id === teamRow?.age_group)
        ?? rugbyCfg.ageGroups.find((a) => a.id === "U10")!;
    const periodSeconds = getEffectiveQuarterSeconds(
      {
        quarter_length_seconds:
          (teamRow as { quarter_length_seconds?: number | null } | null)?.quarter_length_seconds ?? null,
      },
      ageCfgL,
      { quarter_length_seconds: g.quarter_length_seconds },
    );
    // "Track forward/back time": game → team → false. New games have a
    // null override so they inherit the team's setting (Steve
    // 2026-05-26: only game.track_zone_time was read, so they never did).
    const leagueTrackZoneTime =
      (g as { track_zone_time?: boolean | null }).track_zone_time ??
      (teamRow as { track_zone_time?: boolean | null } | null)?.track_zone_time ??
      false;

    const [
      { data: avail },
      { data: players },
      { data: fillInRows },
    ] = await Promise.all([
      supabase
        .from("game_availability")
        .select("player_id, status")
        .eq("game_id", params.gameId)
        .eq("status", "available")
        .order("player_id"),
      supabase
        .from("players")
        .select("*")
        .eq("team_id", params.teamId)
        .or(squadFilter)
        .order("jersey_number").order("full_name").order("id"),
      supabase
        .from("game_fill_ins")
        .select("*")
        .eq("game_id", params.gameId)
        .order("created_at"),
    ]);

    const fillInsForLive = ((fillInRows ?? []) as FillIn[]).map((f) =>
      fillInToPlayer(f, params.teamId),
    );
    const squad = [...((players ?? []) as Player[]), ...fillInsForLive];

    // Available IDs union: explicit availability rows + fill-ins
    // (always available) + late-arrival events (always available).
    const lateArrivedFromEvents = ((thisGameEvents ?? []) as GameEvent[])
      .filter((e) => e.type === "player_arrived" && e.player_id)
      .map((e) => e.player_id as string);
    const availableIds = new Set<string>([
      ...(avail ?? []).map((a) => a.player_id),
      ...fillInsForLive.map((f) => f.id),
      ...lateArrivedFromEvents,
    ]);
    const availablePlayers = squad.filter((p) => availableIds.has(p.id));

    const replay = replayRugbyGame((thisGameEvents ?? []) as GameEvent[], rugbyPoints(sport));
    const hasStarted = replay.lineup !== null;

    // Season events (this-game-excluded) — drives the lineup-picker's
    // fairness suggester AND the live KickoffPicker's per-player
    // kickoff-count badges. Lifted out of the !hasStarted branch
    // (Steve 2026-05-19) so the live surface gets the same season
    // history view as the pre-kickoff picker.
    const allLeagueSeasonEvents = await getSeasonEvents(params.teamId);
    const leagueSeasonEvents = allLeagueSeasonEvents.filter(
      (e) => e.game_id !== params.gameId,
    );
    // How we play for the league suggester (UX plan 5.6): lines from
    // roles and season balance, the vest strategy, keep-on.
    const lg = await loadTeamPlaybook(supabase, params.teamId, sport, teamRow?.age_group ?? null);
    const lgAge = getAgeGroupConfig(sport, teamRow?.age_group ?? null);
    const lgPeriodSeconds = getEffectiveQuarterSeconds(
      { quarter_length_seconds: (teamRow as { quarter_length_seconds?: number | null } | null)?.quarter_length_seconds ?? null },
      lgAge,
      { quarter_length_seconds: g.quarter_length_seconds },
    );
    // A game in progress plays what it kicked off with (as AFL and netball).
    const leaguePlaybook = withKickoffSnapshot(
      sport,
      leaguePlaybookInput(
        lg.resolved,
        lg.prefs,
        lg.rules,
        seasonTimeByUnit(sport, leagueSeasonEvents as GameEvent[], "line", {
          since: lg.resolved.seasonBalanceSince,
        }),
        lgPeriodSeconds * 1000,
        lg.vestStrategy,
        seasonTimeByUnit(sport, leagueSeasonEvents as GameEvent[], "position", {
          since: lg.resolved.seasonBalanceSince,
        }),
      ),
      g.playbook_snapshot,
    );

    if (!hasStarted) {
      // Pre-kickoff: load saved draft (if any) and use the season
      // events fetched above to drive the picker's fairness ranking.
      // Empty season → jersey-number fallback.
      const { data: draftRow } = await supabase
        .from("game_lineup_drafts")
        .select("lineup, updated_at")
        .eq("game_id", params.gameId)
        .maybeSingle();
      // B1 / AVAIL-01 (UX half): strip now-unavailable players from the
      // saved draft so they visibly drop off the picker. Server-side
      // reconciliation in startLeagueGame is the authoritative backstop.
      const initialDraft = draftRow
        ? {
            lineup: filterLineupToAvailable(
              (draftRow as { lineup: unknown }).lineup as LeagueLineup,
              availableIds,
            ),
            updated_at: (draftRow as { updated_at: string }).updated_at,
          }
        : null;

      // Pre-game lent-player set — walk this game's player_loan
      // events, latest-per-player wins. Mirrors the AFL pre-kickoff
      // pattern (line 679 of this file). Coaches who flag a loan
      // before kickoff and reload land back on the same chip set.
      const leagueLoanedIds: string[] = (() => {
        const latest = new Map<string, { ts: string; loaned: boolean }>();
        for (const ev of (thisGameEvents ?? []) as GameEvent[]) {
          if (ev.type !== "player_loan" || !ev.player_id) continue;
          const meta = (ev.metadata ?? {}) as { loaned?: boolean };
          const loaned = meta.loaned ?? true;
          const cur = latest.get(ev.player_id);
          if (!cur || cur.ts < ev.created_at) {
            latest.set(ev.player_id, { ts: ev.created_at, loaned });
          }
        }
        const out: string[] = [];
        latest.forEach((v, id) => {
          if (v.loaned) out.push(id);
        });
        return out;
      })();

      const leagueAvailabilityPanel = (
        <GameDayAvailabilityPanel
          auth={{ kind: "team", teamId: params.teamId }}
          teamId={params.teamId}
          gameId={params.gameId}
          squad={(players ?? []) as Player[]}
          availableIds={availableIds}
          fillInCount={fillInsForLive.length}
          canManageMatch
          showJerseyNumber={rugbyCfg.jerseyNumbers}
        />
      );

      return (
        <div className="space-y-4">
          <LiveTopBar
            exitHref={`/teams/${params.teamId}/games/${params.gameId}`}
            game={g}
          />
          {availablePlayers.length === 0 ? (
            <>
              {leagueAvailabilityPanel}
              <EmptyState title="Mark who's here to build the lineup." />
            </>
          ) : (
            // Pre-game lineup picker — rugby pitch + bench strip
            // + LockModal long-press menu. Spike promoted to
            // default (Steve 2026-05-19, see LeagueLineupPicker.tsx
            // header for the interaction model).
            <LeagueLineupPicker
              sport={sport}
              // Rebuild the suggestion when who's-here changes.
              key={Array.from(availableIds).sort().join(",")}
              availabilityPanel={leagueAvailabilityPanel}
              auth={{ kind: "team", teamId: params.teamId }}
              gameId={params.gameId}
              players={availablePlayers}
              ageGroup={ageCfgL}
              // The game's own size, as AFL's and every picker's.
              defaultOnFieldSize={g.on_field_size}
              minOnFieldSize={ageCfgL.minOnFieldSize}
              maxOnFieldSize={ageCfgL.maxOnFieldSize}
              defaultSubMinutes={g.sub_interval_seconds / 60}
              gamePlan={{
                sport,
                ageGroup: ageCfgL,
                players: availablePlayers,
                onFieldSize: g.on_field_size,
                periodMinutes: lgPeriodSeconds / 60,
                subIntervalSeconds: g.sub_interval_seconds,
                teamName,
                opponentName: g.opponent,
                details: gamePlanDetails(g, (players ?? []) as Player[], availableIds),
                seasonEvents: leagueSeasonEvents as GameEvent[],
                chipModeByKey: teamChipModes,
                leaguePlaybook,
              }}
              seasonEvents={leagueSeasonEvents as GameEvent[]}
              initialLoanedIds={leagueLoanedIds}
              initialDraft={initialDraft}
              walkthroughOffer={
                <LeagueWalkthroughOffer
                  sport={sport}
                  trackScoring={trackScoring}
                  periodLabel={periodLabels(sport, ageCfgL).label}
                  vests={{ fr: ageCfgL.vestRequirements?.fr ?? false, dh: ageCfgL.vestRequirements?.dh ?? false }}
                  kickingAllowed={ageCfgL.kickingAllowed === true}
                  goalsFromPlay={ageCfgL.goalsFromPlay === true}
                  kickRotations={ageCfgL.kickRotations === true}
                  unbrokenPeriods={ageCfgL.unbrokenPeriods === true}
                  trackZoneTime={leagueTrackZoneTime}
                />
              }
              chipLabels={{
                a: teamChipLabels.a,
                b: teamChipLabels.b,
              }}
              chipModes={teamChipModes}
              leaguePlaybook={leaguePlaybook}
              roleSheet={coachRoleSheet(isAdmin, lg.resolved, lg.prefs)}
            />
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <LeagueLiveGame
          auth={{ kind: "team", teamId: params.teamId }}
          sport={sport}
          game={g}
          teamName={teamName}
          squad={squad}
          ageGroup={ageCfgL}
          periodSeconds={periodSeconds}
          subIntervalSeconds={g.sub_interval_seconds}
          clockMultiplier={g.clock_multiplier ?? 1}
          trackScoring={trackScoring}
          trackZoneTime={leagueTrackZoneTime}
          state={replay}
          thisGameEvents={(thisGameEvents ?? []) as GameEvent[]}
          seasonEvents={leagueSeasonEvents as GameEvent[]}
          chipModes={teamChipModes}
          leaguePlaybook={leaguePlaybook}
          isAdmin={isAdmin}
          exitHref={`/teams/${params.teamId}/games/${params.gameId}`}
        />
      </div>
    );
  }

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
        .eq("status", "available")
        .order("player_id"),
      supabase
        .from("players")
        .select("*")
        .eq("team_id", params.teamId)
        .or(squadFilter)
        .order("jersey_number").order("full_name").order("id"),
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
        ...inSquadOrder((avail ?? []).map((a) => a.player_id), squad),
        ...fillInsForLive.map((f) => f.id),
        ...lateArrivedFromEvents,
      ]),
    );

    // Season events cached for 300s + tag-invalidated by event
    // writes (perf phase 5). Filter out the current game — its
    // events are already in thisGameEvents above.
    const allTeamEvents = await getSeasonEvents(params.teamId);
    const seasonEvents = allTeamEvents.filter(
      (e) => e.game_id !== params.gameId,
    );

    const state = replayNetballGame((thisGameEvents ?? []) as GameEvent[]);

    // How we play for the netball suggester (UX plan Phase 5): style,
    // roles, rules and season balance by third or bib (since a reset).
    const nb = await loadTeamPlaybook(supabase, params.teamId, "netball", teamRow?.age_group ?? null);
    const nbUnit = nb.resolved.strategy.balanceUnit === "third" ? "third" : "bib";
    const netballPlaybook = withThirdsToday(
      withNetballSnapshot(
        netballPlaybookInput(
          nb.resolved,
          nb.prefs,
          nb.rules,
          seasonTimeByUnit("netball", seasonEvents as GameEvent[], nbUnit, {
            since: nb.resolved.seasonBalanceSince,
            periodSeconds: quarterLengthSeconds,
          }),
          quarterLengthSeconds * 1000,
        ),
        g.playbook_snapshot,
      ),
      seasonEvents as GameEvent[],
      (thisGameEvents ?? []) as GameEvent[],
      quarterLengthSeconds,
    );

    // Pre-game lineup draft (netball) — saved by Save plan & exit
    // from inside NetballLineupPicker. Cleared at kickoff by
    // startNetballGame. Steve 2026-05-13 sport-parity fix —
    // mirrors the AFL pre-kickoff branch's draftRow read.
    const { data: netballDraftRow } = await supabase
      .from("game_lineup_drafts")
      .select("lineup, updated_at")
      .eq("game_id", params.gameId)
      .maybeSingle();
    // B1 / AVAIL-01 (UX half): strip now-unavailable players from the
    // saved netball draft (recursing through the nested `positions`
    // map) so they visibly drop off the court when the picker loads.
    // startNetballGame's reconciliation is the authoritative backstop.
    //
    // Netball needs one extra step the flat-zone sports (AFL/league)
    // don't: a vacated court position is a *named empty slot*, and
    // `validateNetballLineup` blocks kickoff while a targeted position
    // is empty. So after stripping the unavailable player we backfill
    // the now-open targeted court slots from the available bench (the
    // "normal rotation fills the vacated spot" rule from D-04, applied
    // to netball's named-position model). Without this the coach is
    // stuck at "Need 7 on court — 1 position is empty" with no way to
    // start. Filling here keeps the auto-remove SILENT (no prompt) and
    // the lineup startable; the coach can still rearrange before kickoff.
    const netballDraft = netballDraftRow
      ? {
          lineup: backfillNetballCourt(
            filterLineupToAvailable(
              (netballDraftRow as { lineup: unknown }).lineup as import("@/lib/sports/netball/fairness").GenericLineup,
              availableIds,
            ),
            ageCfgN.positions,
            availableIds,
          ),
          updated_at: (netballDraftRow as { updated_at: string }).updated_at,
        }
      : null;

    // Pre-kickoff = no lineup_set event yet. The starting-lineup
    // surface is intentionally minimal — back-to-availability
    // breadcrumb + the picker itself — so we hide the round/date
    // header strip AND the Restart Game button on this branch.
    // There's nothing to reset yet, and the page header would just
    // be visual noise on a one-purpose screen.
    const isPreKickoff = state.lineup === null;
    // Sticky-bar clearance — kicks in across three netball sub-
    // states: pre-kickoff (NetballLineupPicker has its sticky
    // "Ready for Q1"), Q-break (NetballQuarterBreak has sticky
    // "Ready for Q{n+1}"), AND live play (NetballScoreBug pinned
    // to the bottom for thumb-reach +G — Steve 2026-05-13).
    // FT review + finalised keep the scorebug top-anchored so the
    // page sits flush against the safe-area with no dead space.
    const isAtQbreak =
      state.quarterEnded &&
      state.currentQuarter >= 1 &&
      state.currentQuarter < ageCfgN.periodCount;
    // Page-level clearance exists ONLY for the Q-break's fixed
    // "Ready for Q{n+1}" CTA, which reserves no flow space of its
    // own (Steve 2026-10-16: "the scroll goes too low, big gaps").
    //   - Live play is NOT here: the shared LiveStickyScoreBar
    //     renders a measured in-flow spacer of the bar's height.
    //   - Pre-kickoff is NOT here: the picker's Save/Start footer
    //     is sticky — in flow at the end of the picker — so there
    //     is nothing to clear (mirrors the AFL branch, which never
    //     reserved for its picker).
    const hasStickyBottom = isAtQbreak;
    const stickyPb = "pb-[calc(6rem+env(safe-area-inset-bottom))]";

    return (
      // md:max-w-md — the live views are phone-shaped objects; scaled
      // unclamped to a desktop width the court grew ~1500px tall with
      // tokens metres apart (UI polish audit §12). On md+ the column
      // stays phone-sized, centred, with the page breathing around it.
      <div
        className={`space-y-3 md:mx-auto md:max-w-md${
          hasStickyBottom ? ` ${stickyPb}` : ""
        }`}
      >
        {/* GameInfoHeader is now rendered INSIDE NetballLiveGame's
            sticky top bar (Steve 2026-05-13) — the (app) header is
            hidden on /live routes so this info needs a home in the
            in-game chrome itself. */}
        <NetballLiveGame
          auth={{ kind: "team", teamId: params.teamId }}
          renderedAtMs={Date.now()}
          game={g}
          teamName={teamName}
          squad={squad}
          availableIds={availableIds}
          availabilityPanel={
            <GameDayAvailabilityPanel
              auth={{ kind: "team", teamId: params.teamId }}
              teamId={params.teamId}
              gameId={params.gameId}
              squad={(players ?? []) as Player[]}
              availableIds={availableIds}
              fillInCount={fillInsForLive.length}
              canManageMatch
              showJerseyNumber={getSportConfig("netball").jerseyNumbers}
            />
          }
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
          isAdmin={isAdmin}
          initialDraft={netballDraft}
          allowMidQuarterSubs={allowMidQuarterSubs}
          teamAllowMidQuarterSubs={teamAllowMidQuarterSubs}
          gameAllowMidQuarterSubs={gameAllowMidQuarterSubs}
          chipModeByKey={teamChipModes}
          netballPlaybook={netballPlaybook}
          roleSheet={coachRoleSheet(isAdmin, nb.resolved, nb.prefs)}
          songUrl={songUrlTop}
          songStartSeconds={songStartSecondsTop}
          songDurationSeconds={songDurationSecondsTop}
          gamePlan={
            isPreKickoff
              ? {
                  sport,
                  ageGroup: ageCfgN,
                  players: squad.filter((p) => availableIds.includes(p.id)),
                  onFieldSize: g.on_field_size,
                  periodMinutes: quarterLengthSeconds / 60,
                  teamName,
                  opponentName: g.opponent,
                  // When, where and who's out, as the game page's plan.
                  details: gamePlanDetails(g, (players ?? []) as Player[], availableIds),
                  seasonEvents: seasonEvents as GameEvent[],
                  chipModeByKey: teamChipModes,
                  netballPlaybook,
                }
              : undefined
          }
        />
        {/* ResetGameButton is now rendered INSIDE NetballLiveGame's
            admin-utility row alongside "+ Add late arrival" so the
            two share one row of scrolling space (Steve 2026-05-13).
            Pre-kickoff suppresses it via the isAdmin gate inside
            the component (no row when there's nothing to reset). */}
      </div>
    );
  }

  // ─── AFL branch (existing behaviour) ──────────────────────
  // (`trackScoring` is hoisted above the netball branch so both
  // sports share the same source — see the const at the top of
  // this function.)
  const songEnabled = teamRow?.song_enabled ?? true;
  const songUrl = songEnabled ? (teamRow?.song_url ?? null) : null;
  const songStartSeconds = teamRow?.song_start_seconds ?? 0;
  const songDurationSeconds = teamRow?.song_duration_seconds ?? 15;
  const ageCfg = getAgeGroupConfig(aflBranch(sport), teamRow?.age_group ?? null);
  const positionModel = aflPositionModel(ageCfg);

  const hasStarted = (thisGameEvents ?? []).some((e) => e.type === "lineup_set");

  // D-26 / D-27: compute the effective quarter length (seconds → ms) so
  // LiveGame's countdown cap and hooter trigger respect per-team and
  // per-game overrides instead of a hardcoded constant. Mirrors the
  // netball branch's call above. Three-level resolution, most specific
  // wins: game.quarter_length_seconds → team.quarter_length_seconds →
  // ageGroup.periodSeconds (= 12 min for AFL U10).
  const quarterMs = getEffectiveQuarterSeconds(
    { quarter_length_seconds: (teamRow as { quarter_length_seconds?: number | null } | null)?.quarter_length_seconds ?? null },
    ageCfg,
    { quarter_length_seconds: g.quarter_length_seconds },
  ) * 1000;
  const zoneCaps = zoneCapsFor(g.on_field_size, positionModel);
  // How we play (UX plan 3.6): strategy, roles and season balance for
  // the AFL suggesters.
  const { resolved: playbook, prefs: playbookPrefs, rules: playbookRules } = await loadTeamPlaybook(
    supabase,
    params.teamId,
    "afl",
    teamRow?.age_group ?? null,
  );
  const aflPlaybookBase = aflPlaybookInput(playbook, playbookPrefs, playbookRules);

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
        .or(squadFilter)
        .order("jersey_number").order("full_name").order("id"),
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
    // Season events cached for 300s + tag-invalidated by event
    // writes (perf phase 5). Filter out the current game's events
    // — thisGameEvents already covers those.
    const allTeamEvents = (await getSeasonEvents(params.teamId)).filter(
      (e) => e.game_id !== params.gameId,
    );
    const season = seasonZoneMinutes(allTeamEvents);
    const aflPlaybook = withBalanceSeason(
      withSnapshot(aflPlaybookBase, g.playbook_snapshot),
      allTeamEvents,
      playbook.seasonBalanceSince,
    );
    const loanMins = seasonLoanMinutes(allTeamEvents);
    const seasonAvail = seasonAvailability(allTeamEvents);
    // Page-level sticky-bar clearance — kicks in at a Q-break
    // (sticky "Ready for Q{n+1}" CTA in QuarterBreak) AND during
    // live play (sticky scorebug at the bottom in LiveGame —
    // Steve 2026-05-13 follow-up). FT review + finalised states
    // keep the scorebug top-anchored so the page sits flush
    // against the safe-area without dead space below.
    const isAtQbreak =
      state.quarterEnded &&
      state.currentQuarter >= 1 &&
      state.currentQuarter < ageCfg.periodCount;
    // Page-level clearance exists ONLY for fixed bars that don't
    // reserve their own flow space (Steve 2026-10-16: "the scroll
    // goes too low, big gaps"):
    //   - Q-break    → "Ready for Q{n+1}" CTA (QuarterKickoffBar,
    //                  fixed on phones, no spacer of its own)
    //   - finalised  → "Finish game" CTA (same)
    // Live play is NOT here: LiveStickyScoreBar renders a measured
    // in-flow spacer of exactly the bar's height, so a page pb on
    // top of it was pure dead scroll (~144px of it).
    // FT review (post-Q4, pre-finalise) is intentionally excluded —
    // the user is still reconciling scores there and we don't want
    // a competing CTA at the bottom.
    const isFinalised = state.finalised;
    const hasStickyBottom = isAtQbreak || isFinalised;
    const stickyPb = "pb-[calc(6rem+env(safe-area-inset-bottom))]";

    return (
      // md:max-w-md — phone-shaped object, phone-sized on desktop
      // too (UI polish audit §12; see the netball branch's note).
      <div
        className={`space-y-3 md:mx-auto md:max-w-md${
          hasStickyBottom ? ` ${stickyPb}` : ""
        }`}
      >
        {/* GameInfoHeader is now rendered INSIDE LiveGame's sticky
            top bar (Steve 2026-05-13) — the (app) header is hidden
            on /live routes so this info needs a home in the in-game
            chrome itself. */}
        <LiveGame
          standingScores={standingScores((thisGameEvents ?? []) as GameEvent[], AFL_SCORE_TYPES)}
          auth={{ kind: "team", teamId: params.teamId }}
          gameId={params.gameId}
          game={g}
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
          minOnFieldSize={ageCfg.minOnFieldSize}
          maxOnFieldSize={ageCfg.maxOnFieldSize}
          // A full side is the team's own (its competition's), not the age
          // group's: a team that plays 6 drew 6 empty slots (UX round 3).
          defaultOnFieldSize={teamOnFieldSize(ageCfg, (teamRow as { on_field_size?: number | null } | null)?.on_field_size)}
          chipModeByKey={teamChipModes}
          aflPlaybook={aflPlaybook}
          exitHref={`/teams/${params.teamId}/games/${params.gameId}`}
          isAdmin={isAdmin}
          songUrl={songUrl}
          songStartSeconds={songStartSeconds}
          songDurationSeconds={songDurationSeconds}
          quarterMs={quarterMs}
          ageGroup={ageCfg}
          clockMultiplier={g.clock_multiplier ?? 1}
        />
        {/* ResetGameButton is now rendered INSIDE LiveGame's
            admin-utility row alongside "+ Add late arrival" so the
            two share one row of scrolling space (Steve 2026-05-13). */}
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
      .eq("status", "available")
      .order("player_id"),
    supabase
      .from("players")
      .select("*")
      .eq("team_id", params.teamId)
      .or(squadFilter)
      .order("jersey_number").order("full_name").order("id"),
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
  const aflAvailabilityPanel = (
    <GameDayAvailabilityPanel
      auth={{ kind: "team", teamId: params.teamId }}
      teamId={params.teamId}
      gameId={params.gameId}
      squad={(players ?? []) as Player[]}
      availableIds={availableIds}
      fillInCount={fillInsForPicker.length}
      canManageMatch
      showJerseyNumber={getSportConfig("afl").jerseyNumbers}
    />
  );

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
  const aflPlaybook = withBalanceSeason(
    aflPlaybookBase,
    (seasonEvents ?? []) as GameEvent[],
    playbook.seasonBalanceSince,
  );

  // Pre-game saved lineup. Picker pre-populates from this if present;
  // null/missing falls back to the fairness suggester.
  const { data: draftRow } = await supabase
    .from("game_lineup_drafts")
    .select("*")
    .eq("game_id", params.gameId)
    .maybeSingle();
  // B1 / AVAIL-01 (UX half): drop any now-unavailable player the saved
  // draft placed on the field so the coach SEES them fall off when the
  // picker loads. Correctness lives server-side in startGame's
  // reconcileLineupToAvailability; this is purely the visible echo.
  const initialDraft = (
    draftRow
      ? {
          ...(draftRow as import("@/lib/types").LineupDraft),
          lineup: filterLineupToAvailable(
            (draftRow as import("@/lib/types").LineupDraft).lineup,
            availableIds,
          ),
        }
      : null
  ) as import("@/lib/types").LineupDraft | null;

  // Pre-game lent-player set. Walk this game's player_loan events
  // (latest per player wins) so the picker chips survive a reload
  // and a re-entry from elsewhere. Empty for a brand-new game.
  const initialLoanedIds: string[] = (() => {
    const latest = new Map<string, { ts: string; loaned: boolean }>();
    for (const ev of (thisGameEvents ?? []) as GameEvent[]) {
      if (ev.type !== "player_loan" || !ev.player_id) continue;
      const meta = (ev.metadata ?? {}) as { loaned?: boolean };
      const loaned = meta.loaned ?? true;
      const cur = latest.get(ev.player_id);
      if (!cur || cur.ts < ev.created_at) {
        latest.set(ev.player_id, { ts: ev.created_at, loaned });
      }
    }
    const out: string[] = [];
    latest.forEach((v, id) => {
      if (v.loaned) out.push(id);
    });
    return out;
  })();

  return (
    <div className="space-y-4">
      {/* Pre-kickoff top bar — the (app) header is hidden on /live
          (Steve 2026-05-13), and the AFL pre-kickoff path renders
          LineupPicker directly from page.tsx (not via LiveGame), so
          this branch needs the SAME sticky top bar that lights up
          everywhere else on /live. Help here links to /help (no
          walkthrough modal state available pre-kickoff). */}
      <LiveTopBar
        exitHref={`/teams/${params.teamId}/games/${params.gameId}`}
        game={g}
      />
      {availablePlayers.length === 0 ? (
        <>
          {aflAvailabilityPanel}
          <EmptyState title="Mark who's here to build the lineup." />
        </>
      ) : (
        <LineupPicker
          // Rebuild the suggestion when who's-here changes on game day.
          key={Array.from(availableIds).sort().join(",")}
          availabilityPanel={aflAvailabilityPanel}
          auth={{ kind: "team", teamId: params.teamId }}
          gameId={params.gameId}
          players={availablePlayers}
          season={season}
          // The game's own size (the team's, its competition's, when it
          // was made or since), as the runner's lineup and every other
          // sport's picker start from: it said 12 after Settings said 11
          // (UX round 2, 24 Oct 2026).
          defaultOnFieldSize={g.on_field_size}
          minOnFieldSize={ageCfg.minOnFieldSize}
          maxOnFieldSize={ageCfg.maxOnFieldSize}
          positionModel={positionModel}
          // This game's length, not the age group's: the sub-interval
          // explainer said "over 48 min" for a 40-minute game.
          gameMinutes={(quarterMs * ageCfg.periodCount) / 60_000}
          defaultSubMinutes={g.sub_interval_seconds / 60}
          fullPeriodMs={quarterMs}
          backHref={`/teams/${params.teamId}/games/${params.gameId}`}
          walkthroughOffer={<AflWalkthroughOffer trackScoring={trackScoring} />}
          gamePlan={{
            sport,
            ageGroup: ageCfg,
            players: availablePlayers,
            onFieldSize: g.on_field_size,
            periodMinutes: quarterMs / 60_000,
            subIntervalSeconds: g.sub_interval_seconds,
            teamName,
            opponentName: g.opponent,
            details: gamePlanDetails(g, (players ?? []) as Player[], availableIds),
            seasonEvents: (seasonEvents ?? []) as GameEvent[],
            chipModeByKey: teamChipModes,
            aflPlaybook,
          }}
          initialDraft={initialDraft}
          chipModeByKey={teamChipModes}
          aflPlaybook={aflPlaybook}
          roleSheet={coachRoleSheet(isAdmin, playbook, playbookPrefs)}
          initialLoanedIds={initialLoanedIds}
          initialLocks={replayLocks((thisGameEvents ?? []) as GameEvent[])}
          seasonLoanMinutes={seasonLoanMinutes((seasonEvents ?? []) as GameEvent[])}
        />
      )}
    </div>
  );
}
