import { notFound, redirect } from "next/navigation";
import { createClient, getUser, getMembership } from "@/lib/supabase/server";
import { getSeasonEvents } from "@/lib/season";
import { LineupPicker } from "@/components/live/LineupPicker";
import { LiveGame } from "@/components/live/LiveGame";
import { NetballLiveGame } from "@/components/netball/NetballLiveGame";
import { LeagueLiveGame } from "@/components/league/LeagueLiveGame";
import { LeagueLineupPicker } from "@/components/league/LeagueLineupPicker";
import { GamePlanButton } from "@/components/game-plan/GamePlanButton";
import { LiveTopBar } from "@/components/live/LiveTopBar";
import {
  replayGame,
  seasonZoneMinutes,
  seasonLoanMinutes,
  seasonAvailability,
  zoneCapsFor,
} from "@/lib/fairness";
import { AGE_GROUPS, ageGroupOf } from "@/lib/ageGroups";
import { getAgeGroupConfig, getEffectiveQuarterSeconds, getSportConfig, netballSport, rugbyLeagueSport } from "@/lib/sports";
import { replayNetballGame } from "@/lib/sports/netball/fairness";
import { replayLeagueGame } from "@/lib/sports/rugby_league/fairness";
import { normalizeChipMode } from "@/lib/chips";
import type { FillIn, Game, GameEvent, LeagueLineup, Player, Sport } from "@/lib/types";

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

/**
 * B1 / AVAIL-01 (UX half): strip every player id not in `availableIds`
 * out of a saved draft lineup so a now-unavailable player visibly drops
 * off the field when the picker hydrates. Structural + recursive so it
 * covers AFL/league flat zone arrays AND netball's nested `positions`
 * map with one impl — mirroring the server-side
 * reconcileLineupToAvailability filter. Correctness is enforced
 * server-side at kickoff; this is purely the visible echo for the coach.
 */
function filterLineupToAvailable<T>(
  lineup: T,
  availableIds: Set<string> | string[],
): T {
  const has = (id: string): boolean =>
    Array.isArray(availableIds)
      ? availableIds.includes(id)
      : availableIds.has(id);
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.filter((id) => typeof id === "string" && has(id));
    }
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = walk(v);
      }
      return out;
    }
    return node;
  };
  return walk(lineup) as T;
}

/**
 * B1 / AVAIL-01 (netball UX half): after `filterLineupToAvailable`
 * strips a now-unavailable player out of a netball draft, the court
 * is left with a NAMED empty position. Unlike AFL/league flat zone
 * arrays (where a removed player just shortens the array), netball's
 * `validateNetballLineup` blocks kickoff while any targeted court
 * position is empty — so the coach would be stranded at "Need 7 on
 * court". This backfills each empty court position, in canonical
 * order, from the available bench (any available id not already on
 * court). Mirrors D-04's "the normal rotation fills the vacated spot"
 * rule for netball's named-position model, keeping the silent
 * auto-remove startable. Server-side `reconcileLineupToAvailability`
 * remains the authoritative correctness backstop at kickoff.
 */
