import { SFButton, SFIcon } from "@/components/sf";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTeamPlaybook } from "@/lib/playbook/load";
import { aflPlaybookInput, withBalanceSeason, withSnapshot } from "@/lib/sports/afl/engine";
import { netballPlaybookInput, withNetballSnapshot } from "@/lib/sports/netball/engine";
import { leaguePlaybookInput } from "@/lib/sports/rugby_league/engine";
import { seasonBalanceWeight, withKickoffSnapshot } from "@/lib/playbook/seasonBalance";
import { seasonTimeByUnit } from "@/lib/playbook/seasonTime";
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
import { LiveGame } from "@/components/live/LiveGame";
import { NetballLiveGame } from "@/components/netball/NetballLiveGame";
import { LeagueLiveGame } from "@/components/league/LeagueLiveGame";
import { LeagueLineupPicker } from "@/components/league/LeagueLineupPicker";
import { AvailabilityList } from "@/components/games/AvailabilityList";
import { GameInfoHeader } from "@/components/games/GameInfoHeader";
import { RunnerWelcomeBanner } from "@/components/games/RunnerWelcomeBanner";
import { replayGame, seasonZoneMinutes, seasonLoanMinutes, seasonAvailability, zoneCapsFor } from "@/lib/fairness";
import { replayNetballGame } from "@/lib/sports/netball/fairness";
import { replayRugbyGame, rugbyPoints } from "@/lib/sports/rugby_league/fairness";
import { aflBranch, aflPositionModel, getAgeGroupConfig, getEffectiveQuarterSeconds, getSportConfig, isBasketball, isRugby, isSoccer, isTouch, netballSport, teamSport } from "@/lib/sports";
import type { LeagueLineup } from "@/lib/types";
import type { FillIn, Game, GameEvent, LiveAuth, MixedGroup, Player, Sport } from "@/lib/types";
import { withThirdsToday } from "@/lib/playbook/dayLines";
import { LiveSync } from "@/components/live/LiveSync";
import { periodShort, periodWordOf } from "@/lib/live/periodGuard";
import { RunnerAllDone } from "@/components/games/RunnerAllDone";
import { readLiveSyncStamp } from "@/lib/live/liveSyncStamp";
import { backfillNetballCourt, filterLineupToAvailable } from "@/lib/live/lineupDraft";
import type { GenericLineup } from "@/lib/sports/netball/fairness";

export const dynamic = "force-dynamic";

interface RunPageProps {
  params: { token: string };
  /** `?step=availability`: the "Who's here today?" list before kickoff. */
  searchParams?: { step?: string };
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
    // Touch and Oztag mixed teams: who a fill-in counts as (0071).
    mixed_group: f.mixed_group ?? null,
    is_active: true,
    created_by: f.created_by ?? "",
    created_at: f.created_at,
    updated_at: f.created_at,
  };
}

// The runner's page keeps in step with the coach's phone (LiveSync): the
// game's stamp is read before the page's own data, so a write landing in
// between makes the next check refresh rather than be missed.
export default async function RunPage(props: RunPageProps) {
  noStore();
  const admin = createAdminClient();
  const { data: row } = await admin.from("games").select("id").eq("share_token", props.params.token).maybeSingle();
  const stamp = row ? await readLiveSyncStamp(admin, (row as { id: string }).id) : null;
  const body = await RunPageBody(props);
  return (
    <>
      <LiveSync stamp={stamp} syncUrl={`/run/${props.params.token}/sync`} />
      {body}
    </>
  );
}

