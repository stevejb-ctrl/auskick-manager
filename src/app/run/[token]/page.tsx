import { SFButton, SFIcon } from "@/components/sf";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { LiveGame } from "@/components/live/LiveGame";
import { NetballLiveGame } from "@/components/netball/NetballLiveGame";
import { LeagueLiveGame } from "@/components/league/LeagueLiveGame";
import { LeagueLineupPicker } from "@/components/league/LeagueLineupPicker";
import { AvailabilityList } from "@/components/games/AvailabilityList";
import { GameInfoHeader } from "@/components/games/GameInfoHeader";
import { RunnerWelcomeBanner } from "@/components/games/RunnerWelcomeBanner";
import { replayGame, seasonZoneMinutes, seasonLoanMinutes, seasonAvailability, zoneCapsFor } from "@/lib/fairness";
import { replayNetballGame } from "@/lib/sports/netball/fairness";
import { replayLeagueGame } from "@/lib/sports/rugby_league/fairness";
import { AGE_GROUPS, ageGroupOf } from "@/lib/ageGroups";
import { getAgeGroupConfig, getEffectiveQuarterSeconds, netballSport } from "@/lib/sports";
import { rugbyLeagueSport } from "@/lib/sports/rugby_league";
import type { LeagueLineup } from "@/lib/types";
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
    .select("name, sport, track_scoring, age_group, quarter_length_seconds, allow_mid_quarter_subs, song_url, song_start_seconds, song_duration_seconds, song_enabled, chip_a_mode, chip_b_mode, chip_c_mode, chip_a_label, chip_b_label, chip_c_label, track_zone_time, enforce_unbroken_periods")
    .eq("id", g.team_id)
    .single();
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

  // ─── Rugby League branch ─────────────────────────────────────
  // Junior RL uses rolling subs (like AFL) but on a rectangular
  // pitch with Forward/Back position chips and a §7 unbroken-
  // period rule. The runner-token landing page mirrors the team-
  // coach RL flow at (app)/teams/[teamId]/games/[gameId]/live —
  // pre-kickoff = LeagueLineupPicker, in-progress = LeagueLiveGame.
  // Without this branch RL games fall through to the AFL LiveGame
  // (the demo-picker symptom Steve caught: clicking the RL card
  // started a game on the RL team but rendered AFL chrome).
  if (sport === "rugby_league") {
    const ageCfgL =
      rugbyLeagueSport.ageGroups.find((a) => a.id === teamRow?.age_group) ??
      rugbyLeagueSport.ageGroups.find((a) => a.id === "U10")!;
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

    const replay = replayLeagueGame((thisGameEvents ?? []) as GameEvent[]);
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
        <div className="space-y-3 p-3">
          <RunnerWelcomeBanner
            teamName={teamName}
            trackScoring={trackScoring}
          />
          {availablePlayers.length === 0 ? (
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
                showJerseyNumber
                requiredAvailable={ageCfgL.defaultOnFieldSize}
              />
            </section>
          ) : (
            <LeagueLineupPicker
              auth={auth}
              gameId={g.id}
              players={availablePlayers}
              ageGroup={ageCfgL}
              defaultOnFieldSize={ageCfgL.defaultOnFieldSize}
              minOnFieldSize={ageCfgL.minOnFieldSize}
              maxOnFieldSize={ageCfgL.maxOnFieldSize}
              seasonEvents={leagueSeasonEvents}
              initialLoanedIds={leagueLoanedIds}
              initialDraft={initialDraft}
              backHref={`/run/${params.token}`}
              chipLabels={{ a: chipLabelA, b: chipLabelB }}
              chipModes={teamChipModes}
            />
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <LeagueLiveGame
          auth={auth}
          game={g}
          teamName={teamName}
          squad={squad}
          ageGroup={ageCfgL}
          periodSeconds={periodSeconds}
          subIntervalSeconds={g.sub_interval_seconds}
          trackScoring={trackScoring}
          enforceUnbrokenPeriods={
            (g as { enforce_unbroken_periods?: boolean | null })
              .enforce_unbroken_periods ??
            (teamRow as { enforce_unbroken_periods?: boolean | null } | null)
              ?.enforce_unbroken_periods ??
            false
          }
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
          // Runner-token grants restart access (same convention as
          // the netball branch — folded into LeagueLiveGame's
          // admin-utility row).
          isAdmin
          exitHref={`/run/${params.token}`}
        />
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
        {/* GameInfoHeader is now rendered INSIDE NetballLiveGame's
            sticky top bar (Steve 2026-05-13) — the (app) header is
            hidden on /live routes so this info lives in the
            in-game chrome itself. */}
        {/* Pre-kickoff availability section — landing here from a runner
            link, the parent expects to mark who's playing FIRST, then
            set the lineup. Stagehand 2026-05-09 found that without this
            section the runner-token URL dropped them straight onto an
            empty lineup picker (no availability rows yet → empty bench
            → "Start game" failed validation). Once a player is marked
            available, setAvailability's revalidatePath kicks in and
            this server component rerenders so the picker below picks
            up the new availability. Hidden once the lineup is set
            (game underway). showJerseyNumber=false because netball
            squads don't carry jersey numbers (NETBALL-06). */}
        {isPreKickoff && (
          <>
            {/* Orientation banner — first thing a parent-runner sees.
                Steve 2026-05-13 usability test: without it Lisa
                (parent-volunteer persona) lands on a wordmark + a
                list of names with no role context. */}
            <RunnerWelcomeBanner
              teamName={teamName}
              trackScoring={trackScoring}
            />
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
                showJerseyNumber={false}
                // Netball court positions for this age group (7 for "go").
                // Drives the "X of 7 available" pill + the helper text
                // that prompts the runner to mark MORE players Available
                // before "Start game" can succeed.
                requiredAvailable={ageCfgN.positions.length}
              />
            </section>
          </>
        )}
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
          // Steve 2026-05-15 (Stagehand finding): suppress auto-
          // walkthrough on the runner-token URL ALWAYS, not just
          // pre-kickoff. The previous gate (`={isPreKickoff}`)
          // flipped false once Q1 started, which fired the
          // walkthrough modal mid-live-play — interrupting the
          // coach right when they're trying to score. Parent-
          // volunteers on a runner link don't need a coach
          // walkthrough anyway; they were handed the link with
          // verbal instructions. The "?" button stays as a manual
          // trigger if anyone wants to see it. Pre-kickoff
          // rationale also still applies — the modal would block
          // the AvailabilityList above.
          suppressAutoWalkthrough
          // Runner-token URLs grant restart access (same behaviour
          // as the pre-2026-05-13 standalone ResetGameButton that
          // used to sit below the live UI). Folded into the
          // admin-utility row inside NetballLiveGame so it shares
          // a row with "+ Add late arrival".
          isAdmin
          allowMidQuarterSubs={allowMidQuarterSubs}
          teamAllowMidQuarterSubs={teamAllowMidQuarterSubs}
          gameAllowMidQuarterSubs={gameAllowMidQuarterSubs}
          chipModeByKey={teamChipModes}
          songUrl={songUrlTop}
          songStartSeconds={songStartSecondsTop}
          songDurationSeconds={songDurationSecondsTop}
        />
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
        {/* GameInfoHeader is now rendered INSIDE LiveGame's sticky
            top bar (Steve 2026-05-13) — keep the spacer here so the
            availability section above LiveGame doesn't bleed into
            the in-game chrome on token-auth, but drop the duplicate
            info strip. */}
        <LiveGame
          auth={auth}
          gameId={g.id}
          game={g}
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
          songUrl={songUrl}
          songStartSeconds={songStartSeconds}
          songDurationSeconds={songDurationSeconds}
          quarterMs={quarterMs}
          // Steve 2026-05-15 (Stagehand finding): the walkthrough
          // used to auto-open on first visit to the AFL live view,
          // which on the runner-token path meant it opened RIGHT
          // when the parent ran their first score attempt at Q1
          // start. Parent-volunteers on a runner link don't need a
          // coach walkthrough (they were handed the link with
          // verbal instructions). Suppress here; the "?" button
          // stays as a manual trigger.
          suppressAutoWalkthrough
          // Runner-token URLs grant restart access (same behaviour
          // as the pre-2026-05-13 standalone ResetGameButton). The
          // button now lives inside LiveGame's admin-utility row
          // alongside "+ Add late arrival".
          isAdmin
        />
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
    .eq("status", "available");
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
          trackScoring={trackScoring}
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
          showJerseyNumber
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