function backfillNetballCourt(
  lineup: import("@/lib/sports/netball/fairness").GenericLineup,
  courtPositions: readonly string[],
  availableIds: Set<string> | string[],
): import("@/lib/sports/netball/fairness").GenericLineup {
  const availArr = Array.isArray(availableIds)
    ? availableIds
    : Array.from(availableIds);
  const positions = { ...lineup.positions };
  // Everyone currently placed on court (post-filter) — never double-place.
  const onCourt = new Set<string>();
  for (const pid of courtPositions) {
    const occ = positions[pid]?.[0];
    if (occ) onCourt.add(occ);
  }
  const bench = (lineup.bench ?? []).filter((id) => availArr.includes(id));
  // Candidate pool to draw from: available bench players first, then
  // any other available id not yet on court (defensive — covers a
  // draft whose bench list was itself stale).
  const pool = [
    ...bench,
    ...availArr.filter((id) => !onCourt.has(id) && !bench.includes(id)),
  ].filter((id) => !onCourt.has(id));
  const filledBench = new Set<string>();
  for (const pid of courtPositions) {
    const occupied = (positions[pid]?.length ?? 0) > 0;
    if (occupied) continue;
    const next = pool.find((id) => !onCourt.has(id));
    if (!next) break; // not enough available players — leave it empty
    positions[pid] = [next];
    onCourt.add(next);
    filledBench.add(next);
  }
  return {
    positions,
    bench: bench.filter((id) => !filledBench.has(id)),
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

  // Cached: any server action invoked from this page that calls
  // getMembership(teamId, user.id) in the same request will hit
  // this result instead of round-tripping again.
  const membership = await getMembership(params.teamId, user.id);

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
      .select("name, sport, track_scoring, track_zone_time, enforce_unbroken_periods, age_group, quarter_length_seconds, allow_mid_quarter_subs, song_url, song_start_seconds, song_duration_seconds, song_enabled, chip_a_label, chip_b_label, chip_c_label, chip_a_mode, chip_b_mode, chip_c_mode")
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

  // ─── Rugby league branch ──────────────────────────────────
  // Junior rugby league uses rolling subs (like AFL) but is
  // positionless, scores tries (4) + conversions (2), and rotates
  // vests + kickers across periods (those rules live in Phases
  // 4-5; Phase 3 ships the core flow without them). The branch
  // forks here so none of the AFL zone-minutes / netball position-
  // count helpers below run for an RL game.
  if (sport === "rugby_league") {
    const ageCfgL =
      rugbyLeagueSport.ageGroups.find((a) => a.id === teamRow?.age_group)
        ?? rugbyLeagueSport.ageGroups.find((a) => a.id === "U10")!;
    const periodSeconds = getEffectiveQuarterSeconds(
      {
        quarter_length_seconds:
          (teamRow as { quarter_length_seconds?: number | null } | null)?.quarter_length_seconds ?? null,
      },
      ageCfgL,
      { quarter_length_seconds: g.quarter_length_seconds },
    );

    const [
      { data: avail },
      { data: players },
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

    const replay = replayLeagueGame((thisGameEvents ?? []) as GameEvent[]);
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

      return (
        <div className="space-y-4">
          <LiveTopBar
            exitHref={`/teams/${params.teamId}/games/${params.gameId}`}
            game={g}
          />
          {availablePlayers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-hairline bg-surface-alt px-4 py-6 text-center text-sm text-ink-mute">
              No players marked available — go back and set availability first.
            </p>
          ) : (
            // Pre-game lineup picker — rugby pitch + bench strip
            // + LockModal long-press menu. Spike promoted to
            // default (Steve 2026-05-19, see LeagueLineupPicker.tsx
            // header for the interaction model).
            <LeagueLineupPicker
              auth={{ kind: "team", teamId: params.teamId }}
              gameId={params.gameId}
              players={availablePlayers}
              ageGroup={ageCfgL}
              defaultOnFieldSize={ageCfgL.defaultOnFieldSize}
              minOnFieldSize={ageCfgL.minOnFieldSize}
              maxOnFieldSize={ageCfgL.maxOnFieldSize}
              gamePlanButton={
                <GamePlanButton
                  sport={sport}
                  ageGroup={ageCfgL}
                  players={availablePlayers}
                  onFieldSize={g.on_field_size}
                  teamName={teamName}
                  opponentName={g.opponent}
                  seasonEvents={leagueSeasonEvents as GameEvent[]}
                  chipModeByKey={teamChipModes}
                />
              }
              seasonEvents={leagueSeasonEvents as GameEvent[]}
              initialLoanedIds={leagueLoanedIds}
              initialDraft={initialDraft}
              backHref={`/teams/${params.teamId}/games/${params.gameId}`}
              chipLabels={{
                a: teamChipLabels.a,
                b: teamChipLabels.b,
              }}
              chipModes={teamChipModes}
            />
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <LeagueLiveGame
          auth={{ kind: "team", teamId: params.teamId }}
          game={g}
          teamName={teamName}
          squad={squad}
          ageGroup={ageCfgL}
          periodSeconds={periodSeconds}
          subIntervalSeconds={g.sub_interval_seconds}
          trackScoring={trackScoring}
          enforceUnbrokenPeriods={
            // Game → team → false fallback. Same shape as
            // trackZoneTime above — newly-created games have a null
            // override so they should inherit the team's standing
            // preference. Mid-game toggle writes the per-game value
            // as a true override (Steve 2026-05-26 — paired with
            // the trackZoneTime fix in this commit).
            (g as { enforce_unbroken_periods?: boolean | null }).enforce_unbroken_periods ??
            (teamRow as { enforce_unbroken_periods?: boolean | null } | null)
              ?.enforce_unbroken_periods ??
            false
          }
          trackZoneTime={
            // Fall back game → team → false so a coach who turns on
            // "Track forward/back time" at the team level sees the
            // in-game bar without having to re-flip it per game.
            // The mid-game Game-Settings toggle writes
            // games.track_zone_time directly (true/false) — once
            // set, the per-game value overrides the team default
            // (Steve 2026-05-26 — prior behaviour read only
            // game.track_zone_time and ignored the team setting,
            // so newly-created games never inherited the team's
            // standing preference).
            (g as { track_zone_time?: boolean | null }).track_zone_time ??
            (teamRow as { track_zone_time?: boolean | null } | null)
              ?.track_zone_time ??
            false
          }
          state={replay}
          thisGameEvents={(thisGameEvents ?? []) as GameEvent[]}
          seasonEvents={leagueSeasonEvents as GameEvent[]}
          chipModes={teamChipModes}
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

    // Season events cached for 300s + tag-invalidated by event
    // writes (perf phase 5). Filter out the current game — its
    // events are already in thisGameEvents above.
    const allTeamEvents = await getSeasonEvents(params.teamId);
    const seasonEvents = allTeamEvents.filter(
      (e) => e.game_id !== params.gameId,
    );

    const state = replayNetballGame((thisGameEvents ?? []) as GameEvent[]);

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
    const isLivePlay =
      state.currentQuarter >= 1 &&
      !state.quarterEnded &&
      !state.finalised;
    const hasStickyBottom = isPreKickoff || isAtQbreak || isLivePlay;
    // pb depends on which sticky bar is showing — the scorebug
    // during live play is significantly taller than the simple
    // Ready button, so live play uses more. Safe-area inset stacks
    // on top. Steve 2026-05-13: tightened from 12rem to 9rem to
    // close out the "huge blank space under Restart game" gap.
    // 9rem covers the scorebug (~95px) + optional undo strip
    // (~32px) + bar padding (~10px) snugly; if the undo strip
    // isn't rendered (no lastScore yet) there's a hair of slack
    // but no overlap, which was the failure mode the old comment
    // was guarding against.
    const stickyPb = isLivePlay
      ? "pb-[calc(9rem+env(safe-area-inset-bottom))]"
      : "pb-[calc(6rem+env(safe-area-inset-bottom))]";

    return (
      <div
        className={`space-y-3${
          hasStickyBottom ? ` ${stickyPb}` : ""
        }`}
      >
        {/* GameInfoHeader is now rendered INSIDE NetballLiveGame's
            sticky top bar (Steve 2026-05-13) — the (app) header is
            hidden on /live routes so this info needs a home in the
            in-game chrome itself. */}
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
          isAdmin={isAdmin}
          initialDraft={netballDraft}
          allowMidQuarterSubs={allowMidQuarterSubs}
          teamAllowMidQuarterSubs={teamAllowMidQuarterSubs}
          gameAllowMidQuarterSubs={gameAllowMidQuarterSubs}
          chipModeByKey={teamChipModes}
          songUrl={songUrlTop}
          songStartSeconds={songStartSecondsTop}
          songDurationSeconds={songDurationSecondsTop}
          gamePlanButton={
            isPreKickoff ? (
              <GamePlanButton
                sport={sport}
                ageGroup={ageCfgN}
                players={squad.filter((p) => availableIds.includes(p.id))}
                onFieldSize={g.on_field_size}
                teamName={teamName}
                opponentName={g.opponent}
                seasonEvents={seasonEvents as GameEvent[]}
                chipModeByKey={teamChipModes}
              />
            ) : undefined
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
    // Season events cached for 300s + tag-invalidated by event
    // writes (perf phase 5). Filter out the current game's events
    // — thisGameEvents already covers those.
    const allTeamEvents = (await getSeasonEvents(params.teamId)).filter(
      (e) => e.game_id !== params.gameId,
    );
    const season = seasonZoneMinutes(allTeamEvents);
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
      state.currentQuarter < ageCfgSport.periodCount;
    const isLivePlay =
      state.currentQuarter >= 1 &&
      !state.quarterEnded &&
      !state.finalised;
    // Three states now mount a sticky-bottom bar (Steve 2026-05-13):
    //   - live play  → scorebug
    //   - Q-break    → "Ready for Q{n+1}" CTA
    //   - finalised  → "Finish game" CTA (back to dashboard)
    // FT review (post-Q4, pre-finalise) is intentionally excluded —
    // the user is still reconciling scores there and we don't want
    // a competing CTA at the bottom.
    const isFinalised = state.finalised;
    const hasStickyBottom = isAtQbreak || isLivePlay || isFinalised;
    // pb size depends on which sticky bar is showing — the live-
    // play scorebug is the tallest, the Q-break and finalised
    // single-button bars are shorter. Safe-area inset stacks on top.
    // 9rem covers scorebug (~95-130px depending on undo strip) +
    // bar padding snugly without the dead space the old 12rem
    // value created.
    const stickyPb = isLivePlay
      ? "pb-[calc(9rem+env(safe-area-inset-bottom))]"
      : "pb-[calc(6rem+env(safe-area-inset-bottom))]";

    return (
      <div
        className={`space-y-3${
          hasStickyBottom ? ` ${stickyPb}` : ""
        }`}
      >
        {/* GameInfoHeader is now rendered INSIDE LiveGame's sticky
            top bar (Steve 2026-05-13) — the (app) header is hidden
            on /live routes so this info needs a home in the in-game
            chrome itself. */}
        <LiveGame
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
          minOnFieldSize={ageCfgSport.minOnFieldSize}
          maxOnFieldSize={ageCfgSport.maxOnFieldSize}
          defaultOnFieldSize={ageCfgSport.defaultOnFieldSize}
          chipModeByKey={teamChipModes}
          exitHref={`/teams/${params.teamId}/games/${params.gameId}`}
          isAdmin={isAdmin}
          songUrl={songUrl}
          songStartSeconds={songStartSeconds}
          songDurationSeconds={songDurationSeconds}
          quarterMs={quarterMs}
          ageGroup={ageCfgSport}
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
          gameMinutes={(ageCfg.quarterSeconds * ageCfgSport.periodCount) / 60}
          defaultSubMinutes={g.sub_interval_seconds / 60}
          fullPeriodMs={quarterMs}
          backHref={`/teams/${params.teamId}/games/${params.gameId}`}
          gamePlanButton={
            <GamePlanButton
              sport={sport}
              ageGroup={ageCfgSport}
              players={availablePlayers}
              onFieldSize={g.on_field_size}
              teamName={teamName}
              opponentName={g.opponent}
              seasonEvents={(seasonEvents ?? []) as GameEvent[]}
              chipModeByKey={teamChipModes}
            />
          }
          initialDraft={initialDraft}
          chipModeByKey={teamChipModes}
          initialLoanedIds={initialLoanedIds}
        />
      )}
    </div>
  );
}