async function RunPageBody({ params, searchParams }: RunPageProps) {
  noStore();
  // The lineup's "Update availability" opens the who's-here list (it used
  // to link to this page, so a no-show couldn't be marked out: UX round 2).
  const wantsAvailability = searchParams?.step === "availability";
  // EXIT leaves the game for a page that says nothing's lost (it used to
  // link here, so it did nothing).
  const exitHref = `/run/${params.token}/left`;
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
    .select("name, sport, track_scoring, age_group, quarter_length_seconds, period_count, track_fouls, mixed_max_boys, mixed_min_girls, mixed_min_boys, girls_try_double, allow_mid_quarter_subs, song_url, song_start_seconds, song_duration_seconds, song_enabled, chip_a_mode, chip_b_mode, chip_c_mode, chip_a_label, chip_b_label, chip_c_label, track_zone_time")
    .eq("id", g.team_id)
    .single();
  // Read with the service client: no row means no such team.
  if (!teamRow) notFound();
  const teamName = teamRow?.name ?? "Team";
  const trackScoring = teamRow?.track_scoring ?? false;
  // Netball-only: opt-in mid-quarter subs. Default false (the rule
  // for every junior netball league). Reads the same columns as the
  // team-auth /live page so the parent-runner sees the same gating
  // the coach configured in team Settings AND any per-game override
  // (migration 0036) the coach set in the pre-game Game settings
  // collapse. Resolution order: game override → team default →
  // false. Steve 2026-05-17.
  const teamAllowMidQuarterSubs =
    (teamRow as { allow_mid_quarter_subs?: boolean | null } | null)
      ?.allow_mid_quarter_subs ?? false;
  const gameAllowMidQuarterSubs =
    (g as { allow_mid_quarter_subs?: boolean | null }).allow_mid_quarter_subs ??
    null;
  const allowMidQuarterSubs =
    gameAllowMidQuarterSubs ?? teamAllowMidQuarterSubs;
  // Netball has no jersey numbers — hide the # input on AddFillInForm
  // (and feed the right live-game component below).
  const sport: Sport = teamSport((teamRow as { sport?: Sport } | null)?.sport);
  // The first period as the sport's Start button says it ("Q1", "H1").
  const firstPeriodOf = (label: string | null | undefined) =>
    periodShort(periodWordOf(label ?? getSportConfig(sport).periodLabel), 1);

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

  // Per-chip mode (split / group). Both branches below consume it.
  // Steve 2026-05-16: lifted above the netball branch so netball
  // can also thread chip modes through to its suggester (AFL parity).
  const teamChipModes = {
    a: ((teamRow as { chip_a_mode?: "split" | "group" } | null)?.chip_a_mode ?? "split") as import("@/lib/chips").ChipMode,
    b: ((teamRow as { chip_b_mode?: "split" | "group" } | null)?.chip_b_mode ?? "split") as import("@/lib/chips").ChipMode,
    c: ((teamRow as { chip_c_mode?: "split" | "group" } | null)?.chip_c_mode ?? "split") as import("@/lib/chips").ChipMode,
  };
  // Team hype song — same lift-up as teamChipModes so the netball
  // branch can also thread it through to NetballLiveGame's
  // useHypeSong hook (AFL parity, Steve 2026-05-16).
  const songEnabledTop = teamRow?.song_enabled ?? true;
  const songUrlTop = songEnabledTop ? (teamRow?.song_url ?? null) : null;
  const songStartSecondsTop = teamRow?.song_start_seconds ?? 0;
  const songDurationSecondsTop = teamRow?.song_duration_seconds ?? 15;

  // ─── Soccer family branch ────────────────────────────────────
  // The runner-token flow mirrors the coach's: before kick-off the
  // family's lineup picker, after it its live game (Football (soccer),
  // futsal, hockey).
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
    const [{ data: avail }, { data: players }, { data: teamGames }, { data: fillInRows }] = await Promise.all([
      admin.from("game_availability").select("player_id, status").eq("game_id", g.id).eq("status", "available").order("player_id"),
      admin.from("players").select("*").eq("team_id", g.team_id).eq("is_active", true).order("jersey_number").order("full_name").order("id"),
      admin.from("games").select("id").eq("team_id", g.team_id),
      admin.from("game_fill_ins").select("*").eq("game_id", g.id).order("created_at"),
    ]);
    const fillIns = ((fillInRows ?? []) as FillIn[]).map((f) => fillInToPlayer(f, g.team_id));
    const squad = [...((players ?? []) as Player[]), ...fillIns];
    const events = (thisGameEvents ?? []) as GameEvent[];
    const availableIds = new Set<string>([
      ...(avail ?? []).map((a) => a.player_id),
      ...fillIns.map((f) => f.id),
      ...events.filter((e) => e.type === "player_arrived" && e.player_id).map((e) => e.player_id as string),
    ]);
    const availablePlayers = squad.filter((p) => availableIds.has(p.id));
    // Season events, read with the service client (no writer context here).
    const otherGameIds = (teamGames ?? []).map((t) => t.id).filter((id) => id !== g.id);
    const { data: seasonRaw } = otherGameIds.length
      ? await admin.from("game_events").select("*").in("game_id", otherGameIds)
      : { data: [] as GameEvent[] };
    // How we play, as on the coach's page (a game under way plays what it
    // kicked off with).
    const howWePlay = soccerHowWePlay(
      await loadTeamPlaybook(admin, g.team_id, sport, teamRow?.age_group ?? null),
      sport,
      ageCfgS.id,
      g.playbook_snapshot,
    );
    const season: SoccerSeasonBalance = {
      time: seasonTimeByUnit(sport, (seasonRaw ?? []) as GameEvent[], "line", { since: howWePlay.since }),
      weight: howWePlay.balance === "off" ? 0 : seasonBalanceWeight(sport, howWePlay.balance),
      periodMs: periodSecondsS * 1000,
    };
    // Lent minutes in the season's other games, for the long-press sheet.
    const seasonLoanMinsS = seasonLoanMinutes((seasonRaw ?? []) as GameEvent[]);

    if (!hasStarted) {
      const { data: draftRow } = await admin
        .from("game_lineup_drafts")
        .select("lineup, updated_at")
        .eq("game_id", g.id)
        .maybeSingle();
      const lent = new Map<string, { ts: string; loaned: boolean }>();
      for (const ev of events) {
        if (ev.type !== "player_loan" || !ev.player_id) continue;
        const loaned = (ev.metadata as { loaned?: boolean } | null)?.loaned ?? true;
        const cur = lent.get(ev.player_id);
        if (!cur || cur.ts < ev.created_at) lent.set(ev.player_id, { ts: ev.created_at, loaned });
      }
      return (
        <div className="space-y-3 px-4 py-3">
          <RunnerWelcomeBanner
            teamName={teamName}
            opponent={g.opponent}
            trackScoring={trackScoring}
            firstPeriod={firstPeriodOf(ageCfgS.periodLabel)}
            availability={availablePlayers.length === 0 || wantsAvailability ? "list" : "link"}
          />
          {availablePlayers.length === 0 || wantsAvailability ? (
            <section className="space-y-3 rounded-md border border-hairline bg-surface p-3 shadow-card">
              <h3 className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-dim">
                Who&apos;s here today?
              </h3>
              <AvailabilityList
                auth={auth}
                teamId={g.team_id}
                gameId={g.id}
                canMarkAvailability
                canManageMatch
                showJerseyNumber={getSportConfig(sport).jerseyNumbers}
                requiredAvailable={ageCfgS.defaultOnFieldSize}
              />
              {availablePlayers.length > 0 && (
                <SFButton href={`/run/${params.token}`} variant="primary" size="lg" full>
                  Back to the lineup
                </SFButton>
              )}
            </section>
          ) : (
            <SoccerLineupPicker
              auth={auth}
              sport={sport}
              gameId={g.id}
              players={availablePlayers}
              ageGroup={ageCfgS}
              onFieldSize={g.on_field_size}
              defaultSubMinutes={g.sub_interval_seconds / 60}
              season={season}
              keeperStrategy={howWePlay.keeperStrategy}
              keeperPrefs={howWePlay.prefs}
              seasonLoanMinutes={seasonLoanMinsS}
              initialDraft={
                draftRow
                  ? {
                      lineup: (draftRow as { lineup: unknown }).lineup as SoccerLineup,
                      updated_at: (draftRow as { updated_at: string }).updated_at,
                    }
                  : null
              }
              initialLoanedIds={Array.from(lent.entries())
                .filter(([, v]) => v.loaned)
                .map(([id]) => id)}
              availabilityHref={`/run/${params.token}?step=availability`}
            />
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3 px-4 py-3">
        <SoccerLiveGame
          auth={auth}
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
          // A runner token can run the whole game, as in the other sports
          // (not restart it: LiveAdminUtilityRow never offers Restart on a
          // game-day link).
          isAdmin
          exitHref={exitHref}
        />
        {g.status === "completed" && <RunnerAllDone className="pb-6 pt-2" />}
      </div>
    );
  }

  // ─── Basketball branch ───────────────────────────────────────
  // The runner-token flow mirrors the coach's: before tip-off the
  // basketball lineup picker, after it the basketball live game.
  if (isBasketball(sport)) {
    const teamExtras = teamRow as { quarter_length_seconds?: number | null; period_count?: number | null; track_fouls?: boolean | null } | null;
    const ageCfgB = basketballAgeGroupForTeam(teamRow?.age_group ?? null, teamExtras?.period_count ?? null);
    const periodSecondsB = getEffectiveQuarterSeconds(
      { quarter_length_seconds: teamExtras?.quarter_length_seconds ?? null },
      ageCfgB,
      { quarter_length_seconds: g.quarter_length_seconds },
    );
    const trackFouls = teamExtras?.track_fouls ?? ageCfgB.tracksFoulsDefault;
    const [{ data: avail }, { data: players }, { data: teamGames }, { data: fillInRows }] = await Promise.all([
      admin.from("game_availability").select("player_id, status").eq("game_id", g.id).eq("status", "available").order("player_id"),
      admin.from("players").select("*").eq("team_id", g.team_id).eq("is_active", true).order("jersey_number").order("full_name").order("id"),
      admin.from("games").select("id").eq("team_id", g.team_id),
      admin.from("game_fill_ins").select("*").eq("game_id", g.id).order("created_at"),
    ]);
    const fillIns = ((fillInRows ?? []) as FillIn[]).map((f) => fillInToPlayer(f, g.team_id));
    const squad = [...((players ?? []) as Player[]), ...fillIns];
    const events = (thisGameEvents ?? []) as GameEvent[];
    const availableIds = new Set<string>([
      ...(avail ?? []).map((a) => a.player_id),
      ...fillIns.map((f) => f.id),
      ...events.filter((e) => e.type === "player_arrived" && e.player_id).map((e) => e.player_id as string),
    ]);
    const availablePlayers = squad.filter((p) => availableIds.has(p.id));
    // Season events, read with the service client (no writer context here).
    const otherGameIds = (teamGames ?? []).map((t) => t.id).filter((id) => id !== g.id);
    const { data: seasonRaw } = otherGameIds.length
      ? await admin.from("game_events").select("*").in("game_id", otherGameIds)
      : { data: [] as GameEvent[] };
    // How we play, as on the coach's page (a game under way plays what it
    // tipped off with).
    const howWePlay = basketballHowWePlay(
      await loadTeamPlaybook(admin, g.team_id, sport, teamRow?.age_group ?? null),
      ageCfgB.id,
      g.playbook_snapshot,
    );
    const seasonUnit = howWePlay.strategy === "position-by-position" || howWePlay.strategy === "set-positions" ? "position" : "line";
    const season: BasketballSeasonBalance = {
      time: seasonTimeByUnit(sport, (seasonRaw ?? []) as GameEvent[], seasonUnit, { since: howWePlay.since }),
      weight: howWePlay.balance === "off" ? 0 : seasonBalanceWeight(sport, howWePlay.balance),
      periodMs: periodSecondsB * 1000,
    };
    // Lent minutes in the season's other games, for the long-press sheet.
    const seasonLoanMinsB = seasonLoanMinutes((seasonRaw ?? []) as GameEvent[]);

    if (!hasStarted) {
      const { data: draftRow } = await admin
        .from("game_lineup_drafts")
        .select("lineup, updated_at")
        .eq("game_id", g.id)
        .maybeSingle();
      const lent = new Map<string, { ts: string; loaned: boolean }>();
      for (const ev of events) {
        if (ev.type !== "player_loan" || !ev.player_id) continue;
        const loaned = (ev.metadata as { loaned?: boolean } | null)?.loaned ?? true;
        const cur = lent.get(ev.player_id);
        if (!cur || cur.ts < ev.created_at) lent.set(ev.player_id, { ts: ev.created_at, loaned });
      }
      return (
        <div className="space-y-3 px-4 py-3">
          <RunnerWelcomeBanner
            teamName={teamName}
            opponent={g.opponent}
            trackScoring={trackScoring}
            firstPeriod={firstPeriodOf(ageCfgB.periodLabel)}
            availability={availablePlayers.length === 0 || wantsAvailability ? "list" : "link"}
          />
          {availablePlayers.length === 0 || wantsAvailability ? (
            <section className="space-y-3 rounded-md border border-hairline bg-surface p-3 shadow-card">
              <h3 className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-dim">
                Who&apos;s here today?
              </h3>
              <AvailabilityList
                auth={auth}
                teamId={g.team_id}
                gameId={g.id}
                canMarkAvailability
                canManageMatch
                showJerseyNumber={getSportConfig(sport).jerseyNumbers}
                requiredAvailable={ageCfgB.defaultOnFieldSize}
              />
              {availablePlayers.length > 0 && (
                <SFButton href={`/run/${params.token}`} variant="primary" size="lg" full>
                  Back to the lineup
                </SFButton>
              )}
            </section>
          ) : (
            <BasketballLineupPicker
              auth={auth}
              gameId={g.id}
              players={availablePlayers}
              ageGroup={ageCfgB}
              onCourtSize={g.on_field_size}
              defaultSubMinutes={g.sub_interval_seconds / 60}
              strategy={howWePlay.strategy}
              prefs={howWePlay.prefs}
              season={season}
              seasonLoanMinutes={seasonLoanMinsB}
              initialDraft={
                draftRow
                  ? {
                      lineup: (draftRow as { lineup: unknown }).lineup as BasketballLineup,
                      updated_at: (draftRow as { updated_at: string }).updated_at,
                    }
                  : null
              }
              initialLoanedIds={Array.from(lent.entries())
                .filter(([, v]) => v.loaned)
                .map(([id]) => id)}
              availabilityHref={`/run/${params.token}?step=availability`}
            />
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3 px-4 py-3">
        <BasketballLiveGame
          auth={auth}
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
          // A runner token can run the whole game, as in the other sports.
          isAdmin
          exitHref={exitHref}
        />
        {g.status === "completed" && <RunnerAllDone className="pb-6 pt-2" />}
      </div>
    );
  }

  // ─── Touch and Oztag branch ──────────────────────────────────
  // The runner-token flow mirrors the coach's: before the start the touch
  // lineup picker (a mixed team asks who counts as a girl or a boy), after
  // it the touch live game.
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
    const [{ data: avail }, { data: players }, { data: teamGames }, { data: fillInRows }] = await Promise.all([
      admin.from("game_availability").select("player_id, status").eq("game_id", g.id).eq("status", "available").order("player_id"),
      admin.from("players").select("*").eq("team_id", g.team_id).eq("is_active", true).order("jersey_number").order("full_name").order("id"),
      admin.from("games").select("id").eq("team_id", g.team_id),
      admin.from("game_fill_ins").select("*").eq("game_id", g.id).order("created_at"),
    ]);
    const fillIns = ((fillInRows ?? []) as FillIn[]).map((f) => fillInToPlayer(f, g.team_id));
    const squad = [...((players ?? []) as Player[]), ...fillIns];
    const events = (thisGameEvents ?? []) as GameEvent[];
    const groups: Record<string, MixedGroup | null> = mixedRule
      ? Object.fromEntries(squad.map((p) => [p.id, p.mixed_group ?? null]))
      : {};
    const availableIds = new Set<string>([
      ...(avail ?? []).map((a) => a.player_id),
      ...fillIns.map((f) => f.id),
      ...events.filter((e) => e.type === "player_arrived" && e.player_id).map((e) => e.player_id as string),
    ]);
    const availablePlayers = squad.filter((p) => availableIds.has(p.id));
    // Season events, read with the service client (no writer context here).
    const otherGameIds = (teamGames ?? []).map((t) => t.id).filter((id) => id !== g.id);
    const { data: seasonRaw } = otherGameIds.length
      ? await admin.from("game_events").select("*").in("game_id", otherGameIds)
      : { data: [] as GameEvent[] };
    // How we play, as on the coach's page (a game under way plays what it
    // started with).
    const howWePlay = touchHowWePlay(
      sport,
      await loadTeamPlaybook(admin, g.team_id, sport, teamRow?.age_group ?? null),
      ageCfgT.id,
      g.playbook_snapshot,
    );
    const season: TouchSeasonBalance = {
      time: seasonTimeByUnit(sport, (seasonRaw ?? []) as GameEvent[], "line", { since: howWePlay.since }),
      weight: howWePlay.balance === "off" ? 0 : seasonBalanceWeight(sport, howWePlay.balance),
      periodMs: periodSecondsT * 1000,
    };
    // Lent minutes in the season's other games, for the long-press sheet.
    const seasonLoanMinsT = seasonLoanMinutes((seasonRaw ?? []) as GameEvent[]);

    if (!hasStarted) {
      const { data: draftRow } = await admin
        .from("game_lineup_drafts")
        .select("lineup, updated_at")
        .eq("game_id", g.id)
        .maybeSingle();
      const lent = new Map<string, { ts: string; loaned: boolean }>();
      for (const ev of events) {
        if (ev.type !== "player_loan" || !ev.player_id) continue;
        const loaned = (ev.metadata as { loaned?: boolean } | null)?.loaned ?? true;
        const cur = lent.get(ev.player_id);
        if (!cur || cur.ts < ev.created_at) lent.set(ev.player_id, { ts: ev.created_at, loaned });
      }
      return (
        <div className="space-y-3 px-4 py-3">
          <RunnerWelcomeBanner
            teamName={teamName}
            opponent={g.opponent}
            trackScoring={trackScoring}
            firstPeriod={firstPeriodOf(ageCfgT.periodLabel)}
            availability={availablePlayers.length === 0 || wantsAvailability ? "list" : "link"}
          />
          {availablePlayers.length === 0 || wantsAvailability ? (
            <section className="space-y-3 rounded-md border border-hairline bg-surface p-3 shadow-card">
              <h3 className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-dim">
                Who&apos;s here today?
              </h3>
              <AvailabilityList
                auth={auth}
                teamId={g.team_id}
                gameId={g.id}
                canMarkAvailability
                canManageMatch
                showJerseyNumber={getSportConfig(sport).jerseyNumbers}
                requiredAvailable={ageCfgT.defaultOnFieldSize}
              />
              {availablePlayers.length > 0 && (
                <SFButton href={`/run/${params.token}`} variant="primary" size="lg" full>
                  Back to the lineup
                </SFButton>
              )}
            </section>
          ) : (
            <TouchLineupPicker
              auth={auth}
              sport={sport}
              gameId={g.id}
              players={availablePlayers}
              ageGroup={ageCfgT}
              onFieldSize={g.on_field_size}
              defaultSubMinutes={g.sub_interval_seconds / 60}
              strategy={howWePlay.strategy}
              prefs={howWePlay.prefs}
              season={season}
              mixedRule={mixedRule}
              initialGroups={groups}
              initialDraft={
                draftRow
                  ? {
                      lineup: (draftRow as { lineup: unknown }).lineup as TouchLineup,
                      updated_at: (draftRow as { updated_at: string }).updated_at,
                    }
                  : null
              }
              initialLoanedIds={Array.from(lent.entries())
                .filter(([, v]) => v.loaned)
                .map(([id]) => id)}
              availabilityHref={`/run/${params.token}?step=availability`}
              seasonLoanMinutes={seasonLoanMinsT}
            />
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3 px-4 py-3">
        <TouchLiveGame
          auth={auth}
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
          // A runner token can run the whole game, as in the other sports.
          isAdmin
          exitHref={exitHref}
          seasonLoanMinutes={seasonLoanMinsT}
        />
        {g.status === "completed" && <RunnerAllDone className="pb-6 pt-2" />}
      </div>
    );
  }

  // ─── Rugby League branch ─────────────────────────────────────
  // Junior RL uses rolling subs (like AFL) but on a rectangular
  // pitch with Forward/Back position chips and a §7 unbroken-
  // period rule. The runner-token landing page mirrors the team-
  // coach RL flow at (app)/teams/[teamId]/games/[gameId]/live —
  // pre-kickoff = LeagueLineupPicker, in-progress = LeagueLiveGame.
  // Without this branch RL games fall through to the AFL LiveGame
  // (the demo-picker symptom Steve caught: clicking the RL card
  // started a game on the RL team but rendered AFL chrome).
  if (isRugby(sport)) {
    const rugbyCfg = getSportConfig(sport);
    const ageCfgL =
      rugbyCfg.ageGroups.find((a) => a.id === teamRow?.age_group) ??
      rugbyCfg.ageGroups.find((a) => a.id === "U10")!;
    const periodSeconds = getEffectiveQuarterSeconds(
      {
        quarter_length_seconds:
          (teamRow as { quarter_length_seconds?: number | null } | null)
            ?.quarter_length_seconds ?? null,
      },
      ageCfgL,
      { quarter_length_seconds: g.quarter_length_seconds },
    );

    // Same fan-out the team-coach RL branch uses for the data the
    // picker / live game need.
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
        .eq("status", "available")
        .order("player_id"),
      admin
        .from("players")
        .select("*")
        .eq("team_id", g.team_id)
        .eq("is_active", true)
        .order("jersey_number").order("full_name").order("id"),
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

    // Availability union — explicit available rows + fill-ins +
    // late-arrival events. Same pattern as the netball branch.
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
    const hasStartedL = replay.lineup !== null;

    // Season events for the suggester + kickoff badges. Fetched the
    // same way the team-coach branch does it but inlined here
    // since /run has no access to the (app)-only getSeasonEvents
    // helper (which assumes a writer-auth context).
    const otherGameIds = (teamGames ?? [])
      .map((t) => t.id)
      .filter((id) => id !== g.id);
    const { data: leagueSeasonEventsRaw } = otherGameIds.length
      ? await admin
          .from("game_events")
          .select("*")
          .in("game_id", otherGameIds)
      : { data: [] as GameEvent[] };
    const leagueSeasonEvents = (leagueSeasonEventsRaw ?? []) as GameEvent[];
    // How we play for the league suggester, as on the coach's page.
    const lg = await loadTeamPlaybook(admin, g.team_id, sport, teamRow?.age_group ?? null);
    // A game in progress plays what it kicked off with (as AFL and netball).
    const leaguePlaybook = withKickoffSnapshot(
      sport,
      leaguePlaybookInput(
        lg.resolved,
        lg.prefs,
        lg.rules,
        seasonTimeByUnit(sport, leagueSeasonEvents, "line", { since: lg.resolved.seasonBalanceSince }),
        periodSeconds * 1000,
        lg.vestStrategy,
        seasonTimeByUnit(sport, leagueSeasonEvents, "position", { since: lg.resolved.seasonBalanceSince }),
      ),
      g.playbook_snapshot,
    );

    // Chip labels for RL — Forward/Back are auto-seeded by the
    // 0043 trigger on team INSERT, but the picker accepts arbitrary
    // labels so we read whatever's in the team row.
    const chipLabelA =
      (teamRow as { chip_a_label?: string | null } | null)?.chip_a_label ??
      "Forward";
    const chipLabelB =
      (teamRow as { chip_b_label?: string | null } | null)?.chip_b_label ??
      "Back";

    // Loan state from this game's events (latest-per-player).
    // Matches the team-coach pre-game pattern so a coach who
    // flagged a loan before kickoff and reloads sees the same
    // chips.
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

    if (!hasStartedL) {
      const { data: draftRow } = await admin
        .from("game_lineup_drafts")
        .select("lineup, updated_at")
        .eq("game_id", g.id)
        .maybeSingle();
      const initialDraft = draftRow
        ? {
            lineup: (draftRow as { lineup: unknown }).lineup as LeagueLineup,
            updated_at: (draftRow as { updated_at: string }).updated_at,
          }
        : null;

      return (
        <div className="space-y-3 px-4 py-3">
          <RunnerWelcomeBanner
            teamName={teamName}
            opponent={g.opponent}
            trackScoring={trackScoring}
            firstPeriod={firstPeriodOf(ageCfgL.periodLabel)}
            availability={availablePlayers.length === 0 || wantsAvailability ? "list" : "link"}
          />
          {availablePlayers.length === 0 || wantsAvailability ? (
            // Empty-state — same shape as the netball runner branch.
            // Demo games seed availability at create time so this
            // path is mostly for hand-crafted runner-token URLs
            // landing pre-availability.
            <section className="space-y-3 rounded-md border border-hairline bg-surface p-3 shadow-card">
              <h3 className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-dim">
                Who&apos;s here today?
              </h3>
              <AvailabilityList
                auth={auth}
                teamId={g.team_id}
                gameId={g.id}
                canMarkAvailability
                canManageMatch
                showJerseyNumber={rugbyCfg.jerseyNumbers}
                requiredAvailable={ageCfgL.defaultOnFieldSize}
              />
              {availablePlayers.length > 0 && (
                <SFButton href={`/run/${params.token}`} variant="primary" size="lg" full>
                  Back to the lineup
                </SFButton>
              )}
            </section>
          ) : (
            <LeagueLineupPicker
              sport={sport}
              auth={auth}
              gameId={g.id}
              players={availablePlayers}
              ageGroup={ageCfgL}
              defaultOnFieldSize={ageCfgL.defaultOnFieldSize}
              minOnFieldSize={ageCfgL.minOnFieldSize}
              maxOnFieldSize={ageCfgL.maxOnFieldSize}
              // The game's own interval (see the AFL runner lineup page).
              defaultSubMinutes={g.sub_interval_seconds / 60}
              seasonEvents={leagueSeasonEvents}
              initialLoanedIds={leagueLoanedIds}
              initialDraft={initialDraft}
              availabilityHref={`/run/${params.token}?step=availability`}
              chipLabels={{ a: chipLabelA, b: chipLabelB }}
              chipModes={teamChipModes}
              leaguePlaybook={leaguePlaybook}
            />
          )}
        </div>
      );
    }

    // px-4 on every sport's wrapper, as the team live page's <main>: the
    // live top bar bleeds edge to edge with -mx-4, so less padding made
    // the page scroll sideways on a 375px phone (league had none: 16px;
    // round 5 route crawl).
    return (
      <div className="space-y-3 px-4 py-3">
        <LeagueLiveGame
          auth={auth}
          sport={sport}
          game={g}
          teamName={teamName}
          squad={squad}
          ageGroup={ageCfgL}
          periodSeconds={periodSeconds}
          subIntervalSeconds={g.sub_interval_seconds}
          clockMultiplier={g.clock_multiplier ?? 1}
          trackScoring={trackScoring}
          trackZoneTime={
            (g as { track_zone_time?: boolean | null }).track_zone_time ??
            (teamRow as { track_zone_time?: boolean | null } | null)
              ?.track_zone_time ??
            false
          }
          state={replay}
          thisGameEvents={(thisGameEvents ?? []) as GameEvent[]}
          seasonEvents={leagueSeasonEvents}
          chipModes={teamChipModes}
          leaguePlaybook={leaguePlaybook}
          // A runner token can run the whole game (not restart it:
          // LiveAdminUtilityRow never offers Restart on a game-day link).
          isAdmin
          exitHref={exitHref}
        />
        {g.status === "completed" && <RunnerAllDone className="pb-6 pt-2" />}
      </div>
    );
  }

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
        .eq("status", "available")
        .order("player_id"),
      admin
        .from("players")
        .select("*")
        .eq("team_id", g.team_id)
        .eq("is_active", true)
        .order("jersey_number").order("full_name").order("id"),
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
    // How we play for the netball suggester, as on the coach's page.
    const nb = await loadTeamPlaybook(admin, g.team_id, "netball", teamRow?.age_group ?? null);
    const netballPlaybook = withThirdsToday(
      withNetballSnapshot(
        netballPlaybookInput(
          nb.resolved,
          nb.prefs,
          nb.rules,
          seasonTimeByUnit(
            "netball",
            (seasonEventsNetball ?? []) as GameEvent[],
            nb.resolved.strategy.balanceUnit === "third" ? "third" : "bib",
            { since: nb.resolved.seasonBalanceSince, periodSeconds: quarterLengthSeconds },
          ),
          quarterLengthSeconds * 1000,
        ),
        g.playbook_snapshot,
      ),
      (seasonEventsNetball ?? []) as GameEvent[],
      (thisGameEvents ?? []) as GameEvent[],
      quarterLengthSeconds,
    );
    const isPreKickoff = state.lineup === null;
    // The coach's saved plan, as the coach's page seeds its picker with:
    // without it the two phones suggested different lineups for the same
    // kickoff (UX round 2).
    const { data: netballDraftRow } = isPreKickoff
      ? await admin.from("game_lineup_drafts").select("lineup, updated_at").eq("game_id", g.id).maybeSingle()
      : { data: null };
    const netballDraft = netballDraftRow
      ? {
          lineup: backfillNetballCourt(
            filterLineupToAvailable((netballDraftRow as { lineup: unknown }).lineup as GenericLineup, availableIds),
            ageCfgN.positions,
            availableIds,
          ),
          updated_at: (netballDraftRow as { updated_at: string }).updated_at,
        }
      : null;
    // Gate the availability section on "not enough available to
    // start yet". For demo games (and any flow where availability
    // was seeded at game-creation time), this is already
    // satisfied so we skip straight to the lineup picker — the
    // visitor doesn't need to re-mark everyone as available.
    // For real runner links where the coach hasn't set
    // availability yet, the section still shows so the parent-
    // runner can mark a squad before the lineup picker has any
    // bench to work with.
    const needsAvailabilityStep =
      isPreKickoff && availableIds.length < ageCfgN.positions.length;
    void hasStarted;
    return (
      <div className="space-y-3 px-4 py-3">
        {/* GameInfoHeader is now rendered INSIDE NetballLiveGame's
            sticky top bar (Steve 2026-05-13) — the (app) header is
            hidden on /live routes so this info lives in the
            in-game chrome itself. */}
        {/* Orientation banner — first thing a parent-runner sees, on
            every pre-kickoff screen: it names the game (UX round 2: it
            only showed when too few kids were in, so it never did).
            Steve 2026-05-13 usability test: without it Lisa
            (parent-volunteer persona) lands on a wordmark + a list of
            names with no role context. */}
        {isPreKickoff && (
          <RunnerWelcomeBanner
            teamName={teamName}
            opponent={g.opponent}
            trackScoring={trackScoring}
            firstPeriod="Q1"
            availability={needsAvailabilityStep || wantsAvailability ? "list" : "link"}
          />
        )}
        {(needsAvailabilityStep || (isPreKickoff && wantsAvailability)) && (
          <>
            <section className="space-y-3 rounded-md border border-hairline bg-surface p-3 shadow-card">
              <h3 className="font-mono text-[11px] font-bold uppercase tracking-micro text-ink-dim">
                Who&apos;s here today?
              </h3>
              <AvailabilityList
                auth={auth}
                teamId={g.team_id}
                gameId={g.id}
                canMarkAvailability
                canManageMatch
                showJerseyNumber={getSportConfig("netball").jerseyNumbers}
                requiredAvailable={ageCfgN.positions.length}
              />
              {!needsAvailabilityStep && (
                <SFButton href={`/run/${params.token}`} variant="primary" size="lg" full>
                  Back to the lineup
                </SFButton>
              )}
            </section>
          </>
        )}
        {!(isPreKickoff && wantsAvailability && !needsAvailabilityStep) && (
        <NetballLiveGame
          auth={auth}
          renderedAtMs={Date.now()}
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
          initialDraft={netballDraft}
          // A runner token can run the whole game (not restart it:
          // LiveAdminUtilityRow never offers Restart on a game-day link).
          isAdmin
          allowMidQuarterSubs={allowMidQuarterSubs}
          teamAllowMidQuarterSubs={teamAllowMidQuarterSubs}
          gameAllowMidQuarterSubs={gameAllowMidQuarterSubs}
          chipModeByKey={teamChipModes}
          netballPlaybook={netballPlaybook}
          songUrl={songUrlTop}
          songStartSeconds={songStartSecondsTop}
          songDurationSeconds={songDurationSecondsTop}
        />
        )}
      </div>
    );
  }

  // ─── AFL branch (existing behaviour) ────────────────────────
  const ageCfgSport = getAgeGroupConfig(aflBranch(sport), teamRow?.age_group ?? null);
  const positionModel = aflPositionModel(ageCfgSport);
  // D-26 / D-27: same wiring as the team-coach branch in
  // (app)/teams/[teamId]/games/[gameId]/live/page.tsx. The runner-token
  // page renders the same <LiveGame> component for AFL games, so the
  // hooter and countdown surfaces need the same per-game/per-team-aware
  // duration. Three-level resolution: game → team → ageGroup default.
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
        .order("jersey_number").order("full_name").order("id"),
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
    // How we play for the AFL suggesters (UX plan 3.6), same as the
    // coach's live page.
    const { resolved: playbook, prefs: playbookPrefs, rules: playbookRules } = await loadTeamPlaybook(
      admin,
      g.team_id,
      "afl",
      teamRow?.age_group ?? null,
    );
    const aflPlaybook = withBalanceSeason(
      withSnapshot(aflPlaybookInput(playbook, playbookPrefs, playbookRules), g.playbook_snapshot),
      (allTeamEvents ?? []) as GameEvent[],
      playbook.seasonBalanceSince,
    );
    const loanMins = seasonLoanMinutes((allTeamEvents ?? []) as GameEvent[]);
    const seasonAvail = seasonAvailability((allTeamEvents ?? []) as GameEvent[]);

    return (
      <div className="space-y-3 px-4 py-3">
        {/* GameInfoHeader is now rendered INSIDE LiveGame's sticky
            top bar (Steve 2026-05-13) — keep the spacer here so the
            availability section above LiveGame doesn't bleed into
            the in-game chrome on token-auth, but drop the duplicate
            info strip. */}
        <LiveGame
          auth={auth}
          gameId={g.id}
          game={g}
          // The live top bar, as league and netball runners have: Exit
          // back to the runner page, and the sub-due banner under it.
          exitHref={exitHref}
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
          currentOnFieldSize={g.on_field_size}
          minOnFieldSize={ageCfgSport.minOnFieldSize}
          maxOnFieldSize={ageCfgSport.maxOnFieldSize}
          defaultOnFieldSize={ageCfgSport.defaultOnFieldSize}
          chipModeByKey={teamChipModes}
          aflPlaybook={aflPlaybook}
          songUrl={songUrl}
          songStartSeconds={songStartSeconds}
          songDurationSeconds={songDurationSeconds}
          quarterMs={quarterMs}
          ageGroup={ageCfgSport}
          // A runner token can run the whole game (not restart it:
          // LiveAdminUtilityRow never offers Restart on a game-day link).
          isAdmin
        />
        {g.status === "completed" && <RunnerAllDone className="pb-6 pt-2" />}
      </div>
    );
  }

  // Count available players for the Continue-button gate. Steve
  // 2026-05-13 usability test (Lisa B2): netball already gates its
  // Continue inside AvailabilityList via requiredAvailable, but
  // the AFL Continue button sits OUTSIDE the list and was never
  // disabled — a parent-runner could tap Continue with zero kids
  // marked, land on the lineup page, hit the dead-end empty
  // state, and back-tap loop. Gating it here removes that round-
  // trip. Page re-renders when setAvailability mutates because
  // its revalidatePath('/run/[token]', 'layout') is layout-scoped.
  const { data: availCountRows } = await admin
    .from("game_availability")
    .select("player_id")
    .eq("game_id", g.id)
    .eq("status", "available")
    .order("player_id");
  const availableCount = availCountRows?.length ?? 0;
  const enoughAvailable = availableCount >= g.on_field_size;

  return (
    <div className="space-y-6 p-3">
      <GameInfoHeader teamName={teamName} g={g} />

      {/* Orientation banner — only shows pre-kickoff (no lineup_set
          event yet). Once the game has started, the in-game chrome
          carries forward and the banner would be redundant noise.
          Steve 2026-05-13 usability test (Lisa). */}
      {!hasStarted && (
        <RunnerWelcomeBanner
          teamName={teamName}
          opponent={g.opponent}
          trackScoring={trackScoring}
          firstPeriod="Q1"
          availability="list"
        />
      )}

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
          showJerseyNumber={getSportConfig("afl").jerseyNumbers}
          // AFL needs g.on_field_size players available (12 for U10).
          // Drives the "X of 12 available" pill + helper hint.
          requiredAvailable={g.on_field_size}
        />
      </section>

      {/* Sticky-bottom "Continue to starting lineup" CTA. Matches
          the authenticated /availability page's pattern so the
          runner-token surface and the team-coach surface look
          identical. Steve 2026-05-20: now `position: sticky` rather
          than `fixed` so it works correctly inside the DeviceFrame's
          transformed scroll container on the desktop demo, where
          `fixed` was scrolling with content instead of pinning. */}
      <div className="sticky bottom-0 z-30 border-t border-hairline bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(26,30,26,0.04)] sm:px-7 sm:pt-4">
        <div className="mx-auto max-w-4xl space-y-1">
          {!enoughAvailable && (
            <p className="text-xs text-ink-mute">
              Mark at least {g.on_field_size} players available to continue.
            </p>
          )}
          {/* SFButton polymorphism doesn't honour `disabled` on its
              link variant (Next.js Link ignores it), so swap to the
              button variant when the gate hasn't passed. Same look,
              properly disabled. */}
          {enoughAvailable ? (
            <SFButton
              href={`/run/${params.token}/lineup`}
              variant="primary"
              size="lg"
              full
              iconAfter={<SFIcon.chevronRight color="currentColor" />}
            >
              Continue to starting lineup
            </SFButton>
          ) : (
            <SFButton
              variant="primary"
              size="lg"
              full
              iconAfter={<SFIcon.chevronRight color="currentColor" />}
              disabled
            >
              Continue to starting lineup
            </SFButton>
          )}
        </div>
      </div>
    </div>
  );
}
