"use client";

// ─── LeagueLiveGame ──────────────────────────────────────────
// Rugby-league live-game orchestrator. Mirrors AFL `LiveGame.tsx`
// and netball `NetballLiveGame.tsx` end-to-end so coaches who run
// teams in multiple sports get a consistent live-game shell —
// shared `LiveTopBar` / `LiveStickyScoreBar` / `LiveAdminUtilityRow`
// chrome wrapped around RL-specific surfaces.

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SFButton, SFIcon } from "@/components/sf";
import { LiveTopBar } from "@/components/live/LiveTopBar";
import { LiveAdminUtilityRow } from "@/components/live/LiveAdminUtilityRow";
import { LeagueGameSettingsButton } from "./LeagueGameSettingsButton";
import { ManualEndQuarterConfirm } from "@/components/live/ManualEndQuarterConfirm";
import { StartQuarterModal } from "@/components/live/StartQuarterModal";
import { buildLeagueWalkthroughSteps } from "./leagueWalkthroughSteps";
// Walkthrough modal is heavy (animations, slide tracking) and only
// mounts on first visit or "?" tap. Dynamic-import keeps it out of
// the main live-page bundle, matching the AFL + netball pattern.
const WalkthroughModal = dynamic(
  () => import("@/components/live/WalkthroughModal").then((m) => m.WalkthroughModal),
  { ssr: false },
);
// F2 plan-ahead planner (ROTPLAN-02): the SAME shared GamePlanModal the
// AFL + netball live surfaces open. Heavy (period tabs, copy block), so
// dynamic-import keeps it out of the main live bundle — mirrors the
// netball NetballLiveGame pattern.
const GamePlanModal = dynamic(
  () => import("@/components/game-plan/GamePlanModal").then((m) => m.GamePlanModal),
  { ssr: false },
);
import { SubDueModal } from "@/components/live/SubDueModal";
import { ScoreRecordingDock } from "@/components/live/ScoreRecordingDock";
import { LiveStickyScoreBar } from "@/components/live/LiveStickyScoreBar";
import { LongPressHint } from "@/components/live/LongPressHint";
import { LockModal } from "@/components/live/LockModal";
import {
  InjuryReplacementModal,
  type InjuryReplacementCandidate,
} from "@/components/live/InjuryReplacementModal";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import { finaliseLeagueGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/league-actions";
import { LeagueField } from "./LeagueField";
import { LeagueBenchStrip } from "./LeagueBenchStrip";
import { LeagueScoreBug } from "./LeagueScoreBug";
import { LeagueNextSubCard } from "./LeagueNextSubCard";
import { LeagueScorerPicker } from "./LeagueScorerPicker";
import { LeagueFullTimeReview } from "./LeagueFullTimeReview";
import { LeagueGameSummaryCard } from "./LeagueGameSummaryCard";
import { VestAssignmentCard } from "./VestAssignmentCard";
import { RecordConversionDialog } from "./RecordConversionDialog";
import { KickoffPicker } from "./KickoffPicker";
import { currentVests, type VestType } from "@/lib/sports/rugby_league/vests";
import {
  playerConversionStatusInCycle,
  kickoffTakers,
  kickoffRecordedForPeriod,
} from "@/lib/sports/rugby_league/kicks";
import {
  playedZoneMsByPeriod,
  playerMsOnField,
  playerZoneMsOnField,
  suggestLeagueSubs,
} from "@/lib/sports/rugby_league/fairness";
import { rugbyLeagueSport } from "@/lib/sports/rugby_league";
import { PlayerInsightSummary } from "@/components/live/PlayerInsightSummary";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import {
  projectUpcomingRotation,
  seedNextPeriodLineup,
} from "@/lib/game-plan";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { Game, GameEvent, LiveAuth, Player } from "@/lib/types";
import type { LeagueGameState } from "@/lib/sports/rugby_league/fairness";

interface LeagueLiveGameProps {
  auth: LiveAuth;
  game: Game;
  teamName: string;
  squad: Player[];
  ageGroup: AgeGroupConfig;
  periodSeconds: number;
  subIntervalSeconds: number | null;
  /** Team-level scoring toggle (sport-agnostic). U6/U7 default off; U8+ default on. */
  trackScoring: boolean;
  /**
   * Whether the §6 unbroken-period rule is enforced for this game.
   * Stored on games.enforce_unbroken_periods; the team default lives
   * on teams.enforce_unbroken_periods. Both start false (off).
   */
  enforceUnbrokenPeriods: boolean;
  /**
   * Whether the AFL-style F/C/B time bar renders on every player
   * tile (centre = time wearing FR or DH vest). Stored on
   * games.track_zone_time; team default on teams.track_zone_time.
   * Both start false (off).
   */
  trackZoneTime: boolean;
  state: LeagueGameState;
  thisGameEvents: GameEvent[];
  /**
   * Prior season events (this game's events excluded). Drives the
   * KickoffPicker's "Asher · K 3" per-candidate badge so the coach
   * can see who's kicked off most often across the season at the
   * moment they pick this period's kicker. Empty array = first
   * game of the season → all candidates show 0.
   */
  seasonEvents: GameEvent[];
  /**
   * Per-chip modes from the team row (split / group / forward /
   * back). Drives the F/B chip-letter overlay on each player tile
   * for zone-mode chips. Optional — defaults to all "split" if
   * caller omits, which matches the legacy plain-dot behaviour.
   */
  chipModes?: Partial<
    Record<import("@/lib/chips").ChipKey, import("@/lib/chips").ChipMode>
  >;
  isAdmin: boolean;
  exitHref: string;
}

export function LeagueLiveGame({
  auth,
  game,
  teamName,
  squad,
  ageGroup,
  periodSeconds,
  subIntervalSeconds,
  trackScoring,
  enforceUnbrokenPeriods,
  trackZoneTime,
  state,
  thisGameEvents,
  seasonEvents,
  chipModes,
  isAdmin,
  exitHref,
}: LeagueLiveGameProps) {
  const router = useRouter();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [endQConfirmOpen, setEndQConfirmOpen] = useState(false);
  /**
   * "Ready for H/Q{n}" confirmation step — shown when the coach taps
   * the quarter-break "Ready for {period}" button. Mirrors AFL's
   * `StartQuarterModal` pattern: the coach confirms by tapping "Start
   * {H|Q}{n}" when the hooter goes. Closing without confirming returns
   * to the quarter-break view with zero server state changed.
   */
  const [startPeriodConfirmOpen, setStartPeriodConfirmOpen] = useState(false);
  // ── Auto-open the StartQuarterModal at every quarter-break ──
  // AFL's `QuarterBreak` requires the coach to tap "Ready for Q{n}"
  // in a sticky-bottom bar before the modal pops. RL has an inline
  // q-break card and Steve flagged that the "Tap when the siren
  // goes" modal felt missing in practice. Solution: auto-pop the
  // modal the first time we enter q-break for each period. If the
  // coach taps "Back to lineup" they fall back to the inline card
  // (Ready button there manually re-opens the modal). Tracked per-
  // period via a ref so dismissing once doesn't keep auto-reopening.
  const autoOpenedForQbreakRef = useRef<number | null>(null);
  // ── Walkthrough state (mirrors AFL + netball) ──
  // First-visit auto-open uses `league-walkthrough-seen` in
  // localStorage so a coach doesn't see the welcome again on
  // subsequent live-game opens. The "?" button in LiveTopBar
  // re-opens the steps (skipWelcome) on demand.
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [walkthroughSkipWelcome, setWalkthroughSkipWelcome] = useState(false);
  const [subAckedAtBaseMs, setSubAckedAtBaseMs] = useState<number | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [conversionDialogOpen, setConversionDialogOpen] = useState(false);
  /**
   * Own-team scorer picker — invoked by the scorebug's `+T` chip.
   * The chip itself doesn't mutate state; it opens this picker so
   * the coach can attribute the try without first having to tap a
   * player tile.
   */
  const [scorerPickerOpen, setScorerPickerOpen] = useState(false);
  /**
   * Long-press action sheet target. Null when closed; otherwise the
   * player_id whose tile was long-pressed. Driven by both field and
   * bench tiles via `onPlayerLongPress`.
   */
  const [actionSheetPlayerId, setActionSheetPlayerId] = useState<string | null>(
    null,
  );
  /**
   * When set, the VestAssignmentCard is mounted as a forced modal.
   * Triggered automatically when an FR/DH wearer leaves the field
   * (subbed off, injured, or loaned) — the coach must pick a
   * replacement before play continues.
   */
  const [forceVestReplaceOpen, setForceVestReplaceOpen] = useState(false);
  /**
   * Track which periods we've already prompted a forced vest
   * replacement for. Without this, the modal would re-mount every
   * render after the coach dismisses it (the missing-wearer state
   * lingers until the next vest_assigned lands).
   */
  const dismissedForceVestRef = useRef<Set<string>>(new Set());
  /**
   * When set, the InjuryReplacementModal is shown so the coach can
   * pick a replacement for a just-injured field player — mirrors
   * AFL's pattern. The modal fires both `markInjury` + `recordLeagueSwap`
   * so the swap physically moves the injured player to the bench and
   * places the replacement in the exact same field slot.
   */
  const [injuryReplacementModal, setInjuryReplacementModal] = useState<{
    injuredId: string;
    zone: "forward" | "back";
  } | null>(null);

  // ── Break-time Manage-availability (AVAIL-02 / B2) ────────────
  // Mirrors AFL `QuarterBreak.tsx` + netball `NetballQuarterBreak.tsx`.
  // At a period break the coach can ADD an arrived player (reuses the
  // canonical addLateArrival writer) or MARK a player OUT — the latter
  // forces a bench-replacement pick via the shared InjuryReplacementModal
  // and records the out player with reason:"out" PLUS a recordLeagueSwap
  // so the replacement physically takes the vacated field slot.
  const [addArrivedPickerOpen, setAddArrivedPickerOpen] = useState(false);
  const [markOutPickerOpen, setMarkOutPickerOpen] = useState(false);
  const [breakInjuredPickerOpen, setBreakInjuredPickerOpen] = useState(false);
  /**
   * When set, the InjuryReplacementModal is shown for the mark-OUT flow
   * (distinct from the in-game injury flow above). `zone` infers from the
   * live lineup so the swap lands the replacement in the right bucket.
   */
  const [markOutReplacement, setMarkOutReplacement] = useState<{
    outId: string;
    zone: "forward" | "back";
  } | null>(null);

  const kickoffSkippedRef = useRef<Set<number>>(new Set());
  const [kickoffSkippedTick, setKickoffSkippedTick] = useState(0);

  // ── Local clock tick + pause ─────────────────────────────────
  // The clock derives `elapsedMs` from wall-clock time anchored at
  // `state.quarterStartedAt`. Pause is currently CLIENT-ONLY: while
  // `pausedAtElapsedMs` is non-null the elapsed value is frozen at
  // that point. Pause doesn't persist across reloads yet — needs a
  // `quarter_pause` / `quarter_resume` event pair to lock in server-
  // side. Filed as a follow-up; the UX matches AFL for now.
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [pausedAtElapsedMs, setPausedAtElapsedMs] = useState<number | null>(
    null,
  );
  const running = pausedAtElapsedMs == null;
  useEffect(() => {
    if (!state.quarterStartedAt || state.quarterEnded || state.finalised) {
      return;
    }
    if (!running) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.quarterStartedAt, state.quarterEnded, state.finalised, running]);

  const elapsedMs = useMemo(() => {
    if (pausedAtElapsedMs != null) return pausedAtElapsedMs;
    if (state.quarterStartedAt == null) return state.quarterElapsedMs ?? 0;
    if (nowMs == null) return state.quarterElapsedMs ?? 0;
    return Math.max(0, nowMs - new Date(state.quarterStartedAt).getTime());
  }, [nowMs, state.quarterStartedAt, state.quarterElapsedMs, pausedAtElapsedMs]);

  // Reset pause when the period flips — a fresh quarter starts
  // running by default.
  useEffect(() => {
    setPausedAtElapsedMs(null);
  }, [state.currentQuarter, state.quarterEnded]);

  function handleClockTap() {
    if (!state.quarterStartedAt || state.quarterEnded || state.finalised) {
      return;
    }
    setPausedAtElapsedMs((prev) => (prev == null ? elapsedMs : null));
  }

  const hooterFiredRef = useRef(false);
  // Anchor for the DeviceFrame scroll-reset (see handleStartNextPeriod).
  const liveRootRef = useRef<HTMLDivElement>(null);

  // ── Period label resolver ─────────────────────────────────────
  const periodLabel = ageGroup.periodLabel ?? "quarter";
  const periodLabelPlural = ageGroup.periodLabelPlural ?? "quarters";

  // ── Derived lineups ───────────────────────────────────────────
  // `forwardPlayers` and `backPlayers` map the position-aware buckets
  // back to Player records. `fieldPlayers` is the union used wherever
  // the consumer doesn't care which zone — keeps the bulk of the live
  // logic legible since most of it (vest assignments, late-arrival
  // detection, sub timing) doesn't read zone info.
  const forwardPlayers = useMemo<Player[]>(() => {
    if (!state.lineup) return [];
    return state.lineup.forwards
      .map((id) => squad.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p));
  }, [state.lineup, squad]);
  const backPlayers = useMemo<Player[]>(() => {
    if (!state.lineup) return [];
    return state.lineup.backs
      .map((id) => squad.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p));
  }, [state.lineup, squad]);
  const fieldPlayers = useMemo<Player[]>(
    () => [...forwardPlayers, ...backPlayers],
    [forwardPlayers, backPlayers],
  );
  const benchPlayers = useMemo<Player[]>(() => {
    if (!state.lineup) return [];
    return state.lineup.bench
      .map((id) => squad.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p));
  }, [state.lineup, squad]);

  // Late-arrival candidates.
  const lateArrivalCandidates = useMemo<Player[]>(() => {
    if (!state.lineup) return squad;
    const placed = new Set([
      ...state.lineup.forwards,
      ...state.lineup.backs,
      ...state.lineup.bench,
    ]);
    return squad.filter((p) => !placed.has(p.id));
  }, [squad, state.lineup]);

  // ── Injury / loan derivation (last value wins per player) ────
  const { injuredIds, loanedIds } = useMemo(() => {
    const injured = new Map<string, { ts: string; on: boolean }>();
    const loaned = new Map<string, { ts: string; on: boolean }>();
    for (const ev of thisGameEvents) {
      if (!ev.player_id) continue;
      const meta = (ev.metadata ?? {}) as {
        injured?: boolean;
        loaned?: boolean;
      };
      if (ev.type === "injury") {
        const on = meta.injured ?? true;
        const prev = injured.get(ev.player_id);
        if (!prev || prev.ts < ev.created_at) {
          injured.set(ev.player_id, { ts: ev.created_at, on });
        }
      } else if (ev.type === "player_loan") {
        const on = meta.loaned ?? true;
        const prev = loaned.get(ev.player_id);
        if (!prev || prev.ts < ev.created_at) {
          loaned.set(ev.player_id, { ts: ev.created_at, on });
        }
      }
    }
    return {
      injuredIds: Array.from(injured.entries())
        .filter(([, v]) => v.on)
        .map(([id]) => id),
      loanedIds: Array.from(loaned.entries())
        .filter(([, v]) => v.on)
        .map(([id]) => id),
    };
  }, [thisGameEvents]);
  const injuredSet = useMemo(() => new Set(injuredIds), [injuredIds]);
  const loanedSet = useMemo(() => new Set(loanedIds), [loanedIds]);

  // ── Vest assignment ──────────────────────────────────────────
  const periodForVests = state.currentQuarter || 1;
  const activeVests = useMemo(
    () => currentVests(thisGameEvents, periodForVests),
    [thisGameEvents, periodForVests],
  );
  const vestByPlayer = useMemo<Record<string, VestType>>(() => {
    const map: Record<string, VestType> = {};
    if (activeVests.fr) map[activeVests.fr] = "fr";
    if (activeVests.dh) map[activeVests.dh] = "dh";
    return map;
  }, [activeVests]);
  const vestRequired
    = Boolean(ageGroup.vestRequirements?.fr || ageGroup.vestRequirements?.dh);

  // ── Conversion / kickoff cycle state ─────────────────────────
  const onFieldIds = useMemo(() => {
    if (!state.lineup) return [];
    return [...state.lineup.forwards, ...state.lineup.backs];
  }, [state.lineup]);
  const onFieldSet = useMemo(() => new Set(onFieldIds), [onFieldIds]);
  const conversionByPlayer = useMemo(
    () => playerConversionStatusInCycle(thisGameEvents, onFieldIds),
    [thisGameEvents, onFieldIds],
  );
  const kickoffTakerIds = useMemo(
    () => kickoffTakers(thisGameEvents),
    [thisGameEvents],
  );

  // ── Per-player time on field ─────────────────────────────────
  // Mirrors AFL's `totalMsByPlayer` map. The replay engine doesn't
  // track this (RL fairness is "unbroken periods" so the dashboard
  // path doesn't need minute resolution), but the live tiles do —
  // the AFL-style `#7 · 8:42` readout demands it. Computed each
  // render from the event log; quantization in `LeaguePlayerTile`'s
  // memo means tick-induced re-renders mostly hit the cache.
  const totalMsByPlayer = useMemo(
    () => playerMsOnField(thisGameEvents, state.currentQuarter, elapsedMs),
    [thisGameEvents, state.currentQuarter, elapsedMs],
  );
  // F/C/B time split — only computed when the game has track_zone_time
  // on, so teams that don't use the bar pay zero cost per clock tick.
  // Passing undefined to the tiles when off hides the bar entirely.
  const zoneMsByPlayer = useMemo(
    () =>
      trackZoneTime
        ? playerZoneMsOnField(thisGameEvents, state.currentQuarter, elapsedMs)
        : undefined,
    [trackZoneTime, thisGameEvents, state.currentQuarter, elapsedMs],
  );

  // ─── F3 (Phase 12) long-press player insight ────────────────
  // Shared, sport-agnostic summary surfaced inside the SAME LockModal
  // AFL uses, via its `insight` slot. Reuses PlayerInsightSummary +
  // buildPlayerInsight verbatim so a coach running both sports sees
  // identical chrome (reuse-before-fork). RL has a single config zone
  // ("field"), so the per-zone split collapses to one row.

  // Labelled zones for the summary — RL sport config, filtered to this
  // age group's zones (D-03; never a hardcoded list). Resolves to the
  // single "field" zone.
  const insightZones = useMemo(
    () => rugbyLeagueSport.zones.filter((z) => ageGroup.zones.includes(z.id)),
    [ageGroup.zones],
  );

  // Per-player, per-period CLOSED on-field ms under the single "field"
  // zone (F3 / D-05). The live trailing-period stint isn't in here —
  // we overlay it onto the current period in buildInsightInput using
  // totalMsByPlayer (which DOES include the open stint).
  const playedByPeriod = useMemo(
    () => playedZoneMsByPeriod(thisGameEvents),
    [thisGameEvents],
  );

  // Season on-field ms per player under the single "field" zone. Summed
  // per completed game (currentQuarter=0/elapsed=0 → closed stints
  // only, no live overlay). Feeds the season-mix percentages (D-04);
  // with one zone this reads "Field 100%" for anyone who's played.
  const seasonFieldMs = useMemo(() => {
    const byGame = new Map<string, GameEvent[]>();
    for (const ev of seasonEvents) {
      const arr = byGame.get(ev.game_id) ?? [];
      arr.push(ev);
      byGame.set(ev.game_id, arr);
    }
    const out: Record<string, number> = {};
    byGame.forEach((evts) => {
      const ms = playerMsOnField(evts, 0, 0);
      for (const [pid, v] of Object.entries(ms)) {
        out[pid] = (out[pid] ?? 0) + v;
      }
    });
    return out;
  }, [seasonEvents]);

  // Absolute game-elapsed "now" in the same frame state.lastSubbedOnMs
  // uses (completedQuarterMs + within-quarter elapsed). While a period
  // runs we add elapsedMs; at a break or finalised the period is
  // already rolled into completedQuarterMs so add 0.
  const completedQuarterMs = useMemo(
    () =>
      thisGameEvents
        .filter((e) => e.type === "quarter_end")
        .reduce(
          (acc, e) =>
            acc + ((e.metadata as { elapsed_ms?: number }).elapsed_ms ?? 0),
          0,
        ),
    [thisGameEvents],
  );
  const liveOverlayMs =
    state.currentQuarter > 0 && !state.quarterEnded && !state.finalised
      ? elapsedMs
      : 0;
  const nowAbsMs = completedQuarterMs + liveOverlayMs;
  const periodAbbrev = (ageGroup.periodLabel ?? "quarter")
    .charAt(0)
    .toUpperCase();

  // Build the PlayerInsightSummary input for one player. Overlays the
  // live open stint onto the current period (closed buckets + the
  // difference between whole-game on-field ms and the closed total).
  const buildInsightInput = (pid: string) => {
    const inGameZoneMs: Record<string, number> = {
      field: totalMsByPlayer[pid] ?? 0,
    };
    const byPeriod = playedByPeriod[pid] ?? {};
    let closedTotal = 0;
    for (const q of Object.keys(byPeriod).map(Number)) {
      closedTotal += byPeriod[q]?.field ?? 0;
    }
    const liveOpenMs = Math.max(0, (totalMsByPlayer[pid] ?? 0) - closedTotal);
    const cur = state.currentQuarter;
    const periods = new Set<number>(Object.keys(byPeriod).map(Number));
    if (liveOpenMs > 0 && cur >= 1) periods.add(cur);
    const perPeriod = Array.from(periods)
      .sort((a, b) => a - b)
      .map((q) => {
        const fieldMs =
          (byPeriod[q]?.field ?? 0) + (q === cur ? liveOpenMs : 0);
        return {
          period: q,
          periodLabel: `${periodAbbrev}${q}`,
          zoneMs: { field: fieldMs },
        };
      })
      .filter((p) => p.zoneMs.field > 0);
    return {
      zones: insightZones,
      inGameZoneMs,
      perPeriod,
      seasonZoneMs: { field: seasonFieldMs[pid] ?? 0 },
      lastSubbedOnMs: state.lastSubbedOnMs[pid] ?? null,
      nowAbsMs,
    };
  };
  const kickingAllowed = ageGroup.kickingAllowed === true;
  const kickoffNeededForPeriod
    = kickingAllowed
    && state.currentQuarter >= 1
    && !state.quarterEnded
    && !state.finalised
    && !kickoffRecordedForPeriod(thisGameEvents, state.currentQuarter);

  // ── Sub-due derivation ───────────────────────────────────────
  const subIntervalMs
    = subIntervalSeconds != null ? subIntervalSeconds * 1000 : null;
  const lastSwapOrPeriodElapsed = useMemo<number | null>(() => {
    if (state.currentQuarter < 1) return null;
    for (let i = thisGameEvents.length - 1; i >= 0; i--) {
      const ev = thisGameEvents[i];
      const meta = ev.metadata as { quarter?: number; elapsed_ms?: number };
      if (meta.quarter !== state.currentQuarter) continue;
      if (ev.type === "swap") {
        return typeof meta.elapsed_ms === "number" ? meta.elapsed_ms : null;
      }
      if (ev.type === "quarter_start") {
        return 0;
      }
    }
    return null;
  }, [thisGameEvents, state.currentQuarter]);
  // Filter out injured / loaned bench players — they can't come on.
  const swappableBench = useMemo(
    () =>
      benchPlayers.filter(
        (p) => !injuredSet.has(p.id) && !loanedSet.has(p.id),
      ),
    [benchPlayers, injuredSet, loanedSet],
  );
  const hasSwappableBench = swappableBench.length > 0;

  // ── Break-time Manage-availability candidate lists ────────────
  // Arrival candidates = squad members not placed anywhere in the
  // lineup (same set the in-game LateArrivalMenu uses). Mark-out
  // candidates = on-field players the coach can take out (excludes
  // anyone already injured / loaned so we never double-sideline).
  const arrivalCandidates = useMemo(
    () =>
      lateArrivalCandidates.map((p) => ({
        id: p.id,
        name: p.full_name,
        jerseyNumber: p.jersey_number,
      })),
    [lateArrivalCandidates],
  );
  const markOutCandidates = useMemo(
    () =>
      fieldPlayers
        .filter((p) => !injuredSet.has(p.id) && !loanedSet.has(p.id))
        .map((p) => ({
          id: p.id,
          name: p.full_name,
          jerseyNumber: p.jersey_number,
        })),
    [fieldPlayers, injuredSet, loanedSet],
  );
  // Replacement candidates for the mark-out flow — swappable bench
  // sorted least-played first (same shape + sort as the injury flow).
  const markOutReplacementCandidates = useMemo<InjuryReplacementCandidate[]>(
    () =>
      swappableBench
        .map((p) => ({ player: p, totalMs: totalMsByPlayer[p.id] ?? 0 }))
        .sort((a, b) => a.totalMs - b.totalMs),
    [swappableBench, totalMsByPlayer],
  );

  const subIsDue
    = subIntervalMs != null
    && lastSwapOrPeriodElapsed != null
    && state.currentQuarter >= 1
    && !state.quarterEnded
    && !state.finalised
    && hasSwappableBench
    && elapsedMs - lastSwapOrPeriodElapsed >= subIntervalMs;

  const msUntilDue
    = subIntervalMs != null && lastSwapOrPeriodElapsed != null
      ? lastSwapOrPeriodElapsed + subIntervalMs - elapsedMs
      : null;

  // Reset sub-due ack on period change.
  useEffect(() => {
    setSubAckedAtBaseMs(null);
  }, [state.currentQuarter]);

  // ── Next-sub suggestion ──────────────────────────────────────
  // FR / DH wearers are excluded from the off-candidate pool so the
  // suggestion never asks the coach to remove a vest mid-period
  // unless they explicitly long-press the wearer + tap "Replace".
  const excludeOff = useMemo(() => {
    const out: string[] = [];
    if (activeVests.fr) out.push(activeVests.fr);
    if (activeVests.dh) out.push(activeVests.dh);
    return out;
  }, [activeVests]);
  // Bench filtered down to swappable players — caller-side exclusion
  // for injured / loaned. The suggester reads `currentLineup.bench`
  // directly, so we pass a filtered copy rather than the raw lineup.
  const chipByPlayerId = useMemo(
    () => new Map(squad.map((p) => [p.id, p.chip ?? null])),
    [squad],
  );
  const nextSubSuggestions = useMemo(() => {
    if (state.currentQuarter < 1 || state.quarterEnded || state.finalised) {
      return [];
    }
    if (!state.lineup) return [];
    return suggestLeagueSubs(
      thisGameEvents,
      state.currentQuarter,
      {
        forwards: state.lineup.forwards,
        backs: state.lineup.backs,
        bench: swappableBench.map((p) => p.id),
      },
      excludeOff,
      elapsedMs,
      chipByPlayerId,
    );
  }, [
    thisGameEvents,
    state.currentQuarter,
    state.quarterEnded,
    state.finalised,
    state.lineup,
    swappableBench,
    excludeOff,
    elapsedMs,
    chipByPlayerId,
  ]);

  // ── Plan-NEXT-period (F2 / ROTPLAN-02) ───────────────────────
  // RL has no separate break component — the q-break is an inline
  // card in this same orchestrator. So both halves of F2 live here:
  //   1. a live-surface entry that opens the SAME shared GamePlanModal
  //      on the upcoming period, pinning forwards/backs into the ONE
  //      shared `plannedRotation` slice (the nextPeriod* fields), and
  //   2. a seed-on-start that applies the reconciled pin via the
  //      existing `recordLeagueLineupSet` action at the explicit
  //      "Start period" tap (see handleStartNextPeriod) — never an
  //      auto-commit (threat model T-11-02-B).
  const plannedRotation = useLiveGame((s) => s.plannedRotation);
  const setPlannedRotation = useLiveGame((s) => s.setPlannedRotation);
  const clearPlannedRotation = useLiveGame((s) => s.clearPlannedRotation);
  const [planNextOpen, setPlanNextOpen] = useState(false);
  // Available squad for the planner = everyone not injured / loaned.
  const gamePlanPlayers = useMemo(
    () => squad.filter((p) => !injuredSet.has(p.id) && !loanedSet.has(p.id)),
    [squad, injuredSet, loanedSet],
  );
  // Final-rotation window (D-11), league clock frame: `elapsedMs` is
  // wall-clock game-time (no multiplier), `periodSeconds * 1000` the
  // full period, `subIntervalMs` the rotation cadence. The coach can
  // plan the next period once less than one sub interval remains. Gated
  // on a configured interval (U6/U7 tag rugby has none).
  const periodMsForPlan = periodSeconds * 1000;
  const inFinalWindow =
    subIntervalMs != null
    && periodMsForPlan > 0
    && elapsedMs >= periodMsForPlan - subIntervalMs;
  const isLastPeriod = state.currentQuarter >= ageGroup.periodCount;
  // The upcoming period's 0-based index equals state.currentQuarter
  // (planning during period P pins P+1, whose 0-based index is P) — and
  // stays equal at the break (currentQuarter holds P until Start fires).
  const pinForThisGame =
    plannedRotation && plannedRotation.gameId === game.id
      ? plannedRotation
      : null;
  const hasPinnedNextPeriod =
    pinForThisGame != null
    && pinForThisGame.nextPeriodIndex === state.currentQuarter
    && pinForThisGame.nextPeriodGroups != null;

  // ── Force-vest-replacement detection ─────────────────────────
  // Triggered when an FR/DH wearer is no longer on the field.
  // Possible causes: sub off (swap), injury, loan.
  const missingVestWearer = useMemo<VestType | null>(() => {
    if (!vestRequired || !state.lineup) return null;
    if (state.currentQuarter < 1 || state.finalised) return null;
    if (
      ageGroup.vestRequirements?.fr
      && activeVests.fr
      && !onFieldSet.has(activeVests.fr)
    ) {
      return "fr";
    }
    if (
      ageGroup.vestRequirements?.dh
      && activeVests.dh
      && !onFieldSet.has(activeVests.dh)
    ) {
      return "dh";
    }
    return null;
  }, [
    vestRequired,
    state.lineup,
    state.currentQuarter,
    state.finalised,
    ageGroup.vestRequirements,
    activeVests,
    onFieldSet,
  ]);
  // Auto-open the forced replacement when the wearer disappears,
  // unless the coach has already dismissed this period's prompt
  // (e.g. "Replace later" — they may want to bring the wearer
  // back themselves).
  useEffect(() => {
    if (missingVestWearer == null) return;
    const key = `${state.currentQuarter}-${missingVestWearer}`;
    if (dismissedForceVestRef.current.has(key)) return;
    setForceVestReplaceOpen(true);
  }, [missingVestWearer, state.currentQuarter]);
  // Clear the "dismissed for period N" set when the period changes.
  useEffect(() => {
    dismissedForceVestRef.current = new Set();
  }, [state.currentQuarter]);

  const periodForAssignment
    = state.quarterEnded && state.currentQuarter < ageGroup.periodCount
      ? state.currentQuarter + 1
      : state.currentQuarter || 1;

  const selectedPlayer = useMemo(
    () => squad.find((p) => p.id === selectedPlayerId) ?? null,
    [selectedPlayerId, squad],
  );
  const selectedOnField
    = selectedPlayer != null
    && (state.lineup
      ? state.lineup.forwards.includes(selectedPlayer.id)
        || state.lineup.backs.includes(selectedPlayer.id)
      : false);
  const selectedOnBench
    = selectedPlayer != null && state.lineup?.bench.includes(selectedPlayer.id);

  // ── Click handlers ────────────────────────────────────────────
  function handlePlayerTap(playerId: string) {
    setError(null);
    setSelectedPlayerId((prev) => (prev === playerId ? null : playerId));
  }

  function handleClearSelection() {
    setSelectedPlayerId(null);
  }

  const endQuarterAtClient = useCallback(
    async (elapsed: number) => {
      setPending(true);
      const { flushed } = enqueueLiveAction("endLeagueQuarter", [
        auth,
        game.id,
        state.currentQuarter,
        elapsed,
      ]);
      await flushed;
      setPending(false);
      router.refresh();
    },
    [auth, game.id, state.currentQuarter, router],
  );

  useEffect(() => {
    if (state.quarterEnded || state.finalised) {
      hooterFiredRef.current = false;
      return;
    }
    if (!state.quarterStartedAt) return;
    if (hooterFiredRef.current) return;
    // While paused, the clock display is frozen but `elapsedMs` may
    // still satisfy the period cap from before the pause — don't
    // auto-end during a pause; the coach is making a deliberate
    // stop and will resume / end explicitly.
    if (!running) return;
    const periodMs = periodSeconds * 1000;
    if (elapsedMs >= periodMs) {
      hooterFiredRef.current = true;
      void endQuarterAtClient(periodMs);
    }
  }, [
    elapsedMs,
    state.quarterEnded,
    state.finalised,
    state.quarterStartedAt,
    periodSeconds,
    running,
    endQuarterAtClient,
  ]);

  // Auto-open the "Tap when the siren goes" modal as soon as we
  // land at a quarter-break, once per period transition. See the
  // `autoOpenedForQbreakRef` declaration for the full rationale.
  // Gated on isAtQbreak (i.e. period ended AND not the final
  // period AND not finalised) so it never fires at game-end where
  // the FullTimeReview owns the space.
  useEffect(() => {
    if (!state.quarterEnded) {
      // Period went live again — reset the ref so the NEXT break
      // gets its own auto-open.
      autoOpenedForQbreakRef.current = null;
      return;
    }
    if (state.finalised) return;
    if (state.currentQuarter >= ageGroup.periodCount) return;
    if (autoOpenedForQbreakRef.current === state.currentQuarter) return;
    autoOpenedForQbreakRef.current = state.currentQuarter;
    setStartPeriodConfirmOpen(true);
  }, [
    state.quarterEnded,
    state.finalised,
    state.currentQuarter,
    ageGroup.periodCount,
  ]);

  // First-visit walkthrough auto-open. Mirrors netball's pattern —
  // dedicated `league-walkthrough-seen` localStorage key (sibling to
  // `nb-walkthrough-seen`) so each sport's walkthrough acks
  // independently. The "?" button in LiveTopBar re-opens manually.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem("league-walkthrough-seen")) return;
    setWalkthroughOpen(true);
  }, []);
  function handleWalkthroughClose() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("league-walkthrough-seen", "1");
    }
    setWalkthroughOpen(false);
    setWalkthroughSkipWelcome(false);
  }
  function handleOpenWalkthrough() {
    setWalkthroughSkipWelcome(true);
    setWalkthroughOpen(true);
  }
  // Build the steps once per dependency change. Vests / kicking /
  // zone-time / unbroken-periods are all sport-config or per-game
  // toggles, so the step list updates if any change between
  // sessions for the same team.
  const walkthroughSteps = useMemo(
    () =>
      buildLeagueWalkthroughSteps({
        trackScoring,
        periodLabel: (ageGroup.periodLabel ?? "quarter") as
          | "quarter"
          | "half"
          | "period",
        vestsEnabled:
          (ageGroup.vestRequirements?.fr ?? false)
          || (ageGroup.vestRequirements?.dh ?? false),
        kickingAllowed: ageGroup.kickingAllowed === true,
        trackZoneTime,
        enforceUnbrokenPeriods,
      }),
    [
      trackScoring,
      ageGroup.periodLabel,
      ageGroup.vestRequirements,
      ageGroup.kickingAllowed,
      trackZoneTime,
      enforceUnbrokenPeriods,
    ],
  );

  async function handleStartNextPeriod() {
    setPending(true);
    setError(null);
    // Reset any scrolled ancestors before transitioning to the next
    // period. The public demo at /run/{token} wraps the app in
    // DeviceFrame, which applies `transform: translateZ(0)` for
    // its rounded-corner clipping — that transform makes the frame
    // a containing block for any `position: fixed` descendant. When
    // the GM has scrolled the QB content down (e.g. to see the
    // bench rotation suggestion) before tapping "Ready for Q{n}",
    // the post-transition live view can render with the field
    // below the visible scroll window inside the frame. Scrolling
    // every ancestor to 0 first guarantees the next view lands at
    // the top of the frame. `window.scrollTo` covers the non-
    // framed (installed PWA) case. Mirrors AFL's fix in ff771c6.
    if (typeof document !== "undefined") {
      let el = liveRootRef.current?.parentElement ?? null;
      while (el) {
        if (el.scrollTop > 0) el.scrollTop = 0;
        el = el.parentElement;
      }
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    const next = state.currentQuarter + 1;
    // F2 pre-seed (ROTPLAN-02 / D-13/D-14): if the coach pinned this
    // upcoming period's lineup during the final window, apply it now —
    // reconciled so any player who became unavailable since pinning
    // (injured / loaned) is dropped from BOTH field and bench, never
    // fielded. The seed is committed through the SAME auth/RLS-guarded
    // `recordLeagueLineupSet` action used by every manual lineup edit,
    // and only here, on the coach's explicit Start tap (threat model
    // T-11-02-B). The pin is then consumed so it can't re-apply.
    // `state.currentQuarter` is the upcoming period's 0-based index
    // (the period that just ended is P; its next, P+1, has index P).
    if (
      pinForThisGame != null
      && pinForThisGame.nextPeriodIndex === state.currentQuarter
      && pinForThisGame.nextPeriodGroups != null
      && state.lineup
    ) {
      const availableIds = gamePlanPlayers.map((p) => p.id);
      const seed = seedNextPeriodLineup({
        pin: pinForThisGame,
        periodIndex: state.currentQuarter,
        availableIds,
        groupIds: ["forwards", "backs"],
      });
      if (seed) {
        const seededForwards = seed.groups.forwards ?? [];
        const seededBacks = seed.groups.backs ?? [];
        const placed = new Set([...seededForwards, ...seededBacks]);
        // Bench = the pinned bench plus any available player the pin
        // never placed (e.g. a late arrival), de-duped against the
        // field so no one is double-listed.
        const benchSet = new Set(seed.bench.filter((id) => !placed.has(id)));
        for (const id of availableIds) {
          if (!placed.has(id)) benchSet.add(id);
        }
        const { flushed: lineupFlushed } = enqueueLiveAction(
          "recordLeagueLineupSet",
          [
            auth,
            game.id,
            {
              forwards: seededForwards,
              backs: seededBacks,
              bench: Array.from(benchSet),
            },
          ],
        );
        await lineupFlushed;
        clearPlannedRotation();
      }
    }
    const { flushed } = enqueueLiveAction("startLeagueQuarter", [
      auth,
      game.id,
      next,
    ]);
    await flushed;
    setPending(false);
    router.refresh();
  }

  async function recordTryForPlayer(playerId: string) {
    // Defensive gate — even if a stale dock / cached client action
    // fires a try while track_scoring is off (U6/U7 tag rugby),
    // short-circuit before the server write. The UI shouldn't
    // expose this path, but a race during a toggle change would
    // otherwise credit a phantom try.
    if (!trackScoring) {
      setError(
        "Scoring is off for this team — turn 'Track points' on in settings to record tries.",
      );
      return;
    }
    setPending(true);
    const { flushed } = enqueueLiveAction("recordTry", [
      auth,
      game.id,
      playerId,
      state.currentQuarter,
      elapsedMs,
    ]);
    await flushed;
    setPending(false);
    handleClearSelection();
    if (kickingAllowed) {
      setConversionDialogOpen(true);
    }
    router.refresh();
  }

  async function handleRecordTryFromDock() {
    if (!selectedPlayer) {
      setError("Tap a player first.");
      return;
    }
    void recordTryForPlayer(selectedPlayer.id);
  }

  async function handleRecordOpponentTry() {
    setPending(true);
    const { flushed } = enqueueLiveAction("recordOpponentTry", [
      auth,
      game.id,
      state.currentQuarter,
      elapsedMs,
    ]);
    await flushed;
    setPending(false);
    router.refresh();
  }

  function handleOpenConversionDialog() {
    setError(null);
    setConversionDialogOpen(true);
  }

  async function handleRecordOpponentConversion() {
    setPending(true);
    const { flushed } = enqueueLiveAction("recordOpponentConversion", [
      auth,
      game.id,
      state.currentQuarter,
      elapsedMs,
    ]);
    await flushed;
    setPending(false);
    router.refresh();
  }

  async function handleUndoScore() {
    setPending(true);
    const { flushed } = enqueueLiveAction("undoLeagueScore", [auth, game.id]);
    await flushed;
    setPending(false);
    router.refresh();
  }

  async function applySwap(offId: string, onId: string) {
    setPending(true);
    const { flushed } = enqueueLiveAction("recordLeagueSwap", [
      auth,
      game.id,
      {
        off_player_id: offId,
        on_player_id: onId,
        quarter: state.currentQuarter,
        elapsed_ms: elapsedMs,
      },
    ]);
    await flushed;
    setPending(false);
    handleClearSelection();
    router.refresh();
  }

  /**
   * Apply EVERY suggested swap in the next-sub card — rotates the
   * whole bench in one tap. Each pair is enqueued as its own
   * `recordLeagueSwap` so the replay sees them in order, and so a
   * mid-rotation failure doesn't cascade.
   *
   * The bench/field sets change as each swap lands; the suggester
   * already paired off-targets uniquely so we can fire them in
   * order without re-evaluating. We do NOT re-run the suggester
   * between flushes — the snapshot the coach saw on screen is
   * what gets executed.
   */
  async function handleApplyAllSubs() {
    if (nextSubSuggestions.length === 0) return;
    setPending(true);
    const flushedAll: Promise<void>[] = [];
    for (const swap of nextSubSuggestions) {
      const { flushed } = enqueueLiveAction("recordLeagueSwap", [
        auth,
        game.id,
        {
          off_player_id: swap.off.playerId,
          on_player_id: swap.on.playerId,
          quarter: state.currentQuarter,
          elapsed_ms: elapsedMs,
        },
      ]);
      flushedAll.push(flushed);
    }
    await Promise.all(flushedAll).catch(() => {
      // Per-op failure already rolls back via the queue's cap;
      // we just stop waiting so the UI unfreezes.
    });
    setPending(false);
    handleClearSelection();
    router.refresh();
  }

  async function maybeCompleteSwap(secondId: string) {
    if (!selectedPlayer || !state.lineup) return false;
    const onForwards = state.lineup.forwards;
    const onBacks = state.lineup.backs;
    const zoneOfId = (id: string): "forward" | "back" | null => {
      if (onForwards.includes(id)) return "forward";
      if (onBacks.includes(id)) return "back";
      return null;
    };
    const firstZone = zoneOfId(selectedPlayer.id);
    const secondZone = zoneOfId(secondId);
    const firstOnField = firstZone !== null;
    const secondOnField = secondZone !== null;
    // Field ↔ field: positional swap. Both players stay on the
    // field. If they're in the same zone, just exchange order in
    // that bucket (the formation arranger reads order to assign
    // slots). If they're in different zones, swap zones — useful
    // when the coach wants to flip a forward and a back without
    // benching anyone.
    if (firstOnField && secondOnField) {
      let nextForwards = onForwards.slice();
      let nextBacks = onBacks.slice();
      if (firstZone === secondZone) {
        const arr = firstZone === "forward" ? nextForwards : nextBacks;
        const i = arr.indexOf(selectedPlayer.id);
        const j = arr.indexOf(secondId);
        if (i >= 0 && j >= 0) {
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        if (firstZone === "forward") nextForwards = arr;
        else nextBacks = arr;
      } else {
        // Cross-zone — swap their bucket membership.
        nextForwards = nextForwards.map((id) =>
          id === selectedPlayer.id
            ? secondId
            : id === secondId
              ? selectedPlayer.id
              : id,
        );
        nextBacks = nextBacks.map((id) =>
          id === selectedPlayer.id
            ? secondId
            : id === secondId
              ? selectedPlayer.id
              : id,
        );
      }
      setPending(true);
      const { flushed } = enqueueLiveAction("recordLeagueLineupSet", [
        auth,
        game.id,
        {
          forwards: nextForwards,
          backs: nextBacks,
          bench: state.lineup.bench,
        },
      ]);
      await flushed;
      setPending(false);
      handleClearSelection();
      router.refresh();
      return true;
    }
    // Field ↔ bench (or bench ↔ field): standard rolling sub.
    if (firstOnField !== secondOnField) {
      const off = firstOnField ? selectedPlayer.id : secondId;
      const on = firstOnField ? secondId : selectedPlayer.id;
      await applySwap(off, on);
      return true;
    }
    return false;
  }

  async function handlePlayerTapMaybeSwap(playerId: string) {
    if (
      selectedPlayer
      && state.lineup
      && playerId !== selectedPlayer.id
    ) {
      const completed = await maybeCompleteSwap(playerId);
      if (completed) return;
    }
    handlePlayerTap(playerId);
  }

  /**
   * Empty slot was tapped. Two paths depending on what's selected:
   *
   *   1. **Bench player selected** — promote them onto the field
   *      via a fresh `lineup_set`, targeting the TAPPED slot's
   *      zone (not the player's chip preference). A coach tapping
   *      the empty FWD slot lands the bench player in FWD even if
   *      they're B-chipped, because the explicit tap-target is a
   *      stronger signal than the chip default.
   *
   *   2. **Field player selected** — move them to the tapped
   *      zone via `league_position_change`. This is the short-
   *      squad "shift the blank to the other zone" affordance.
   *      Example: 10 players in an 11-on-field U10 game leaves an
   *      empty forward slot; the coach wants the blank in backs
   *      instead. Solution: select a back player, tap the empty
   *      forward slot — that back moves to forwards and the back
   *      slot they vacated becomes the new empty. Mirrors AFL's
   *      commit 8a92f71.
   *
   * Same-zone tap when the selected field player is already in the
   * target zone is a no-op (avoids a no-effect position_change
   * round-trip). Nothing-selected is also a no-op.
   */
  async function handleVacantSpotTap(slotZone: "forward" | "back") {
    if (!selectedPlayer || !state.lineup) return;
    const isBench = state.lineup.bench.includes(selectedPlayer.id);
    const isField
      = state.lineup.forwards.includes(selectedPlayer.id)
      || state.lineup.backs.includes(selectedPlayer.id);

    if (isBench) {
      // Bench → field: tap-target zone wins over chip preference.
      setPending(true);
      const nextForwards
        = slotZone === "forward"
          ? [...state.lineup.forwards, selectedPlayer.id]
          : state.lineup.forwards;
      const nextBacks
        = slotZone === "back"
          ? [...state.lineup.backs, selectedPlayer.id]
          : state.lineup.backs;
      const nextBench = state.lineup.bench.filter(
        (id) => id !== selectedPlayer.id,
      );
      const { flushed } = enqueueLiveAction("recordLeagueLineupSet", [
        auth,
        game.id,
        { forwards: nextForwards, backs: nextBacks, bench: nextBench },
      ]);
      await flushed;
      setPending(false);
      handleClearSelection();
      router.refresh();
      return;
    }

    if (isField) {
      // Field → opposite zone: position change. No-op if already
      // in the tapped zone (e.g. coach taps an empty FWD slot
      // with a forward selected — they were going to move within
      // forwards, which isn't a thing; just clear and bail).
      const currentZone: "forward" | "back" = state.lineup.forwards.includes(
        selectedPlayer.id,
      )
        ? "forward"
        : "back";
      if (currentZone === slotZone) {
        handleClearSelection();
        return;
      }
      await handleMoveLeaguePosition(selectedPlayer.id, slotZone);
      handleClearSelection();
    }
  }

  async function handleAddLateArrival(playerId: string) {
    setPending(true);
    // The shared `addLateArrival` action expects an input object,
    // not a bare player id (matches AFL's `handleLateArrival`
    // shape). Passing the bare string silently lands an event with
    // `player_id: undefined`, which is why the bench refused to
    // render the new arrival — the replay engine ignored the row.
    const { flushed } = enqueueLiveAction("addLateArrival", [
      auth,
      game.id,
      {
        player_id: playerId,
        quarter: Math.max(1, state.currentQuarter),
        elapsed_ms: elapsedMs,
      },
    ]);
    await flushed;
    setPending(false);
    router.refresh();
  }

  async function handleFinalise() {
    setPending(true);
    setError(null);
    const result = await finaliseLeagueGame(auth, game.id, elapsedMs);
    setPending(false);
    if (!result.success) {
      setError(result.error ?? "Couldn't finalise the game.");
      return;
    }
    router.refresh();
  }

  // ── Long-press action handlers ──────────────────────────────
  function handlePlayerLongPress(playerId: string) {
    setError(null);
    setActionSheetPlayerId(playerId);
  }

  async function handleToggleInjury(playerId: string, injured: boolean) {
    // Marking a FIELD player injured: prompt for a replacement before
    // firing anything — mirrors AFL's InjuryReplacementModal flow.
    // The modal fires both markInjury + recordLeagueSwap so the swap
    // physically moves the injured player to bench and the replacement
    // lands at the exact same field slot (same index in the forwards /
    // backs array). If there are no swappable bench players, or the
    // player is on the bench (toggling recovery), skip straight to the
    // direct path.
    if (injured && state.lineup) {
      const zone: "forward" | "back" | null = state.lineup.forwards.includes(
        playerId,
      )
        ? "forward"
        : state.lineup.backs.includes(playerId)
          ? "back"
          : null;
      if (zone !== null && swappableBench.length > 0) {
        setActionSheetPlayerId(null);
        setInjuryReplacementModal({ injuredId: playerId, zone });
        return;
      }
    }
    // Direct path: recovery, bench-player injury, or no bench available.
    setPending(true);
    const { flushed } = enqueueLiveAction("markInjury", [
      auth,
      game.id,
      {
        player_id: playerId,
        injured,
        quarter: state.currentQuarter,
        elapsed_ms: elapsedMs,
      },
    ]);
    await flushed;
    setPending(false);
    setActionSheetPlayerId(null);
    router.refresh();
  }

  /**
   * Coach picked a replacement from the InjuryReplacementModal.
   * Fires markInjury + recordLeagueSwap in order so the replay sees:
   *   1. injury (flag only — player stays in field slot)
   *   2. swap (off=injured, on=replacement) — replacement takes the
   *      exact same slot; injured moves to bench with INJ badge.
   */
  async function handleInjuryReplacement(
    injuredId: string,
    replacementId: string,
    zone: "forward" | "back",
  ) {
    void zone; // included for parity with AFL signature; RL swap infers zone from lineup
    setInjuryReplacementModal(null);
    setPending(true);
    // Enqueue injury flag then swap. FIFO queue ensures injury lands
    // before the swap on the server, matching AFL's sequencing.
    const { flushed: injFlushed } = enqueueLiveAction("markInjury", [
      auth,
      game.id,
      {
        player_id: injuredId,
        injured: true,
        quarter: state.currentQuarter,
        elapsed_ms: elapsedMs,
      },
    ]);
    const { flushed: swapFlushed } = enqueueLiveAction("recordLeagueSwap", [
      auth,
      game.id,
      {
        off_player_id: injuredId,
        on_player_id: replacementId,
        quarter: state.currentQuarter,
        elapsed_ms: elapsedMs,
      },
    ]);
    await Promise.all([injFlushed, swapFlushed]).catch(() => {
      // individual failures already handled by queue retry cap
    });
    setPending(false);
    router.refresh();
  }

  /**
   * Coach tapped "Mark injured without replacement" — just flag the
   * player as injured, leave their field slot vacant.
   */
  async function handleInjuryMarkOnly(playerId: string) {
    setInjuryReplacementModal(null);
    setPending(true);
    const { flushed } = enqueueLiveAction("markInjury", [
      auth,
      game.id,
      {
        player_id: playerId,
        injured: true,
        quarter: state.currentQuarter,
        elapsed_ms: elapsedMs,
      },
    ]);
    await flushed;
    setPending(false);
    router.refresh();
  }

  // ── Break-time Manage-availability handlers (AVAIL-02 / B2) ───
  // ADD ARRIVED: a squad member who wasn't available pre-game turns
  // up at the break. Reuses the canonical addLateArrival writer (same
  // path as the in-game LateArrivalMenu) — the arrival lands on the
  // bench and the next period's rotation works them in.
  async function handleAddArrivedAtBreak(playerId: string) {
    setAddArrivedPickerOpen(false);
    setPending(true);
    const { flushed } = enqueueLiveAction("addLateArrival", [
      auth,
      game.id,
      {
        player_id: playerId,
        quarter: Math.max(1, state.currentQuarter + 1),
        elapsed_ms: 0,
      },
    ]);
    await flushed;
    setPending(false);
    router.refresh();
  }

  // MARK OUT: coach picked an on-field player who has to leave. If
  // they're in a known zone and there's a swappable bench player,
  // force a replacement pick (so the field doesn't go short);
  // otherwise mark them out directly.
  function handleMarkOutPick(playerId: string) {
    setMarkOutPickerOpen(false);
    const zone: "forward" | "back" | null = state.lineup
      ? state.lineup.forwards.includes(playerId)
        ? "forward"
        : state.lineup.backs.includes(playerId)
          ? "back"
          : null
      : null;
    if (zone !== null && markOutReplacementCandidates.length > 0) {
      setMarkOutReplacement({ outId: playerId, zone });
      return;
    }
    void handleMarkOutDirect(playerId);
  }

  // Mark a player out WITHOUT a replacement (skip / no bench). Records
  // an injury event flagged reason:"out" so display can tell an "out"
  // from a genuine injury; leaves the field slot vacant.
  async function handleMarkOutDirect(playerId: string) {
    setMarkOutReplacement(null);
    setPending(true);
    const { flushed } = enqueueLiveAction("markInjury", [
      auth,
      game.id,
      {
        player_id: playerId,
        injured: true,
        quarter: state.currentQuarter,
        elapsed_ms: elapsedMs,
        reason: "out",
      },
    ]);
    await flushed;
    setPending(false);
    router.refresh();
  }

  // Mark a player out WITH a replacement. Fires markInjury(reason:"out")
  // then recordLeagueSwap (off=out, on=replacement) so the replacement
  // physically takes the vacated field slot — mirrors the injury
  // replacement flow but tagged reason:"out".
  async function handleMarkOutReplacement(
    outId: string,
    replacementId: string,
    zone: "forward" | "back",
  ) {
    void zone; // parity with the injury signature; RL swap infers zone
    setMarkOutReplacement(null);
    setPending(true);
    const { flushed: injFlushed } = enqueueLiveAction("markInjury", [
      auth,
      game.id,
      {
        player_id: outId,
        injured: true,
        quarter: state.currentQuarter,
        elapsed_ms: elapsedMs,
        reason: "out",
      },
    ]);
    const { flushed: swapFlushed } = enqueueLiveAction("recordLeagueSwap", [
      auth,
      game.id,
      {
        off_player_id: outId,
        on_player_id: replacementId,
        quarter: state.currentQuarter,
        elapsed_ms: elapsedMs,
      },
    ]);
    await Promise.all([injFlushed, swapFlushed]).catch(() => {
      // individual failures already handled by queue retry cap
    });
    setPending(false);
    router.refresh();
  }

  // MARK INJURED at the break — plain injury flag (no forced
  // replacement; the next-period rotation reshuffles around the
  // sidelined player). Mirrors AFL/netball break "Mark injured" which
  // fire markInjury directly rather than routing through the in-game
  // replacement modal. Recorded WITHOUT reason:"out" so it reads as a
  // genuine injury, not a take-out.
  async function handleBreakInjured(playerId: string) {
    setBreakInjuredPickerOpen(false);
    setPending(true);
    const { flushed } = enqueueLiveAction("markInjury", [
      auth,
      game.id,
      {
        player_id: playerId,
        injured: true,
        quarter: state.currentQuarter,
        elapsed_ms: elapsedMs,
      },
    ]);
    await flushed;
    setPending(false);
    router.refresh();
  }

  async function handleToggleLoan(playerId: string, loaned: boolean) {
    setPending(true);
    const { flushed } = enqueueLiveAction("markLoan", [
      auth,
      game.id,
      {
        player_id: playerId,
        loaned,
        quarter: state.currentQuarter,
        elapsed_ms: elapsedMs,
      },
    ]);
    await flushed;
    setPending(false);
    setActionSheetPlayerId(null);
    router.refresh();
  }

  function handleReplaceVestFromActionSheet() {
    setActionSheetPlayerId(null);
    setForceVestReplaceOpen(true);
  }

  // Mid-game forward↔back override. Emits `league_position_change`
  // and the replayer moves the player between lineup.forwards and
  // lineup.backs without touching field membership (stints + §6
  // compliance keep ticking). No-op when the player isn't on field
  // — the action-sheet only surfaces the button for on-field
  // players anyway.
  async function handleMoveLeaguePosition(
    playerId: string,
    toZone: "forward" | "back",
  ) {
    if (!state.lineup) return;
    const wasOnField
      = state.lineup.forwards.includes(playerId)
      || state.lineup.backs.includes(playerId);
    if (!wasOnField) return;
    setPending(true);
    const { flushed } = enqueueLiveAction("recordLeaguePositionChange", [
      auth,
      game.id,
      {
        player_id: playerId,
        to_zone: toZone,
        quarter: state.currentQuarter,
        elapsed_ms: elapsedMs,
      },
    ]);
    await flushed;
    setPending(false);
    setActionSheetPlayerId(null);
    router.refresh();
  }

  function handleForceVestDismiss() {
    setForceVestReplaceOpen(false);
    if (missingVestWearer != null) {
      const key = `${state.currentQuarter}-${missingVestWearer}`;
      dismissedForceVestRef.current.add(key);
    }
  }

  // Auto-close the forced-replace modal when no wearer is missing
  // anymore (e.g. the coach swapped them back on rather than
  // replacing the vest).
  useEffect(() => {
    if (missingVestWearer == null && forceVestReplaceOpen) {
      setForceVestReplaceOpen(false);
    }
  }, [missingVestWearer, forceVestReplaceOpen]);

  // ── State views ───────────────────────────────────────────────
  const isPeriodActive
    = state.currentQuarter >= 1 && !state.quarterEnded && !state.finalised;
  const isAtQbreak
    = state.quarterEnded
    && state.currentQuarter >= 1
    && state.currentQuarter < ageGroup.periodCount
    && !state.finalised;
  const isAtFinalQ
    = state.quarterEnded
    && state.currentQuarter >= ageGroup.periodCount
    && !state.finalised;
  // Mirrors AFL's `isFinished` — covers both the post-final-period
  // review phase (LeagueFullTimeReview is up, coach is reconciling
  // scores) and the post-finalise phase (LeagueGameSummaryCard with
  // "Copy for group chat"). Used to hide the field + bench layout
  // once the game is over — the on-pitch view doesn't carry any
  // signal once the coach is reading the share card.
  const isFinished = state.finalised || isAtFinalQ;
  // Countdown clock — mirrors AFL + netball. The shared coach mental
  // model is "how much period is left", not "how much has elapsed".
  // Hooter fires when remainingMs hits 0 (see the periodMs check
  // above). Clamps to 0 so we never display a negative readout if
  // elapsedMs overshoots between the tick and the hooter firing.
  const remainingMs = Math.max(0, periodSeconds * 1000 - elapsedMs);
  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  const clockReadout = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  const hasStickyBottom
    = isPeriodActive || isAtQbreak || isAtFinalQ || state.finalised;
  // Score dock only opens when scoring is on AND the period is
  // live AND a field player is selected. Mirrors AFL's `canScore`
  // gate. For U6/U7 (track_scoring off by default) a field tap
  // still selects but shows a swap-only hint banner instead of
  // the dock — coach can't accidentally credit a try in a game
  // that isn't tracking scores.
  const scoreDockVisible
    = trackScoring
    && isPeriodActive
    && Boolean(selectedPlayer)
    && selectedOnField;
  const selectionHintVisible
    = !trackScoring
    && isPeriodActive
    && Boolean(selectedPlayer);
  const stickyPb
    = scoreDockVisible
      ? "pb-[calc(13rem+env(safe-area-inset-bottom))]"
      : hasStickyBottom
        ? "pb-[calc(7rem+env(safe-area-inset-bottom))]"
        : "";

  // Action-sheet target lookup
  const actionSheetPlayer = useMemo(
    () => squad.find((p) => p.id === actionSheetPlayerId) ?? null,
    [actionSheetPlayerId, squad],
  );
  const actionSheetOnField
    = actionSheetPlayerId != null
    && (state.lineup
      ? state.lineup.forwards.includes(actionSheetPlayerId)
        || state.lineup.backs.includes(actionSheetPlayerId)
      : false);
  const actionSheetVest
    = actionSheetPlayerId != null ? vestByPlayer[actionSheetPlayerId] ?? null : null;
  const actionSheetInjured
    = actionSheetPlayerId != null && injuredSet.has(actionSheetPlayerId);
  const actionSheetLoaned
    = actionSheetPlayerId != null && loanedSet.has(actionSheetPlayerId);

  return (
    <div ref={liveRootRef} className={`space-y-3 ${stickyPb}`.trim()}>
      <LiveTopBar
        exitHref={exitHref}
        game={game}
        onHelp={handleOpenWalkthrough}
      />
      {walkthroughOpen && (
        <WalkthroughModal
          steps={walkthroughSteps}
          skipWelcome={walkthroughSkipWelcome}
          onClose={handleWalkthroughClose}
        />
      )}

      {error && <InlineAlert kind="danger">{error}</InlineAlert>}

      {/* Next-sub indicator — mirrors AFL's SwapCard. Renders the
          full bench rotation (one swap per bench player) with
          "Do all N swaps" so the whole bench cycles in one tap. */}
      {isPeriodActive && nextSubSuggestions.length > 0 && (
        <LeagueNextSubCard
          suggestions={nextSubSuggestions}
          msUntilDue={msUntilDue}
          subIntervalMs={subIntervalMs}
          due={subIsDue}
          onApplyAll={() => void handleApplyAllSubs()}
          onApplyOne={(swap) =>
            void applySwap(swap.off.playerId, swap.on.playerId)
          }
          pending={pending}
          playerById={new Map(squad.map((p) => [p.id, p]))}
        />
      )}

      {/* Field + bench — hidden at full time (mirrors AFL's
          `!isFinished` gate around its Field + Bench fragment). Once
          the period count is reached, LeagueFullTimeReview takes the
          space below for score reconcile and after finalise the
          LeagueGameSummaryCard carries the share text. The on-pitch
          layout doesn't carry any signal at that point and just
          pads the screen with stale state. */}
      {!isFinished && state.lineup && (() => {
        // Build the swap maps from the suggester output so each tile
        // can render its own visual indicator (amber for going-off,
        // brand-blue for coming-on, +pair number when there's more
        // than one rotation pending). Hidden when the coach has a
        // player tap-selected so the selection ring doesn't compete
        // with the swap badges. Mirrors AFL `LiveGame.tsx`'s
        // `swapOffs` / `swapOns` build.
        const swapOffs = new Map<string, number>();
        const swapOns = new Map<string, number>();
        if (!selectedPlayer) {
          nextSubSuggestions.forEach((s, i) => {
            swapOffs.set(s.off.playerId, i + 1);
            swapOns.set(s.on.playerId, i + 1);
          });
        }
        const totalSwapPairs = nextSubSuggestions.length;
        return (
        <>
          <LeagueField
            players={fieldPlayers}
            forwardPlayers={forwardPlayers}
            backPlayers={backPlayers}
            onFieldSize={game.on_field_size}
            vestRequirements={ageGroup.vestRequirements}
            triesByPlayer={state.playerTries}
            totalMsByPlayer={totalMsByPlayer}
            zoneMsByPlayer={zoneMsByPlayer}
            vestByPlayer={vestByPlayer}
            conversionByPlayer={conversionByPlayer}
            kickoffTakerIds={kickoffTakerIds}
            injuredIds={injuredSet}
            loanedIds={loanedSet}
            selectedPlayerId={selectedPlayerId}
            swapOffs={swapOffs}
            totalSwapPairs={totalSwapPairs}
            chipModes={chipModes}
            onPlayerClick={handlePlayerTapMaybeSwap}
            onPlayerLongPress={handlePlayerLongPress}
            onVacantSpotTap={
              // Wire the empty-slot tap whenever ANY player is
              // selected — bench OR field. The handler routes:
              //   bench-selected → lineup_set into the tapped zone
              //   field-selected → position_change to the tapped
              //                    zone (no-op if same zone)
              // Steve 2026-05-23 short-squad fix.
              selectedPlayer ? handleVacantSpotTap : undefined
            }
            vacantSpotPrimed={Boolean(selectedPlayer)}
            disabled={pending}
          />
          <LeagueBenchStrip
            players={benchPlayers}
            triesByPlayer={state.playerTries}
            totalMsByPlayer={totalMsByPlayer}
            zoneMsByPlayer={zoneMsByPlayer}
            vestByPlayer={vestByPlayer}
            conversionByPlayer={conversionByPlayer}
            kickoffTakerIds={kickoffTakerIds}
            injuredIds={injuredSet}
            loanedIds={loanedSet}
            selectedPlayerId={selectedPlayerId}
            swapOns={swapOns}
            totalSwapPairs={totalSwapPairs}
            chipModes={chipModes}
            onPlayerClick={handlePlayerTapMaybeSwap}
            onPlayerLongPress={handlePlayerLongPress}
            disabled={pending}
          />
        </>
        );
      })()}

      {/* Plan-NEXT-period entry (F2 / ROTPLAN-02): in the final
          rotation window of the period (inFinalWindow, derived from the
          live clock) and not on the last period, the coach can open the
          SAME shared planner on the NEXT period's tab and build its
          forwards/backs lineup so the break starts pre-seeded. A "Next
          period ready" badge + Clear appears once pinned. Mirrors AFL +
          netball. */}
      {isPeriodActive && inFinalWindow && !isLastPeriod && (
        <div className="flex items-center justify-between gap-2 px-1">
          <SFButton
            variant="ghost"
            size="sm"
            data-testid="plan-next-period-entry"
            onClick={() => setPlanNextOpen(true)}
            icon={<SFIcon.whistle />}
          >
            {hasPinnedNextPeriod
              ? `Edit ${periodLabel} ${state.currentQuarter + 1} plan`
              : `Plan ${periodLabel} ${state.currentQuarter + 1}`}
          </SFButton>
          {hasPinnedNextPeriod && (
            <div className="flex items-center gap-2">
              <span
                data-testid="planned-next-period-badge"
                className="font-mono text-[10px] font-bold uppercase tracking-micro text-brand-700"
              >
                Next period ready
              </span>
              <button
                type="button"
                data-testid="plan-next-clear"
                onClick={() => clearPlannedRotation()}
                className="font-mono text-[10px] font-bold uppercase tracking-micro text-ink-mute transition-colors hover:text-ink"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {kickoffNeededForPeriod
        && !kickoffSkippedRef.current.has(state.currentQuarter)
        && kickoffSkippedTick >= 0 && (
          <KickoffPicker
            auth={auth}
            gameId={game.id}
            squad={squad}
            events={thisGameEvents}
            seasonEvents={seasonEvents}
            period={state.currentQuarter}
            onSkip={() => {
              kickoffSkippedRef.current.add(state.currentQuarter);
              setKickoffSkippedTick((n) => n + 1);
            }}
          />
        )}

      {selectedPlayer && selectedOnBench && isPeriodActive && (
        <p className="rounded-md bg-brand-50 px-3 py-2 text-xs text-brand-800">
          Selected from bench: <strong>{selectedPlayer.full_name}</strong> —
          tap a player on the field to swap them on.{" "}
          <button
            type="button"
            onClick={handleClearSelection}
            className="text-brand-700 underline"
          >
            Cancel
          </button>
        </p>
      )}

      {isAtQbreak && (
        <section className="rounded-xl border border-brand-500/40 bg-brand-50 p-4 shadow-card">
          <p className="mb-3 text-sm font-medium text-ink">
            {periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)}{" "}
            {state.currentQuarter} done. Score:{" "}
            <strong>{state.teamScore.points}</strong> –{" "}
            <strong>{state.opponentScore.points}</strong>.
          </p>
          {/* Planned-seed banner (F2 / D-15): the coach pinned this
              upcoming period's lineup during the final window — surface
              that so they know Start will open pre-seeded (the seed is
              applied, reconciled, in handleStartNextPeriod). */}
          {hasPinnedNextPeriod && (
            <p
              data-testid="planned-seed-banner"
              className="mb-2 font-mono text-[10px] font-bold uppercase tracking-micro text-brand-700"
            >
              Pre-filled from your planned {periodLabel}{" "}
              {state.currentQuarter + 1} lineup
            </p>
          )}
          <SFButton
            onClick={() => setStartPeriodConfirmOpen(true)}
            disabled={pending}
            variant="accent"
            size="lg"
            full
          >
            Ready for {periodLabel} {state.currentQuarter + 1}
          </SFButton>

          {/* Manage availability (AVAIL-02 / B2) — mirrors AFL
              QuarterBreak + netball NetballQuarterBreak:
                • Add arrived player: a squad member who wasn't
                  available pre-game turns up at the break. Reuses the
                  canonical addLateArrival writer.
                • Mark a player out: an on-field player has to leave.
                  Forces a bench-replacement pick so the field doesn't
                  go short; recorded with reason:"out" so display can
                  tell an "out" from a genuine injury. */}
          {isAdmin && (
            <div className="mt-3 border-t border-brand-500/20 pt-3">
              <p className="text-xs font-semibold text-ink">
                Manage availability
              </p>
              <p className="mt-0.5 text-xs text-ink-mute">
                Add a player who turned up at the break, or take one out
                of the game (a replacement comes on so the field stays
                full).
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAddArrivedPickerOpen(true)}
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink-dim transition-colors hover:border-brand-500/40 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60"
                >
                  <span aria-hidden>+</span>
                  Add arrived player
                </button>
                <button
                  type="button"
                  onClick={() => setMarkOutPickerOpen(true)}
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink-dim transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger disabled:opacity-60"
                >
                  <span aria-hidden>+</span>
                  Mark a player out
                </button>
                <button
                  type="button"
                  onClick={() => setBreakInjuredPickerOpen(true)}
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink-dim transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger disabled:opacity-60"
                >
                  <span aria-hidden>+</span>
                  Mark injured
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {isAtQbreak && vestRequired && state.lineup && (
        <VestAssignmentCard
          auth={auth}
          gameId={game.id}
          squad={squad}
          onFieldPlayerIds={[
            ...state.lineup.forwards,
            ...state.lineup.backs,
          ]}
          events={thisGameEvents}
          ageGroup={ageGroup}
          period={periodForAssignment}
        />
      )}

      {/* Pre-finalise review — full per-period reconcile + finalise
          button. Mirrors AFL `FullTimeReview` shape: per-side score
          boxes, per-period table, finalise CTA. */}
      {isAtFinalQ && (
        <LeagueFullTimeReview
          auth={auth}
          gameId={game.id}
          state={state}
          events={thisGameEvents}
          ageGroup={ageGroup}
          trackScoring={trackScoring}
          kickingAllowed={kickingAllowed}
          finalisedElapsedMs={elapsedMs}
          teamName={teamName}
          opponentName={game.opponent || "Opponent"}
          // Inline score-edit chips — same callbacks the live
          // scorebug uses at full-time review (scorebug stays at
          // the bottom; this surface duplicates them inside the
          // card so coaches don't have to scroll). Gated on
          // `isAtFinalQ` (the parent already enforces that).
          onTeamTry={() => setScorerPickerOpen(true)}
          onTeamConversion={
            kickingAllowed ? handleOpenConversionDialog : undefined
          }
          onOpponentTry={handleRecordOpponentTry}
          onOpponentConversion={
            kickingAllowed ? handleRecordOpponentConversion : undefined
          }
          onUndo={
            state.teamScore.points > 0 || state.opponentScore.points > 0
              ? handleUndoScore
              : undefined
          }
          scorePending={pending}
        />
      )}

      {/* Post-finalise share card — selectable share text + "Copy
          for group chat". Mirrors AFL `GameSummaryCard`. */}
      {state.finalised && (
        <LeagueGameSummaryCard
          state={state}
          events={thisGameEvents}
          squad={squad}
          trackScoring={trackScoring}
          teamName={teamName}
          opponentName={game.opponent || "Opponent"}
          finalisedElapsedMs={elapsedMs}
          showArrivalPulse
        />
      )}

      <LiveAdminUtilityRow
        candidates={lateArrivalCandidates}
        onLateArrival={handleAddLateArrival}
        lateArrivalPending={pending}
        isAdmin={isAdmin}
        auth={auth}
        gameId={game.id}
        extra={
          // Game settings sheet: sub interval, players on field,
          // unbroken-period rule. Always shown for admins — mirrors
          // AFL which always shows LiveGameSettingsButton.
          isAdmin ? (
            <LeagueGameSettingsButton
              auth={auth}
              gameId={game.id}
              subIntervalSeconds={subIntervalSeconds ?? 300}
              currentOnFieldSize={game.on_field_size}
              minOnFieldSize={ageGroup.minOnFieldSize}
              maxOnFieldSize={ageGroup.maxOnFieldSize}
              onFieldPlayers={fieldPlayers}
              enforceUnbrokenPeriods={enforceUnbrokenPeriods}
              trackZoneTime={trackZoneTime}
              currentQuarter={state.currentQuarter}
              elapsedMs={elapsedMs}
            />
          ) : null
        }
      />

      {/* End-period-early lives on the scorebug clock pill now —
          the standalone link button has been folded into the
          pause-aware affordance pattern from AFL's `GameHeader`. */}

      {/* Selection hint — non-scoring sports (U6/U7 tag rugby) get
          this banner instead of the score dock. Tells the coach
          tapping a player is enough to start a swap; no scoring
          affordance because the laws don't track points here. */}
      {selectionHintVisible && selectedPlayer && (
        <p className="rounded-sm bg-brand-50 px-3 py-2 text-xs text-brand-800">
          {selectedOnField
            ? "Tap a bench player to swap them in, or tap the selected player again to cancel."
            : "Tap a field tile to swap this player in, or tap them again to cancel."}
        </p>
      )}

      {/* Score-recording dock — appears when a field player is selected. */}
      {scoreDockVisible && selectedPlayer && (
        <ScoreRecordingDock
          heading={
            <>
              Record score for{" "}
              <span className="text-brand-700">
                {selectedPlayer.full_name}
              </span>
            </>
          }
          onCancel={handleClearSelection}
          actions={
            <div className="space-y-2">
              {/* Single + Try button. The conversion dialog auto-
                  opens after the try lands at U8+, since you can't
                  have a conversion without a try first. */}
              <button
                type="button"
                onClick={handleRecordTryFromDock}
                disabled={pending}
                className="w-full rounded-sm bg-brand-600 py-3 font-mono text-base font-bold uppercase tracking-micro text-white shadow-card transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
              >
                + Try
              </button>
              <p className="text-center text-[11px] text-ink-mute">
                Or tap a bench player to swap{" "}
                <strong>{selectedPlayer.full_name}</strong> off.
              </p>
            </div>
          }
        />
      )}

      {/* Sticky-bottom scorebug + undo strip. */}
      {hasStickyBottom && (
        <LiveStickyScoreBar
          scorebug={
            <LeagueScoreBug
              teamName={teamName}
              opponentName={game.opponent || "Opponent"}
              teamScore={state.teamScore}
              opponentScore={state.opponentScore}
              periodLabel={periodLabel}
              periodLabelPlural={periodLabelPlural}
              currentPeriod={state.currentQuarter}
              periodCount={ageGroup.periodCount}
              clockReadout={clockReadout}
              quarterEnded={state.quarterEnded}
              trackScoring={trackScoring}
              onTeamTry={
                // Allow recording during live play AND at quarter
                // break + final-quarter review — Steve 2026-05-18:
                // buzzer-beater tries land after the hooter, and
                // coaches need to log them post-whistle. Also lets
                // coaches correct a missed score at the break.
                (isPeriodActive || isAtQbreak || isAtFinalQ)
                  ? () => setScorerPickerOpen(true)
                  : undefined
              }
              onTeamConversion={
                (isPeriodActive || isAtQbreak || isAtFinalQ) && kickingAllowed
                  ? handleOpenConversionDialog
                  : undefined
              }
              onOpponentTry={
                (isPeriodActive || isAtQbreak || isAtFinalQ)
                  ? handleRecordOpponentTry
                  : undefined
              }
              onOpponentConversion={
                (isPeriodActive || isAtQbreak || isAtFinalQ) && kickingAllowed
                  ? handleRecordOpponentConversion
                  : undefined
              }
              kickingAllowed={kickingAllowed}
              pending={pending}
              running={running}
              onClockTap={isPeriodActive ? handleClockTap : undefined}
              onEndPeriodEarly={
                isPeriodActive ? () => setEndQConfirmOpen(true) : undefined
              }
            />
          }
          undoStrip={
            (state.teamScore.points > 0 || state.opponentScore.points > 0)
              && !state.finalised
              ? (
                <div className="mx-4 mb-1 flex items-center justify-end px-3">
                  <button
                    type="button"
                    onClick={handleUndoScore}
                    disabled={pending}
                    className="text-xs font-medium text-ink-dim underline-offset-2 hover:text-ink hover:underline disabled:opacity-60"
                  >
                    Undo last score
                  </button>
                </div>
              )
              : undefined
          }
        />
      )}

      {/* Plan-NEXT-period planner (F2). Same shared GamePlanModal, opened
          on the NEXT period's tab (initialPeriodIndex=1 — period[0] mirrors
          the current field, period[1] is the projected next period). On pin
          we store the edited next-period forwards/backs/bench in the SAME
          plannedRotation slice (nextPeriod* fields); handleStartNextPeriod
          seeds the lineup from it (reconciled) at the explicit Start tap. */}
      {planNextOpen && state.lineup && (() => {
        const currentGroups: Record<string, string[]> = {
          forwards: state.lineup.forwards,
          backs: state.lineup.backs,
        };
        const currentBench = state.lineup.bench;

        const initialPlan = projectUpcomingRotation({
          sport: "rugby_league",
          ageGroup,
          players: gamePlanPlayers,
          onFieldSize: game.on_field_size,
          seed: 7,
          chipModeByKey: chipModes,
          fromPeriodIndex: Math.max(0, state.currentQuarter - 1),
          currentGroups,
          currentBench,
        });

        return (
          <GamePlanModal
            sport="rugby_league"
            ageGroup={ageGroup}
            players={gamePlanPlayers}
            onFieldSize={game.on_field_size}
            teamName={teamName}
            opponentName={game.opponent}
            seasonEvents={seasonEvents}
            chipModeByKey={chipModes}
            initialPlan={initialPlan}
            initialPeriodIndex={1}
            pinLabel={`Pin ${periodLabel} ${state.currentQuarter + 1} plan`}
            onPin={(plan) => {
              // The coach edited the NEXT period. Find it by absolute
              // period number (robust to a Reshuffle that rerolls the
              // whole-game projection), then pin its groups + bench.
              const targetPeriodNum = state.currentQuarter + 1;
              const next =
                plan.periods.find((p) => p.period === targetPeriodNum) ??
                plan.periods[1];
              if (!next) {
                setPlanNextOpen(false);
                return;
              }
              const nextPeriodGroups: Record<string, string[]> = {};
              for (const g of next.groups) {
                nextPeriodGroups[g.groupId] = g.playerIds;
              }
              // Preserve any existing F1 fields on the same game's pin
              // (the two features share one slice).
              const prior =
                plannedRotation && plannedRotation.gameId === game.id
                  ? plannedRotation
                  : null;
              setPlannedRotation({
                ...(prior ?? {}),
                gameId: game.id,
                nextPeriodIndex: state.currentQuarter,
                nextPeriodGroups,
                nextPeriodBench: next.bench,
              });
            }}
            onClose={() => setPlanNextOpen(false)}
          />
        );
      })()}

      {/* "Ready for H/Q{n}" confirmation — mirrors AFL's StartQuarterModal.
          Opens when the coach taps the quarter-break CTA. The coach
          confirms by tapping "Start {H|Q}{n}" when the hooter goes.
          Cancelling returns to the break view with no server writes. */}
      {startPeriodConfirmOpen && (
        <StartQuarterModal
          quarter={state.currentQuarter + 1}
          periodLabel={periodLabel as "quarter" | "half" | "period"}
          loading={pending}
          onStart={() => {
            setStartPeriodConfirmOpen(false);
            void handleStartNextPeriod();
          }}
          onCancel={() => setStartPeriodConfirmOpen(false)}
        />
      )}

      {endQConfirmOpen && (
        <ManualEndQuarterConfirm
          quarter={state.currentQuarter}
          onConfirm={() => {
            setEndQConfirmOpen(false);
            // Credit the FULL half / quarter to on-field players on
            // a manual end-early, NOT the live elapsed time. Mirrors
            // AFL's `handleEndQuarter({ creditFullQuarter: true })`:
            // if the coach hits "End H2" after only 5 minutes of a
            // 10-minute half (paused clock, real game ran on, etc.)
            // the players actually played the whole half — the
            // event log should reflect that, not the under-counted
            // scaled-clock reading. The auto-hooter path above
            // already passes periodMs; the manual path used to pass
            // `elapsedMs` (live elapsed), under-crediting time-on
            // and breaking the F/C/B zone-time bar + unbroken-period
            // compliance check.
            void endQuarterAtClient(periodSeconds * 1000);
          }}
          onCancel={() => setEndQConfirmOpen(false)}
          playersLabel="on-field"
          // U10–U12 plays halves; U6–U9 plays quarters. The picker's
          // age-group config carries the right label so the modal
          // reads "End H2" instead of "End Q2" at U10+.
          periodLabel={periodLabel}
        />
      )}

      {subIsDue && subAckedAtBaseMs !== lastSwapOrPeriodElapsed && (
        <SubDueModal
          onAcknowledge={() => setSubAckedAtBaseMs(lastSwapOrPeriodElapsed)}
        />
      )}

      {conversionDialogOpen && state.lineup && (
        <RecordConversionDialog
          auth={auth}
          gameId={game.id}
          squad={squad}
          onFieldPlayerIds={[
            ...state.lineup.forwards,
            ...state.lineup.backs,
          ]}
          events={thisGameEvents}
          quarter={state.currentQuarter}
          elapsedMs={elapsedMs}
          onClose={() => setConversionDialogOpen(false)}
        />
      )}

      {/* Force-vest-replace modal: shown when an FR/DH wearer leaves
          the field (sub, injury, loan) until the coach picks a
          replacement OR explicitly dismisses for the period. */}
      {forceVestReplaceOpen && vestRequired && state.lineup && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl bg-surface p-4 shadow-modal sm:rounded-2xl">
            <header className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">
                  Replace {missingVestWearer === "fr" ? "First Receiver" : missingVestWearer === "dh" ? "Dummy Half" : "vest"}
                </h2>
                <p className="text-xs text-ink-mute">
                  The vest wearer is no longer on the field. Pick a
                  replacement to continue.
                </p>
              </div>
              <button
                type="button"
                onClick={handleForceVestDismiss}
                className="rounded-md px-2 py-1 text-sm text-ink-mute hover:bg-surface-alt"
              >
                Later
              </button>
            </header>
            <VestAssignmentCard
              auth={auth}
              gameId={game.id}
              squad={squad}
              onFieldPlayerIds={[
                ...state.lineup.forwards,
                ...state.lineup.backs,
              ]}
              events={thisGameEvents}
              ageGroup={ageGroup}
              period={state.currentQuarter || 1}
              onDone={() => setForceVestReplaceOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Own-team scorer picker — invoked by scorebug +T. */}
      {scorerPickerOpen && (
        <LeagueScorerPicker
          onFieldPlayers={fieldPlayers}
          pending={pending}
          onCancel={() => setScorerPickerOpen(false)}
          onPick={(pid) => {
            setScorerPickerOpen(false);
            void recordTryForPlayer(pid);
          }}
        />
      )}

      {/* Long-press action sheet — shared `LockModal` (same modal AFL
          uses) so coaches running both sports get identical UX. RL
          omits the lock-to-field / lock-to-zone buttons (no zones to
          lock to and the vest mechanic covers "always on"). A
          dedicated "Replace First Receiver / Dummy Half" button
          surfaces for current vest wearers via the optional
          vestReplaceLabel prop. */}
      {actionSheetPlayer && (
        <LockModal
          player={actionSheetPlayer}
          currentLock={null}
          currentZone={null}
          isInjured={actionSheetInjured}
          isLoaned={actionSheetLoaned}
          seasonLoanMins={0}
          squadLoanMins={0}
          insight={
            <PlayerInsightSummary input={buildInsightInput(actionSheetPlayer.id)} />
          }
          onUnlock={() => setActionSheetPlayerId(null)}
          onToggleInjury={() =>
            void handleToggleInjury(
              actionSheetPlayer.id,
              !actionSheetInjured,
            )
          }
          onToggleLoan={() =>
            void handleToggleLoan(
              actionSheetPlayer.id,
              !actionSheetLoaned,
            )
          }
          onSwitch={() => {
            setActionSheetPlayerId(null);
            setSelectedPlayerId(actionSheetPlayer.id);
          }}
          vestReplaceLabel={
            actionSheetVest === "fr"
              ? "First Receiver"
              : actionSheetVest === "dh"
                ? "Dummy Half"
                : undefined
          }
          onReplaceVest={
            actionSheetVest ? handleReplaceVestFromActionSheet : undefined
          }
          // "Move to {Forwards/Backs}" hidden from the long-press
          // menu (Steve 2026-05-19) — coaches handle forward/back
          // re-ratios manually via tap-to-swap.
          onClose={() => setActionSheetPlayerId(null)}
        />
      )}

      {/* Break-time Add-arrived picker — opens from the
          "+ Add arrived player" button on the break surface. Lists
          squad members who weren't available pre-game (not placed in
          the lineup). Tapping one fires addLateArrival. */}
      {addArrivedPickerOpen && (
        <SlotFillSheet
          slotLabel="player"
          titleVerb="Add arrived"
          subtitle="Pick a squad member who's turned up at the break. They'll join the bench and the next period can work them in."
          emptyMessage="Everyone in the squad is already in the game."
          candidates={arrivalCandidates}
          onPick={(pid) => void handleAddArrivedAtBreak(pid)}
          onCancel={() => setAddArrivedPickerOpen(false)}
        />
      )}

      {/* Break-time Mark-out picker — opens from "+ Mark a player out".
          Lists on-field players. Picking one forces a bench-replacement
          pick (InjuryReplacementModal) so the field doesn't go short;
          recorded with reason:"out". */}
      {markOutPickerOpen && (
        <SlotFillSheet
          slotLabel="player"
          titleVerb="Mark out"
          subtitle="Pick the on-field player who has to leave. A bench player comes on so the field stays full."
          emptyMessage="No on-field players to take out."
          candidates={markOutCandidates}
          onPick={handleMarkOutPick}
          onCancel={() => setMarkOutPickerOpen(false)}
        />
      )}

      {/* Break-time Mark-injured picker — opens from "+ Mark injured".
          Lists healthy squad players (on field or bench). Fires a plain
          markInjury flag (no forced replacement at the break; the
          next-period rotation reshuffles around them). */}
      {breakInjuredPickerOpen && (
        <SlotFillSheet
          slotLabel="player"
          titleVerb="Mark injured"
          subtitle="Pick a player to mark as injured / leaving early. Tap their chip to bring them back."
          emptyMessage="Everyone is already injured or lent."
          candidates={squad
            .filter((p) => !injuredSet.has(p.id) && !loanedSet.has(p.id))
            .map((p) => ({
              id: p.id,
              name: p.full_name,
              jerseyNumber: p.jersey_number,
            }))}
          onPick={(pid) => void handleBreakInjured(pid)}
          onCancel={() => setBreakInjuredPickerOpen(false)}
        />
      )}

      {/* Break-time Mark-out forced-replacement — reuses the shared
          InjuryReplacementModal (DO NOT fork). Pick the bench player who
          comes on; "without replacement" leaves the field short. Both
          paths record the out player with reason:"out". */}
      {markOutReplacement && (() => {
        const outPlayer = squad.find(
          (p) => p.id === markOutReplacement.outId,
        );
        if (!outPlayer) return null;
        return (
          <InjuryReplacementModal
            injuredPlayer={outPlayer}
            zone={markOutReplacement.zone}
            candidates={markOutReplacementCandidates}
            onPickReplacement={(rid) =>
              void handleMarkOutReplacement(
                markOutReplacement.outId,
                rid,
                markOutReplacement.zone,
              )
            }
            onSkipReplacement={() =>
              void handleMarkOutDirect(markOutReplacement.outId)
            }
            onCancel={() => setMarkOutReplacement(null)}
          />
        );
      })()}

      {/* Injury replacement picker — shown when a field player is marked
          injured and there are swappable bench players. Mirrors AFL's
          InjuryReplacementModal pattern: fires markInjury + swap so the
          replacement lands at the exact field slot the injured player
          vacated. "Mark injured without replacement" leaves the slot
          visually empty (INJ badge still on the field tile). */}
      {injuryReplacementModal && (() => {
        const injPlayer = squad.find(
          (p) => p.id === injuryReplacementModal.injuredId,
        );
        if (!injPlayer) return null;
        // Candidates = swappable bench players sorted least-played first
        // (same sort AFL uses so the most-owed player is top of the list).
        const candidates: InjuryReplacementCandidate[] = swappableBench
          .map((p) => ({
            player: p,
            totalMs: totalMsByPlayer[p.id] ?? 0,
          }))
          .sort((a, b) => a.totalMs - b.totalMs);
        return (
          <InjuryReplacementModal
            injuredPlayer={injPlayer}
            zone={injuryReplacementModal.zone}
            candidates={candidates}
            onPickReplacement={(rid) =>
              void handleInjuryReplacement(
                injuryReplacementModal.injuredId,
                rid,
                injuryReplacementModal.zone,
              )
            }
            onSkipReplacement={() =>
              void handleInjuryMarkOnly(injuryReplacementModal.injuredId)
            }
            onCancel={() => setInjuryReplacementModal(null)}
          />
        );
      })()}

      {/* First-tap long-press discovery hint. */}
      <LongPressHint enabled={isPeriodActive} />
    </div>
  );
}
