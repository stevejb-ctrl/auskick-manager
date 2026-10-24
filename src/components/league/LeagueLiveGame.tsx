"use client";

// ─── LeagueLiveGame ──────────────────────────────────────────
// Rugby-league live-game orchestrator. Mirrors AFL `LiveGame.tsx`
// and netball `NetballLiveGame.tsx` end-to-end so coaches who run
// teams in multiple sports get a consistent live-game shell —
// shared `LiveTopBar` / `LiveStickyScoreBar` / `LiveAdminUtilityRow`
// chrome wrapped around RL-specific surfaces.
//
// In-game writes are optimistic (useOptimisticEvents): a try, an undo, a
// sub or a move shows the moment it's tapped and the screen replays the
// server's events plus the ones on their way, as soccer's and touch's
// do. The shared live chrome (useLiveChrome) is AFL's undo strip flash,
// tap-tap swap confirm and toast, and lent minutes on the long-press
// sheet (UX audit 23 Oct 2026, "Drift from AFL").

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SFButton, SFIcon } from "@/components/sf";
import { LiveTopBar } from "@/components/live/LiveTopBar";
import { ZoneTimeLegend } from "@/components/live/ZoneTimeLegend";
import { LiveAdminUtilityRow } from "@/components/live/LiveAdminUtilityRow";
import { LeagueGameSettingsButton } from "./LeagueGameSettingsButton";
import { ManualEndQuarterConfirm } from "@/components/live/ManualEndQuarterConfirm";
import { ClockMenu } from "@/components/live/ClockMenu";
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
import { SubDueBanner } from "@/components/live/SubDueBanner";
import { subDueBannerShows } from "@/components/live/SubDue";
import { playSubDueBeep, useSubDueAudioUnlock } from "@/lib/live/subDueBeep";
import { hapticTap } from "@/lib/haptics";
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
import { useOptimisticEvents } from "@/lib/live/useOptimisticEvents";
import { liveEvents, optimisticUndo } from "@/lib/live/optimisticEvents";
import { useLiveChrome } from "@/components/live/useLiveChrome";
import { computePeriodClockMs } from "@/lib/live/periodClock";
import { clockPauseInput } from "@/lib/live/clockPause";
import { useEventPeriodPause } from "@/lib/live/useClockPause";
import { resolveLeagueSubAnchorElapsed } from "@/lib/sports/rugby_league/subAnchor";
import { finaliseLeagueGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/league-actions";
import { LeagueField } from "./LeagueField";
import { LeagueBenchStrip } from "./LeagueBenchStrip";
import { LeagueScoreBug } from "./LeagueScoreBug";
import { LeagueNextSubCard } from "./LeagueNextSubCard";
import { UnbrokenPeriodWarning } from "./UnbrokenPeriodWarning";
import { LeagueScorerPicker } from "./LeagueScorerPicker";
import { LeagueFullTimeReview } from "./LeagueFullTimeReview";
import { LeagueGameSummaryCard } from "./LeagueGameSummaryCard";
import { VestAssignmentCard } from "./VestAssignmentCard";
import { LeagueBreak } from "./LeagueBreak";
import { RecordConversionDialog } from "./RecordConversionDialog";
import { KickoffPicker } from "./KickoffPicker";
import { currentVests, type VestType } from "@/lib/sports/rugby_league/vests";
import {
  conversionTryEventId,
  playerConversionStatusInCycle,
  kickoffTakers,
  kickoffRecordedForPeriod,
  RUGBY_SCORE_EVENT_TYPES,
} from "@/lib/sports/rugby_league/kicks";
import {
  leagueSlotsNow,
  playedZoneMsByPeriod,
  playerMsOnField,
  playerZoneMsOnField,
  replayRugbyGame,
  rugbyPoints,
  rugbyScoreWhat,
  rugbyScoreWords,
  suggestLeagueSubs,
  unbrokenPeriodsRequired,
  type LeagueSubLaws,
} from "@/lib/sports/rugby_league/fairness";
import { getSportConfig, type RugbySport } from "@/lib/sports/registry";
import { PlayerInsightSummary } from "@/components/live/PlayerInsightSummary";
import { useLiveGame } from "@/lib/stores/liveGameStore";
import {
  projectUpcomingRotation,
  withPinnedPeriods,
  hasPinnedPeriod,
  consumePeriodPin,
  availablePlayersForPlan,
  clearPeriodToBench,
  type GamePlan,
} from "@/lib/game-plan";
import type { AgeGroupConfig } from "@/lib/sports/types";
import type { Game, GameEvent, LeagueLineup, LiveAuth, Player } from "@/lib/types";
import type { LeagueGameState } from "@/lib/sports/rugby_league/fairness";

import {
  assignLeaguePositionLabels,
  assignLeaguePositions,
  restrictedMisfits,
  withLeagueSlots,
} from "@/lib/sports/rugby_league/engine";
import { linePositionOrder } from "@/lib/sports/rugby/fieldPositions";
import { Modal } from "@/components/ui/Modal";
import { periodLabels } from "@/lib/sports";
import { seasonLoanMinutes } from "@/lib/fairness";
import { centreVest } from "@/lib/sports/rugby/zoneTime";
interface LeagueLiveGameProps {
  auth: LiveAuth;
  /** The team's rugby sport: its own config, points and rules. */
  sport: RugbySport;
  game: Game;
  teamName: string;
  squad: Player[];
  ageGroup: AgeGroupConfig;
  periodSeconds: number;
  subIntervalSeconds: number | null;
  /**
   * Game seconds per real second (games.clock_multiplier): 1 for a real
   * game, 8 for the demo. Scales the half clock, so the hooter, sub
   * timer and every saved elapsed_ms run on game time — the same rule
   * as AFL's LiveGame and netball (computePeriodClockMs).
   */
  clockMultiplier?: number;
  /** Team-level scoring toggle (sport-agnostic). U6/U7 default off; U8+ default on. */
  trackScoring: boolean;
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
  /** How we play for the league suggester (UX plan 5.6). */
  leaguePlaybook?: import("@/lib/sports/rugby_league/engine").LeaguePlaybookInput;
  isAdmin: boolean;
  exitHref: string;
}

/** A league player's spot, as the injury / mark-out modal names it. */
const LEAGUE_SPOT_LABEL: Record<"forward" | "back", string> = {
  forward: "Forward",
  back: "Back",
};

export function LeagueLiveGame({
  auth,
  sport,
  game,
  teamName,
  squad,
  ageGroup,
  periodSeconds,
  subIntervalSeconds,
  clockMultiplier = 1,
  trackScoring,
  trackZoneTime,
  state: serverState,
  thisGameEvents: serverEvents,
  seasonEvents,
  chipModes,
  leaguePlaybook,
  isAdmin,
  exitHref,
}: LeagueLiveGameProps) {
  const router = useRouter();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  // Empty spot tapped with nobody selected: the bench picker is open.
  const [fillSpotZone, setFillSpotZone] = useState<"forward" | "back" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The server's events, then the writes it hasn't returned yet, and the
  // game they replay to (the server's own replay while nothing's pending).
  const { events: thisGameEvents, write } = useOptimisticEvents(serverEvents, { gameId: game.id, onError: setError });
  const state = useMemo(
    () => (thisGameEvents === serverEvents ? serverState : replayRugbyGame(thisGameEvents, rugbyPoints(sport))),
    [thisGameEvents, serverEvents, serverState, sport],
  );
  const isPeriodActive = state.currentQuarter >= 1 && !state.quarterEnded && !state.finalised;
  const isAtFinalQ = state.quarterEnded && state.currentQuarter >= ageGroup.periodCount && !state.finalised;
  // Mirrors AFL's `isFinished` — covers both the post-final-period
  // review phase (LeagueFullTimeReview is up, coach is reconciling
  // scores) and the post-finalise phase (LeagueGameSummaryCard with
  // "Copy for group chat"). Used to hide the field + bench layout
  // once the game is over, and the late-arrival offer.
  const isFinished = state.finalised || isAtFinalQ;
  const [endQConfirmOpen, setEndQConfirmOpen] = useState(false);
  // ── Walkthrough state (mirrors AFL + netball) ──
  // First-visit auto-open uses `league-walkthrough-seen` in
  // localStorage so a coach doesn't see the welcome again on
  // subsequent live-game opens. The "?" button in LiveTopBar
  // re-opens the steps (skipWelcome) on demand.
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  // The clock pill opens the clock menu (pause / resume / end now).
  const [clockMenuOpen, setClockMenuOpen] = useState(false);
  const [subAckedAtBaseMs, setSubAckedAtBaseMs] = useState<number | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [conversionDialogOpen, setConversionDialogOpen] = useState(false);
  // True when a try just recorded opened the picker (see afterTry).
  const [conversionAfterTry, setConversionAfterTry] = useState(false);
  /**
   * Own-team scorer picker — invoked by the scorebug's `+T` chip.
   * The chip itself doesn't mutate state; it opens this picker so
   * the coach can attribute the try without first having to tap a
   * player tile.
   */
  const [scorerPickerOpen, setScorerPickerOpen] = useState(false);
  // U13+: the kicker picker for a penalty / field goal (null = closed).
  const [goalPicker, setGoalPicker] = useState<"penalty_goal" | "field_goal" | null>(null);
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


  const kickoffSkippedRef = useRef<Set<number>>(new Set());
  const [kickoffSkippedTick, setKickoffSkippedTick] = useState(0);

  // ── Local clock tick + pause ─────────────────────────────────
  // `elapsedMs` (game ms) is netball's period clock: wall-clock time
  // since `state.quarterStartedAt`, less the real time spent paused,
  // scaled by clockMultiplier. A pause freezes it; resuming banks the
  // stoppage so the clock carries on from where it stopped instead of
  // jumping ahead by the paused time. The pause is the period's latest
  // clock_pause event (lib/live/clockPause), so a reload or a second
  // phone keeps it.
  const [nowMs, setNowMs] = useState<number | null>(null);
  const quarterStartedAtMs = state.quarterStartedAt ? Date.parse(state.quarterStartedAt) : NaN;
  const startedAtMs = Number.isNaN(quarterStartedAtMs) ? null : quarterStartedAtMs;
  const pause = useEventPeriodPause(thisGameEvents, game.id, state.currentQuarter, startedAtMs, clockMultiplier);
  const running = pause.pausedAtMs === null;
  useEffect(() => {
    if (!state.quarterStartedAt || state.quarterEnded || state.finalised) {
      return;
    }
    if (!running) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.quarterStartedAt, state.quarterEnded, state.finalised, running]);

  const clockAt = useCallback(
    (now: number) =>
      computePeriodClockMs({
        currentQuarter: state.currentQuarter,
        quarterEnded: state.quarterEnded,
        finalised: state.finalised,
        quarterStartedAtMs: startedAtMs,
        pausedAtMs: pause.pausedAtMs,
        accumulatedPauseMs: pause.accumulatedPauseMs,
        fallbackElapsedMs: state.quarterElapsedMs ?? 0,
        clockMultiplier,
        nowMs: now,
      }),
    [state.currentQuarter, state.quarterEnded, state.finalised, startedAtMs, state.quarterElapsedMs, pause, clockMultiplier],
  );
  // Until the first client tick, a running clock shows the server's
  // value so the hydrated clock matches the server render; a paused one
  // reads its pause, which doesn't move.
  const elapsedMs = useMemo(
    () => (nowMs == null && running ? state.quarterElapsedMs ?? 0 : clockAt(nowMs ?? 0)),
    [nowMs, running, state.quarterElapsedMs, clockAt],
  );

  // AFL's live chrome: the undo strip's flash, the swap confirm and
  // toast, and the season's lent minutes on the long-press sheet.
  const playerById = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad]);
  const seasonLoanMins = useMemo(() => seasonLoanMinutes(seasonEvents), [seasonEvents]);
  const chrome = useLiveChrome({
    teamName,
    opponentName: game.opponent || "Opponent",
    playersById: playerById,
    seasonLoanMinutes: seasonLoanMins,
    events: thisGameEvents,
    openElapsedMs: isPeriodActive ? elapsedMs : null,
  });
  // The clock as the write lands: a confirmed swap is stamped when the
  // coach taps Confirm, not when the sheet opened (AFL reads its clock
  // at confirm too).
  const elapsedRef = useRef(elapsedMs);
  elapsedRef.current = elapsedMs;
  const at = () => ({ quarter: state.currentQuarter, elapsed_ms: elapsedRef.current });

  // Pause or resume: a clock_pause event, on screen at once. A fresh
  // period has none, so it starts running.
  function toggleClock() {
    if (!state.quarterStartedAt || state.quarterEnded || state.finalised) {
      return;
    }
    if (hooterFiredRef.current) return;
    const now = Date.now();
    const input = clockPauseInput(state.currentQuarter, running, clockAt(now), now);
    write("recordClockPause", [auth, game.id, input], liveEvents.clockPause(input));
  }
  function handleClockTap() {
    if (!state.quarterStartedAt || state.quarterEnded || state.finalised) {
      return;
    }
    setClockMenuOpen(true);
  }

  const hooterFiredRef = useRef(false);
  // Anchor for the DeviceFrame scroll-reset (see handleStartNextPeriod).
  const liveRootRef = useRef<HTMLDivElement>(null);

  // ── Period label resolver ─────────────────────────────────────
  const { label: periodLabel, plural: periodLabelPlural } = periodLabels(sport, ageGroup);

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
  // Lent players sourced from the WHOLE squad (not just the lineup), so a
  // player lent before kickoff — who was never placed and so has no field or
  // bench tile — is still visible and recallable at the break. Recall fires
  // markLoan(false); the replay's player_loan handler drops them onto the
  // bench (see rugby_league/fairness.ts), so they become fieldable at once.
  const lentPlayers = useMemo(
    () => squad.filter((p) => loanedSet.has(p.id) && !injuredSet.has(p.id)),
    [squad, loanedSet, injuredSet],
  );

  // The pinned plan for the coming period (F2): the plan-ahead modal
  // pins it; LeagueBreak (the shared break screen) opens on it.
  const plannedRotation = useLiveGame((s) => s.plannedRotation);
  const setPlannedRotation = useLiveGame((s) => s.setPlannedRotation);
  const pinForThisGame =
    plannedRotation && plannedRotation.gameId === game.id
      ? plannedRotation
      : null;
  const isAtQbreak
    = state.quarterEnded
    && state.currentQuarter >= 1
    && state.currentQuarter < ageGroup.periodCount
    && !state.finalised;
  // The break is LeagueBreak; this screen shows the lineup in play.
  const lineup = state.lineup;
  // Named positions mid-period: the slot each kid holds (a sub takes
  // over the replaced kid's), so a sub never re-deals the field.
  const heldSlots = useMemo(() => leagueSlotsNow(thisGameEvents), [thisGameEvents]);
  // Named positions: the spot each kid on holds, as the tiles show it.
  const liveSlots = useMemo(
    () =>
      lineup && leaguePlaybook?.positions?.length
        ? assignLeaguePositions({ forwards: lineup.forwards, backs: lineup.backs }, leaguePlaybook, heldSlots)
        : {},
    [lineup, leaguePlaybook, heldSlots],
  );

  // ── Derived lineups ───────────────────────────────────────────
  // `forwardPlayers` and `backPlayers` map the position-aware buckets
  // back to Player records. `fieldPlayers` is the union used wherever
  // the consumer doesn't care which zone — keeps the bulk of the live
  // logic legible since most of it (vest assignments, late-arrival
  // detection, sub timing) doesn't read zone info.
  const forwardPlayers = useMemo<Player[]>(() => {
    if (!lineup) return [];
    return lineup.forwards
      .map((id) => squad.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p));
  }, [lineup, squad]);
  const backPlayers = useMemo<Player[]>(() => {
    if (!lineup) return [];
    return lineup.backs
      .map((id) => squad.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p));
  }, [lineup, squad]);
  const fieldPlayers = useMemo<Player[]>(
    () => [...forwardPlayers, ...backPlayers],
    [forwardPlayers, backPlayers],
  );
  const benchPlayers = useMemo<Player[]>(() => {
    if (!lineup) return [];
    return lineup.bench
      .map((id) => squad.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p));
  }, [lineup, squad]);

  // Late-arrival candidates. Nobody arrives at a game that's over (AFL's
  // LiveGame filters the same).
  const lateArrivalCandidates = useMemo<Player[]>(() => {
    if (isFinished) return [];
    if (!lineup) return squad;
    const placed = new Set([
      ...lineup.forwards,
      ...lineup.backs,
      ...lineup.bench,
    ]);
    return squad.filter((p) => !placed.has(p.id));
  }, [squad, lineup, isFinished]);

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
    if (!lineup) return [];
    return [...lineup.forwards, ...lineup.backs];
  }, [lineup]);
  const onFieldSet = useMemo(() => new Set(onFieldIds), [onFieldIds]);
  // Who can kick off: kids on the field who can play. The picker and its
  // rotation (which the server re-checks) used the whole squad, so they
  // offered hurt, lent and absent kids, and once every kid on the field
  // had kicked the ones who couldn't left everyone else "Done"
  // (Stagehand round 4).
  const kickoffSquad = useMemo(
    () => squad.filter((p) => onFieldSet.has(p.id) && !injuredSet.has(p.id) && !loanedSet.has(p.id)),
    [squad, onFieldSet, injuredSet, loanedSet],
  );
  // Each law is its own knob. Without the junior kick rotations (league
  // U13+) there are no rotation badges and no kickoff picker; with goals
  // from play the score bug and the scorer sheet offer PG and FG.
  const kickRotations = ageGroup.kickRotations === true;
  const goalsFromPlay = ageGroup.goalsFromPlay === true;
  const scoreWords = useMemo(() => rugbyScoreWords(sport), [sport]);
  const conversionByPlayer = useMemo(
    () => (kickRotations ? playerConversionStatusInCycle(thisGameEvents, onFieldIds) : {}),
    [thisGameEvents, onFieldIds, kickRotations],
  );
  const kickoffTakerIds = useMemo(
    () => (kickRotations ? kickoffTakers(thisGameEvents) : new Set<string>()),
    [thisGameEvents, kickRotations],
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

  // Labelled zones for the summary — the sport's config, filtered to
  // this age group's zones (D-03; never a hardcoded list). Resolves to
  // the single "field" zone.
  const insightZones = useMemo(
    () => getSportConfig(sport).zones.filter((z) => ageGroup.zones.includes(z.id)),
    [sport, ageGroup.zones],
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
  const periodAbbrev = periodLabel.charAt(0).toUpperCase();

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
    && kickRotations
    && state.currentQuarter >= 1
    && !state.quarterEnded
    && !state.finalised
    && !kickoffRecordedForPeriod(thisGameEvents, state.currentQuarter);

  // ── Sub-due derivation ───────────────────────────────────────
  const subIntervalMs
    = subIntervalSeconds != null ? subIntervalSeconds * 1000 : null;
  // Forced swaps (injury / mark-out) don't re-anchor the rotation clock —
  // only a planned swap or the period start does (parity with AFL issue
  // 5). Logic is the pure, unit-tested resolveLeagueSubAnchorElapsed.
  const lastSwapOrPeriodElapsed = useMemo<number | null>(
    () => resolveLeagueSubAnchorElapsed(thisGameEvents, state.currentQuarter),
    [thisGameEvents, state.currentQuarter],
  );
  // Filter out injured / loaned bench players — they can't come on.
  const swappableBench = useMemo(
    () =>
      benchPlayers.filter(
        (p) => !injuredSet.has(p.id) && !loanedSet.has(p.id),
      ),
    [benchPlayers, injuredSet, loanedSet],
  );
  const hasSwappableBench = swappableBench.length > 0;

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

  // The sub-due banner beeps and buzzes as it appears, as AFL's does
  // (league and union were silent; a banner is easier to miss than the
  // modal it replaced).
  const subDueShowing = subIsDue && subAckedAtBaseMs !== lastSwapOrPeriodElapsed;
  useSubDueAudioUnlock();
  const subDueShowingRef = useRef(false);
  useEffect(() => {
    if (subDueShowing && !subDueShowingRef.current) {
      playSubDueBeep();
      void hapticTap("heavy");
    }
    subDueShowingRef.current = subDueShowing;
  }, [subDueShowing]);

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
    // Cohort chips retired with How we play (UX plan 5.8): their intent now lives in roles and rules.
    () => new Map(squad.map((p) => [p.id, null])),
    [squad],
  );
  // The rules a rolling sub keeps: §6 where the grade plays it, the How
  // we play floor (Siren's 50% by default, as the break checks it), and a
  // sub interval's gap before a swap crosses lines (UX audit, 23 Oct 2026).
  const subLaws = useMemo<LeagueSubLaws>(
    () => ({
      periodCount: ageGroup.periodCount,
      periodMs: periodSeconds * 1000,
      // §6 always, where the grade plays it (a locked Must on How we play).
      requiredUnbroken: unbrokenPeriodsRequired(ageGroup),
      minGameTimePct: leaguePlaybook?.minGameTimePct ?? 50,
      crossLineGapMs: subIntervalMs ?? undefined,
    }),
    [ageGroup, periodSeconds, leaguePlaybook, subIntervalMs],
  );
  const nextSubSuggestions = useMemo(() => {
    if (state.currentQuarter < 1 || state.quarterEnded || state.finalised) {
      return [];
    }
    if (!lineup) return [];
    return suggestLeagueSubs(
      thisGameEvents,
      state.currentQuarter,
      {
        forwards: lineup.forwards,
        backs: lineup.backs,
        bench: swappableBench.map((p) => p.id),
      },
      excludeOff,
      elapsedMs,
      chipByPlayerId,
      leaguePlaybook,
      subLaws,
    );
  }, [
    thisGameEvents,
    state.currentQuarter,
    state.quarterEnded,
    state.finalised,
    lineup,
    swappableBench,
    excludeOff,
    elapsedMs,
    chipByPlayerId,
    leaguePlaybook,
    subLaws,
  ]);

  // ── Plan-NEXT-period (F2 / ROTPLAN-02) ───────────────────────
  // RL has no separate break component — the q-break is an inline
  // card in this same orchestrator. So both halves of F2 live here:
  //   1. a live-surface entry that opens the SAME shared GamePlanModal
  //      on the upcoming period, pinning forwards/backs into the ONE
  //      shared `plannedRotation` slice (the nextPeriod* fields), and
  //   2. the break opening on the reconciled pin (`breakPlan`, above),
  //      which Start applies via the existing `recordLeagueLineupSet`
  //      action at the explicit "Start period" tap (see
  //      handleStartNextPeriod) — never an auto-commit (threat model
  //      T-11-02-B).
  const [planNextOpen, setPlanNextOpen] = useState(false);
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
  const hasPinnedNextPeriod = hasPinnedPeriod(pinForThisGame, state.currentQuarter);

  // ── Force-vest-replacement detection ─────────────────────────
  // Triggered when an FR/DH wearer is no longer on the field.
  // Possible causes: sub off (swap), injury, loan.
  const missingVestWearer = useMemo<VestType | null>(() => {
    if (!vestRequired || !lineup) return null;
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
    lineup,
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
    if (missingVestWearer == null || isAtQbreak) return;
    const key = `${state.currentQuarter}-${missingVestWearer}`;
    if (dismissedForceVestRef.current.has(key)) return;
    setForceVestReplaceOpen(true);
  }, [missingVestWearer, state.currentQuarter, isAtQbreak]);
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
    && (lineup
      ? lineup.forwards.includes(selectedPlayer.id)
        || lineup.backs.includes(selectedPlayer.id)
      : false);
  const selectedOnBench
    = selectedPlayer != null && lineup?.bench.includes(selectedPlayer.id);

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


  // No first-visit auto-open: the tour is offered on the pre-kickoff
  // lineup screen (LeagueWalkthroughOffer) and the "?" in LiveTopBar
  // opens it on demand — never a modal over the clock (UX plan H1).
  // `league-walkthrough-seen` is shared with the offer card.
  function handleWalkthroughClose() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("league-walkthrough-seen", "1");
    }
    setWalkthroughOpen(false);
  }
  function handleOpenWalkthrough() {
    setWalkthroughOpen(true);
  }
  // Build the steps once per dependency change. Vests / kicking /
  // zone-time / unbroken-periods are all sport-config or per-game
  // toggles, so the step list updates if any change between
  // sessions for the same team.
  const walkthroughSteps = useMemo(
    () =>
      buildLeagueWalkthroughSteps({
        sport,
        trackScoring,
        periodLabel,
        vests: { fr: ageGroup.vestRequirements?.fr ?? false, dh: ageGroup.vestRequirements?.dh ?? false },
        kickingAllowed: ageGroup.kickingAllowed === true,
        goalsFromPlay: ageGroup.goalsFromPlay === true,
        kickRotations: ageGroup.kickRotations === true,
        unbrokenPeriods: ageGroup.unbrokenPeriods === true,
        trackZoneTime,
      }),
    [
      sport,
      trackScoring,
      periodLabel,
      ageGroup.vestRequirements,
      ageGroup.kickingAllowed,
      ageGroup.goalsFromPlay,
      ageGroup.kickRotations,
      ageGroup.unbrokenPeriods,
      trackZoneTime,
    ],
  );

  // ── Score ───────────────────────────────────────────────────
  // A score goes up the moment it's tapped (optimistic), and the undo
  // strip flashes what was recorded, as AFL's does.
  function recordTryForPlayer(playerId: string) {
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
    setError(null);
    write(
      "recordTry",
      [auth, game.id, playerId, state.currentQuarter, elapsedRef.current],
      liveEvents.score("try", playerId, at()),
    );
    void hapticTap("light");
    chrome.scored({ side: "us", what: rugbyScoreWhat(sport, "try"), scorerId: playerId });
    handleClearSelection();
    // The kicker picker follows the try (a conversion needs one first).
    if (kickingAllowed) {
      setConversionAfterTry(true);
      setConversionDialogOpen(true);
    }
  }

  function handleRecordTryFromDock() {
    if (!selectedPlayer) {
      setError("Tap a player first.");
      return;
    }
    recordTryForPlayer(selectedPlayer.id);
  }

  function handleRecordOpponentTry() {
    setError(null);
    write(
      "recordOpponentTry",
      [auth, game.id, state.currentQuarter, elapsedRef.current],
      liveEvents.score("opponent_try", null, at()),
    );
    chrome.scored({ side: "them", what: rugbyScoreWhat(sport, "opponent_try") });
  }

  function handleOpenConversionDialog() {
    setError(null);
    setConversionAfterTry(false);
    setConversionDialogOpen(true);
  }

  function handleRecordOpponentConversion() {
    setError(null);
    write(
      "recordOpponentConversion",
      [auth, game.id, state.currentQuarter, elapsedRef.current],
      liveEvents.score("opponent_conversion", null, at()),
    );
    chrome.scored({ side: "them", what: rugbyScoreWhat(sport, "opponent_conversion") });
  }

  // Our kick at goal after a try, from the conversion dialog. It names
  // the try it converts once the server has that try (a try still on its
  // way is paired by the server); a kick the server refuses comes off
  // the screen and the refusal shows above the field.
  function recordConversion(kickerId: string, made: boolean, force: boolean) {
    setError(null);
    const tryEventId = conversionTryEventId(thisGameEvents);
    write(
      "recordConversionAttempt",
      [auth, game.id, kickerId, made, state.currentQuarter, elapsedRef.current, { force, tryEventId }],
      liveEvents.conversion({ kicker_id: kickerId, made, force, try_event_id: tryEventId, ...at() }),
    );
    chrome.scored({ side: "us", what: rugbyScoreWhat(sport, "conversion_attempt", made), scorerId: kickerId });
  }

  // U13+ (international laws): penalty goal 2, field goal 1. Ours name
  // the kicker (from the picker or the dock); theirs record directly.
  function recordLeagueGoalKind(
    kind: "penalty_goal" | "field_goal" | "opponent_penalty_goal" | "opponent_field_goal",
    kickerId: string | null,
  ) {
    setError(null);
    const ours = !kind.startsWith("opponent_");
    write(
      "recordLeagueGoal",
      [auth, game.id, kind, kickerId, state.currentQuarter, elapsedRef.current],
      liveEvents.score(kind, ours ? kickerId : null, at()),
    );
    chrome.scored({ side: ours ? "us" : "them", what: rugbyScoreWhat(sport, kind), scorerId: ours ? kickerId : null });
    handleClearSelection();
  }

  function handleUndoScore() {
    const undo = optimisticUndo(thisGameEvents, RUGBY_SCORE_EVENT_TYPES);
    if (!undo) return;
    setError(null);
    write("undoLeagueScore", [auth, game.id], undo);
    chrome.undone();
  }

  // ── Lineup edits ──────────────────────────────────────────────
  function saveLineup(next: LeagueLineup) {
    setError(null);
    // Named positions: record each kid's slot (UX plan 5.7), the field
    // keeping theirs.
    const lineup = withLeagueSlots(next, leaguePlaybook, heldSlots);
    const when = at();
    write("recordLeagueLineupSet", [auth, game.id, lineup, when], liveEvents.lineupSet({ lineup, ...when }));
  }

  // A rolling sub: `onId` takes `offId`'s spot, `offId` goes to the bench.
  // `manual`: made by hand, off the rotation's cadence, so the sub clock
  // doesn't restart (AFL's rule).
  function sub(offId: string, onId: string, manual = false) {
    setError(null);
    const input = { off_player_id: offId, on_player_id: onId, ...(manual ? { manual } : {}), ...at() };
    write("recordLeagueSwap", [auth, game.id, input], liveEvents.swap(input));
  }

  /** A line in the coach's words, as the swap confirm and the long-press sheet say it. */
  const lineName = (zone: "forward" | "back") => (zone === "forward" ? "Forwards" : "Backs");

  /**
   * Apply EVERY suggested swap in the next-sub card — rotates the
   * whole bench in one tap. Each pair is its own `recordLeagueSwap`, in
   * order in the game lane, so the replay sees them in order. We do NOT
   * re-run the suggester between them — the snapshot the coach saw on
   * screen is what gets executed.
   */
  function handleApplyAllSubs() {
    if (nextSubSuggestions.length === 0) return;
    for (const swap of nextSubSuggestions) sub(swap.off.playerId, swap.on.playerId);
    if (nextSubSuggestions.length === 1) chrome.swapped(nextSubSuggestions[0].off.playerId, nextSubSuggestions[0].on.playerId);
    else chrome.showToast(`${nextSubSuggestions.length} subs made`);
    handleClearSelection();
  }

  function maybeCompleteSwap(secondId: string) {
    if (!selectedPlayer || !lineup) return false;
    const first = selectedPlayer.id;
    const onForwards = lineup.forwards;
    const onBacks = lineup.backs;
    const zoneOfId = (id: string): "forward" | "back" | null => {
      if (onForwards.includes(id)) return "forward";
      if (onBacks.includes(id)) return "back";
      return null;
    };
    const firstZone = zoneOfId(first);
    const secondZone = zoneOfId(secondId);
    // Field ↔ field: positional swap, straight away (AFL's zone swap).
    // Both players stay on the field. If they're in the same zone, just
    // exchange order in that bucket (the formation arranger reads order
    // to assign slots). If they're in different zones, swap zones —
    // useful when the coach wants to flip a forward and a back without
    // benching anyone.
    if (firstZone && secondZone) {
      let nextForwards = onForwards.slice();
      let nextBacks = onBacks.slice();
      if (firstZone === secondZone) {
        const arr = firstZone === "forward" ? nextForwards : nextBacks;
        const i = arr.indexOf(first);
        const j = arr.indexOf(secondId);
        if (i >= 0 && j >= 0) {
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        if (firstZone === "forward") nextForwards = arr;
        else nextBacks = arr;
      } else {
        // Cross-zone — swap their bucket membership.
        const flip = (id: string) => (id === first ? secondId : id === secondId ? first : id);
        nextForwards = nextForwards.map(flip);
        nextBacks = nextBacks.map(flip);
      }
      saveLineup({ forwards: nextForwards, backs: nextBacks, bench: lineup.bench });
      chrome.showToast(`${chrome.firstName(first)} ⇄ ${chrome.firstName(secondId)} — swapped`);
      handleClearSelection();
      return true;
    }
    // Field ↔ bench (or bench ↔ field): a rolling sub, after AFL's
    // confirm; the toast says what changed.
    if (Boolean(firstZone) !== Boolean(secondZone)) {
      const off = firstZone ? first : secondId;
      const on = firstZone ? secondId : first;
      // Never bring a hurt or lent kid on, e.g. one selected before they
      // were lent (Stagehand round 4): this tap starts a new selection.
      if (injuredSet.has(on) || loanedSet.has(on)) return false;
      chrome.confirmSwap({ offId: off, onId: on, spotName: lineName((firstZone ?? secondZone)!), onConfirm: () => sub(off, on, true) });
      handleClearSelection();
      return true;
    }
    return false;
  }

  function handlePlayerTapMaybeSwap(playerId: string) {
    if (
      selectedPlayer
      && lineup
      && playerId !== selectedPlayer.id
    ) {
      if (maybeCompleteSwap(playerId)) return;
    }
    handlePlayerTap(playerId);
  }

  /**
   * Empty slot was tapped. Two paths depending on what's selected:
   *
   *   1. **Bench player selected** — promote them onto the field
   *      via a fresh `lineup_set`, targeting the TAPPED slot's
   *      zone (not the player's chip preference), after AFL's confirm.
   *      A coach tapping the empty FWD slot lands the bench player in
   *      FWD even if they're B-chipped, because the explicit tap-target
   *      is a stronger signal than the chip default.
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
   * round-trip). Nothing selected opens the bench picker.
   */
  // Bench → field into an empty spot: the tapped zone wins over chip
  // preference.
  function fillVacantSpot(playerId: string, slotZone: "forward" | "back") {
    if (!lineup) return;
    const nextForwards
      = slotZone === "forward"
        ? [...lineup.forwards, playerId]
        : lineup.forwards;
    const nextBacks
      = slotZone === "back"
        ? [...lineup.backs, playerId]
        : lineup.backs;
    const nextBench = lineup.bench.filter((id) => id !== playerId);
    saveLineup({ forwards: nextForwards, backs: nextBacks, bench: nextBench });
    handleClearSelection();
  }

  function handleVacantSpotTap(slotZone: "forward" | "back") {
    if (!lineup) return;
    // Nobody selected: pick who comes on (the spot says "tap to bring a
    // bench player on"; it used to do nothing: Stagehand round 4).
    if (!selectedPlayer) {
      setFillSpotZone(slotZone);
      return;
    }
    const kid = selectedPlayer.id;
    const isBench = lineup.bench.includes(kid);
    // A hurt or lent kid on the bench can't fill a spot.
    if (isBench && (injuredSet.has(kid) || loanedSet.has(kid))) return;
    const isField
      = lineup.forwards.includes(kid)
      || lineup.backs.includes(kid);

    if (isBench) {
      // A bench kid into an empty spot asks first, as AFL's does.
      chrome.confirmSwap({ offId: null, onId: kid, spotName: lineName(slotZone), onConfirm: () => fillVacantSpot(kid, slotZone) });
      handleClearSelection();
      return;
    }

    if (isField) {
      // Field → opposite zone: position change. No-op if already
      // in the tapped zone (e.g. coach taps an empty FWD slot
      // with a forward selected — they were going to move within
      // forwards, which isn't a thing; just clear and bail).
      const currentZone: "forward" | "back" = lineup.forwards.includes(kid)
        ? "forward"
        : "back";
      if (currentZone === slotZone) {
        handleClearSelection();
        return;
      }
      handleMoveLeaguePosition(kid, slotZone);
      chrome.showToast(`${chrome.firstName(kid)} → ${lineName(slotZone)}`);
      handleClearSelection();
    }
  }

  function handleAddLateArrival(playerId: string) {
    setError(null);
    // The shared `addLateArrival` action expects an input object,
    // not a bare player id (matches AFL's `handleLateArrival`
    // shape). Passing the bare string silently lands an event with
    // `player_id: undefined`, which is why the bench refused to
    // render the new arrival — the replay engine ignored the row.
    const input = { player_id: playerId, quarter: Math.max(1, state.currentQuarter), elapsed_ms: elapsedRef.current };
    write("addLateArrival", [auth, game.id, input], liveEvents.arrived(input));
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

  function markInjured(playerId: string, injured: boolean) {
    setError(null);
    const input = { player_id: playerId, injured, ...at() };
    write("markInjury", [auth, game.id, input], liveEvents.injury(input));
  }

  function handleToggleInjury(playerId: string, injured: boolean) {
    if (injured) setSelectedPlayerId((s) => (s === playerId ? null : s));
    // Marking a FIELD player injured: prompt for a replacement before
    // firing anything — mirrors AFL's InjuryReplacementModal flow.
    // The modal fires both markInjury + recordLeagueSwap so the swap
    // physically moves the injured player to bench and the replacement
    // lands at the exact same field slot (same index in the forwards /
    // backs array). If there are no swappable bench players, or the
    // player is on the bench (toggling recovery), skip straight to the
    // direct path.
    if (injured && lineup) {
      const zone: "forward" | "back" | null = lineup.forwards.includes(
        playerId,
      )
        ? "forward"
        : lineup.backs.includes(playerId)
          ? "back"
          : null;
      if (zone !== null && swappableBench.length > 0) {
        setActionSheetPlayerId(null);
        setInjuryReplacementModal({ injuredId: playerId, zone });
        return;
      }
    }
    // Direct path: recovery, bench-player injury, or no bench available.
    markInjured(playerId, injured);
    setActionSheetPlayerId(null);
  }

  /**
   * Coach picked a replacement from the InjuryReplacementModal.
   * Fires markInjury + recordLeagueSwap in order so the replay sees:
   *   1. injury (flag only — player stays in field slot)
   *   2. swap (off=injured, on=replacement) — replacement takes the
   *      exact same slot; injured moves to bench with INJ badge.
   */
  function handleInjuryReplacement(injuredId: string, replacementId: string) {
    setInjuryReplacementModal(null);
    // In order, in the one game lane: the injury, then who comes on.
    markInjured(injuredId, true);
    sub(injuredId, replacementId);
    chrome.swapped(injuredId, replacementId);
  }

  /**
   * Coach tapped "Mark injured without replacement" — just flag the
   * player as injured, leave their field slot vacant.
   */
  function handleInjuryMarkOnly(playerId: string) {
    setInjuryReplacementModal(null);
    markInjured(playerId, true);
  }

  function handleToggleLoan(playerId: string, loaned: boolean) {
    // A lent kid stops being selected now: the next tap would swap them
    // on (Stagehand round 4).
    if (loaned) setSelectedPlayerId((s) => (s === playerId ? null : s));
    setError(null);
    const input = { player_id: playerId, loaned, ...at() };
    write("markLoan", [auth, game.id, input], liveEvents.loan(input));
    setActionSheetPlayerId(null);
  }

  function handleReplaceVestFromActionSheet() {
    setActionSheetPlayerId(null);
    setForceVestReplaceOpen(true);
  }

  // Mid-game forward↔back override. Emits `league_position_change`
  // and the replayer moves the player between lineup.forwards and
  // lineup.backs without touching field membership (stints + §6
  // compliance keep ticking). No-op when the player isn't on field.
  function handleMoveLeaguePosition(
    playerId: string,
    toZone: "forward" | "back",
  ) {
    if (!lineup) return;
    const wasOnField
      = lineup.forwards.includes(playerId)
      || lineup.backs.includes(playerId);
    if (!wasOnField) return;
    setError(null);
    const input = { player_id: playerId, to_zone: toZone, ...at() };
    write("recordLeaguePositionChange", [auth, game.id, input], liveEvents.leaguePositionChange(input));
    setActionSheetPlayerId(null);
  }

  // Who is missing from the vest, and why, for the replace sheet.
  const missingVestNote = useMemo(() => {
    const id = missingVestWearer ? activeVests[missingVestWearer] : null;
    const name = id ? squad.find((p) => p.id === id)?.full_name : null;
    if (!id || !name) return null;
    const why = injuredSet.has(id)
      ? "is injured"
      : loanedSet.has(id)
        ? "is lent to the other team"
        : "is on the bench";
    return `${name} ${why}`;
  }, [missingVestWearer, activeVests, squad, injuredSet, loanedSet]);

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
  // isPeriodActive, isAtFinalQ and isFinished: with the replay, above;
  // isAtQbreak: with the break's plan.
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
  // Any selected player gets the dock (Player actions, swap hint);
  // the + Try row only when scoring an on-field player.
  const playerDockVisible = isPeriodActive && Boolean(selectedPlayer);

  // Action-sheet target lookup
  const actionSheetPlayer = useMemo(
    () => squad.find((p) => p.id === actionSheetPlayerId) ?? null,
    [actionSheetPlayerId, squad],
  );
  const actionSheetOnField
    = actionSheetPlayerId != null
    && (lineup
      ? lineup.forwards.includes(actionSheetPlayerId)
        || lineup.backs.includes(actionSheetPlayerId)
      : false);
  const actionSheetVest
    = actionSheetPlayerId != null ? vestByPlayer[actionSheetPlayerId] ?? null : null;
  const actionSheetInjured
    = actionSheetPlayerId != null && injuredSet.has(actionSheetPlayerId);
  const actionSheetLoaned
    = actionSheetPlayerId != null && loanedSet.has(actionSheetPlayerId);

  // The score pickers the scorebug's chips open: in play, and in the
  // break's score sheet.
  const scoreOverlays = (
    <>
      {conversionDialogOpen && lineup && (
        <RecordConversionDialog
          squad={squad}
          onFieldPlayerIds={[
            ...lineup.forwards,
            ...lineup.backs,
          ]}
          events={thisGameEvents}
          afterTry={conversionAfterTry}
          rotation={kickRotations}
          onRecord={recordConversion}
          onClose={() => setConversionDialogOpen(false)}
        />
      )}

      {/* U13+: who kicked our penalty / field goal (scorebug +PG / +FG). */}
      {goalPicker && (
        <LeagueScorerPicker
          sport={sport}
          score={goalPicker}
          onFieldPlayers={fieldPlayers}
          onCancel={() => setGoalPicker(null)}
          onPick={(pid) => {
            const kind = goalPicker;
            setGoalPicker(null);
            recordLeagueGoalKind(kind, pid);
          }}
        />
      )}

      {/* Own-team scorer picker — invoked by scorebug +T. */}
      {scorerPickerOpen && (
        <LeagueScorerPicker
          sport={sport}
          onFieldPlayers={fieldPlayers}
          onCancel={() => setScorerPickerOpen(false)}
          onPick={(pid) => {
            setScorerPickerOpen(false);
            recordTryForPlayer(pid);
          }}
        />
      )}
    </>
  );

  // The break: the shared break screen. Its score sheet holds the
  // scorebug's chips (a try or goal the coach missed in play).
  if (isAtQbreak) {
    return (
      <div ref={liveRootRef}>
        {walkthroughOpen && (
          <WalkthroughModal steps={walkthroughSteps} onClose={handleWalkthroughClose} />
        )}
        <LeagueBreak
          auth={auth}
          sport={sport}
          game={game}
          exitHref={exitHref}
          onHelp={handleOpenWalkthrough}
          squad={squad}
          ageGroup={ageGroup}
          state={state}
          events={thisGameEvents}
          periodSeconds={periodSeconds}
          injured={injuredSet}
          loaned={loanedSet}
          msByPlayer={totalMsByPlayer}
          leaguePlaybook={leaguePlaybook}
          chipModes={chipModes}
          isAdmin={isAdmin}
          scoreEditor={
            trackScoring ? (
              <div className="space-y-3">
                <p className="text-xs text-ink-dim">A score you missed counts in the {periodLabel} just played.</p>
                <LeagueScoreBug
                  sport={sport}
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
                  onTeamTry={() => setScorerPickerOpen(true)}
                  onTeamConversion={kickingAllowed ? handleOpenConversionDialog : undefined}
                  onOpponentTry={handleRecordOpponentTry}
                  onOpponentConversion={kickingAllowed ? handleRecordOpponentConversion : undefined}
                  kickingAllowed={kickingAllowed}
                  onTeamPenaltyGoal={goalsFromPlay ? () => setGoalPicker("penalty_goal") : undefined}
                  onTeamFieldGoal={goalsFromPlay ? () => setGoalPicker("field_goal") : undefined}
                  onOpponentPenaltyGoal={goalsFromPlay ? () => recordLeagueGoalKind("opponent_penalty_goal", null) : undefined}
                  onOpponentFieldGoal={goalsFromPlay ? () => recordLeagueGoalKind("opponent_field_goal", null) : undefined}
                  pending={pending}
                  running={running}
                />
                {chrome.undoStrip({
                  show: state.teamScore.points > 0 || state.opponentScore.points > 0,
                  onUndo: handleUndoScore,
                  disabled: pending,
                })}
                {scoreOverlays}
              </div>
            ) : undefined
          }
        />
        {error && <InlineAlert kind="danger">{error}</InlineAlert>}
      </div>
    );
  }

  return (
    // No bottom padding: LiveStickyScoreBar reserves its own height with
    // a measured in-flow spacer, and the player dock floats over the
    // page as AFL's does (Steve 2026-10-21: "Some blank space when
    // scrolling").
    <div ref={liveRootRef} className="space-y-3">
      <LiveTopBar
        exitHref={exitHref}
        game={game}
        isLive={state.currentQuarter > 0}
        onHelp={handleOpenWalkthrough}
        // Sub due is never a modal (Steve 16 Oct 2026): the field and the
        // score chips stay tappable. The sub card is the alert while it
        // has pairs (SubDue.tsx); the banner speaks only for a due sub
        // with nothing to suggest.
        banner={
          subDueShowing && subDueBannerShows(true, isPeriodActive ? nextSubSuggestions.length : 0) ? (
            <SubDueBanner onAcknowledge={() => setSubAckedAtBaseMs(lastSwapOrPeriodElapsed)} />
          ) : null
        }
      />
      {walkthroughOpen && (
        <WalkthroughModal steps={walkthroughSteps} onClose={handleWalkthroughClose} />
      )}

      {error && <InlineAlert kind="danger">{error}</InlineAlert>}

      {isPeriodActive && chrome.toast}

      {/* The replace sheet was closed ("Later", backdrop, Escape) while
          the vest still has no wearer on the field. Keep a way back to
          it — otherwise nobody wears the vest for the rest of the
          period (round 5, league-u8-vests). */}
      {missingVestWearer && !forceVestReplaceOpen && isPeriodActive && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-md border border-warn/40 bg-warn-soft/60 px-3 py-2 text-xs text-warn"
        >
          <span>
            Nobody on the field is wearing the{" "}
            {missingVestWearer === "fr" ? "First Receiver" : "Dummy Half"} vest.
          </span>
          <SFButton size="sm" variant="subtle" onClick={() => setForceVestReplaceOpen(true)}>
            Pick
          </SFButton>
        </div>
      )}

      {/* A front-row spot (union) held by a kid not picked for it — a
          sub, a replacement or a late arrival put them there. The sub
          card never does; a coach's own swap can (UX audit, 23 Oct
          2026). */}
      {isPeriodActive &&
        restrictedMisfits(liveSlots, leaguePlaybook)
          .filter((m) => !injuredSet.has(m.playerId) && !loanedSet.has(m.playerId))
          .map((m) => (
            <div
              key={m.key}
              role="status"
              data-testid="front-row-warning"
              className="rounded-md border border-warn/40 bg-warn-soft/60 px-3 py-2 text-xs text-warn"
            >
              {squad.find((p) => p.id === m.playerId)?.full_name ?? "A player"} is at {m.label} but isn&apos;t picked to
              play there.
            </div>
          ))}

      {/* Next-sub indicator — mirrors AFL's SwapCard. Renders the
          full bench rotation (one swap per bench player) with
          "Do all N swaps" so the whole bench cycles in one tap. */}
      {isPeriodActive && nextSubSuggestions.length > 0 && (
        <LeagueNextSubCard
          suggestions={nextSubSuggestions}
          msUntilDue={msUntilDue}
          subIntervalMs={subIntervalMs}
          due={subIsDue}
          onApplyAll={handleApplyAllSubs}
          onApplyOne={(swap) => {
            sub(swap.off.playerId, swap.on.playerId);
            chrome.swapped(swap.off.playerId, swap.on.playerId);
            handleClearSelection();
          }}
          pending={pending}
          playerById={playerById}
        />
      )}

      {/* Lent players — always-visible recall strip (squad-sourced), so a
          player lent before kickoff can be brought back at the break rather
          than only after the period starts. "Bring back" un-loans them; the
          replay lands them on the bench, ready to field. */}
      {!isFinished && lentPlayers.length > 0 && (
        <div className="px-1">
          <div className="rounded-lg border border-warn/40 bg-warn-soft/60 px-3 py-2">
            <p className="text-xs font-semibold text-warn">Lent to the other team</p>
            <p className="mt-0.5 text-[11px] text-warn/80">
              Tap “Bring back” to return a player to your bench.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {lentPlayers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleToggleLoan(p.id, false)}
                  disabled={pending}
                  data-testid={`league-recall-lent-${p.id}`}
                  aria-label={`Bring ${p.full_name} back`}
                  className="inline-flex items-center gap-1 rounded-full border border-warn/50 bg-surface px-2.5 py-1 text-xs font-medium text-warn transition-colors hover:bg-warn/15 disabled:opacity-60 motion-safe:active:scale-[0.97]"
                >
                  {p.jersey_number != null && (
                    <span className="tabular-nums font-semibold">{p.jersey_number}</span>
                  )}
                  <span>{p.full_name}</span>
                  <span className="ml-0.5 text-[11px] font-semibold text-warn/80">
                    Bring back
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Field + bench — hidden at full time (mirrors AFL's
          `!isFinished` gate around its Field + Bench fragment). Once
          the period count is reached, LeagueFullTimeReview takes the
          space below for score reconcile and after finalise the
          LeagueGameSummaryCard carries the share text. The on-pitch
          layout doesn't carry any signal at that point and just
          pads the screen with stale state. */}
      {!isFinished && lineup && (() => {
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
          {/* Colour key for the per-tile time-in-zone bars — only when
              zone-time tracking is on (bars render); same palette and
              forward-first order as the AFL/netball legend. Centre is
              vest time, so it's keyed only where a vest is worn. */}
          {trackZoneTime && (
            <ZoneTimeLegend
              className="px-1"
              items={[
                { label: "Fwd", swatchClassName: "bg-zone-f", textClassName: "text-zone-f" },
                ...(vestRequired
                  ? [{ label: "Centre", swatchClassName: "bg-zone-c", textClassName: "text-zone-c" }]
                  : []),
                { label: "Back", swatchClassName: "bg-zone-b", textClassName: "text-zone-b" },
              ]}
            />
          )}
          <LeagueField
            sport={sport}
            forwardsBySize={ageGroup.forwardsBySize}
            players={fieldPlayers}
            forwardPlayers={forwardPlayers}
            backPlayers={backPlayers}
            onFieldSize={game.on_field_size}
            vestRequirements={ageGroup.vestRequirements}
            triesByPlayer={state.playerTries}
            totalMsByPlayer={totalMsByPlayer}
            zoneMsByPlayer={zoneMsByPlayer}
            vestByPlayer={vestByPlayer}
            positionLabels={
              lineup
                ? assignLeaguePositionLabels(
                    { forwards: lineup.forwards, backs: lineup.backs },
                    leaguePlaybook,
                    heldSlots,
                  )
                : undefined
            }
            positionOrder={linePositionOrder(leaguePlaybook?.positions)}
            conversionByPlayer={conversionByPlayer}
            kickoffTakerIds={kickoffTakerIds}
            injuredIds={injuredSet}
            loanedIds={loanedSet}
            selectedPlayerId={selectedPlayerId}
            swapOffs={swapOffs}
            swapDue={subIsDue}
            totalSwapPairs={totalSwapPairs}
            chipModes={chipModes}
            onPlayerClick={handlePlayerTapMaybeSwap}
            onPlayerLongPress={handlePlayerLongPress}
            // The empty-slot tap routes by what's selected:
            //   bench-selected → lineup_set into the tapped zone
            //   field-selected → position_change to the tapped
            //                    zone (no-op if same zone)
            //   nothing        → the bench picker (Stagehand round 4:
            //                    the spot used to be inert then)
            // Steve 2026-05-23 short-squad fix.
            onVacantSpotTap={handleVacantSpotTap}
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
          {/* §6: who must stay on, who must start the next period. */}
          {isPeriodActive && (
            <UnbrokenPeriodWarning
              sport={sport}
              players={[...fieldPlayers, ...benchPlayers]}
              events={thisGameEvents}
              ageGroup={ageGroup}
              currentQuarter={state.currentQuarter}
              currentElapsedMs={elapsedMs}
              sidelined={new Set([...Array.from(injuredSet), ...Array.from(loanedSet)])}
            />
          )}
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
            size="md"
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
                onClick={() => setPlannedRotation(consumePeriodPin(pinForThisGame, state.currentQuarter))}
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
            squad={kickoffSquad}
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

      {/* Pre-finalise review — full per-period reconcile + finalise
          button. Mirrors AFL `FullTimeReview` shape: per-side score
          boxes, per-period table, finalise CTA. */}
      {isAtFinalQ && (
        <LeagueFullTimeReview
          auth={auth}
          sport={sport}
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
          onTeamPenaltyGoal={goalsFromPlay ? () => setGoalPicker("penalty_goal") : undefined}
          onTeamFieldGoal={goalsFromPlay ? () => setGoalPicker("field_goal") : undefined}
          onOpponentPenaltyGoal={goalsFromPlay ? () => recordLeagueGoalKind("opponent_penalty_goal", null) : undefined}
          onOpponentFieldGoal={goalsFromPlay ? () => recordLeagueGoalKind("opponent_field_goal", null) : undefined}
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
          sport={sport}
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
        finished={state.finalised}
        auth={auth}
        gameId={game.id}
        settings={
          // Game settings sheet: sub interval, players on field,
          // unbroken-period rule — the row's standard slot, as AFL's.
          isAdmin && !isFinished ? (
            <LeagueGameSettingsButton
              auth={auth}
              gameId={game.id}
              subIntervalSeconds={subIntervalSeconds ?? 300}
              currentOnFieldSize={game.on_field_size}
              minOnFieldSize={ageGroup.minOnFieldSize}
              maxOnFieldSize={ageGroup.maxOnFieldSize}
              onFieldPlayers={fieldPlayers}
              unbrokenRule={
                unbrokenPeriodsRequired(ageGroup) > 0
                  ? `${ageGroup.minUnbrokenPeriods} unbroken ${ageGroup.minUnbrokenPeriods === 1 ? periodLabel : periodLabelPlural}`
                  : null
              }
              trackZoneTime={trackZoneTime}
              centreVest={centreVest(ageGroup.vestRequirements)}
              currentQuarter={state.currentQuarter}
              elapsedMs={elapsedMs}
            />
          ) : null
        }
      />

      {/* End-period-early lives on the scorebug clock pill now —
          the standalone link button has been folded into the
          pause-aware affordance pattern from AFL's `GameHeader`. */}

      {/* Player dock — any selected player. + Try when scoring an
          on-field player (tag rugby / bench: just the swap hint);
          Player actions opens the same sheet as long-press. */}
      {playerDockVisible && selectedPlayer && (
        <ScoreRecordingDock
          heading={
            scoreDockVisible ? (
              <>
                Record score for{" "}
                <span className="text-brand-700">
                  {selectedPlayer.full_name}
                </span>
              </>
            ) : (
              <span className="text-brand-700">{selectedPlayer.full_name}</span>
            )
          }
          onCancel={handleClearSelection}
          onPlayerActions={() => {
            const id = selectedPlayer.id;
            handleClearSelection();
            setActionSheetPlayerId(id);
          }}
          actions={
            !scoreDockVisible ? (
              <p className="text-xs text-ink-dim">
                {selectedOnField
                  ? "Tap a bench player to swap them off."
                  : "Tap a field player to swap them on."}
              </p>
            ) : (
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
              {goalsFromPlay && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => recordLeagueGoalKind("penalty_goal", selectedPlayer.id)}
                    disabled={pending}
                    className="rounded-sm border border-brand-500 bg-surface py-2.5 font-mono text-sm font-bold uppercase tracking-micro text-brand-700 transition-colors duration-fast ease-out-quart hover:bg-brand-50 disabled:opacity-60"
                  >
                    + {scoreWords.penaltyGoal.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => recordLeagueGoalKind("field_goal", selectedPlayer.id)}
                    disabled={pending}
                    className="rounded-sm border border-brand-500 bg-surface py-2.5 font-mono text-sm font-bold uppercase tracking-micro text-brand-700 transition-colors duration-fast ease-out-quart hover:bg-brand-50 disabled:opacity-60"
                  >
                    + {scoreWords.fieldGoal.label}
                  </button>
                </div>
              )}
              <p className="text-center text-[11px] text-ink-mute">
                Or tap a bench player to swap{" "}
                <strong>{selectedPlayer.full_name}</strong> off.
              </p>
            </div>
            )
          }
        />
      )}

      {/* Sticky-bottom scorebug + undo strip. */}
      {hasStickyBottom && (
        <LiveStickyScoreBar
          scoringOff={
            !trackScoring
              ? { settingsHref: auth.kind === "team" && isAdmin ? `/teams/${auth.teamId}/settings#section-game-day-extras` : null }
              : undefined
          }
          scorebug={
            <LeagueScoreBug
              sport={sport}
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
              // In play only: the break's score sheet and the full-time
              // review fix a score missed in play (a buzzer-beater try
              // lands there, Steve 2026-05-18), each on its own buttons.
              onTeamTry={isPeriodActive ? () => setScorerPickerOpen(true) : undefined}
              onTeamConversion={isPeriodActive && kickingAllowed ? handleOpenConversionDialog : undefined}
              onOpponentTry={isPeriodActive ? handleRecordOpponentTry : undefined}
              onOpponentConversion={isPeriodActive && kickingAllowed ? handleRecordOpponentConversion : undefined}
              kickingAllowed={kickingAllowed}
              onTeamPenaltyGoal={isPeriodActive && goalsFromPlay ? () => setGoalPicker("penalty_goal") : undefined}
              onTeamFieldGoal={isPeriodActive && goalsFromPlay ? () => setGoalPicker("field_goal") : undefined}
              onOpponentPenaltyGoal={isPeriodActive && goalsFromPlay ? () => recordLeagueGoalKind("opponent_penalty_goal", null) : undefined}
              onOpponentFieldGoal={isPeriodActive && goalsFromPlay ? () => recordLeagueGoalKind("opponent_field_goal", null) : undefined}
              pending={pending}
              running={running}
              onClockTap={isPeriodActive ? handleClockTap : undefined}
            />
          }
          // Same strip as AFL's, flashing what was recorded; in play only
          // (at full time the review's own Undo fixes a miscount).
          undoStrip={chrome.undoStrip({
            show: isPeriodActive && (state.teamScore.points > 0 || state.opponentScore.points > 0),
            onUndo: handleUndoScore,
            disabled: pending,
          })}
        />
      )}

      {/* Plan-NEXT-period planner (F2). Same shared GamePlanModal, opened
          on the NEXT period's tab (initialPeriodIndex=1 — period[0] mirrors
          the current field, period[1] is the projected next period). On pin
          we store the edited next-period forwards/backs/bench in the SAME
          plannedRotation slice (nextPeriod* fields); handleStartNextPeriod
          seeds the lineup from it (reconciled) at the explicit Start tap. */}
      {planNextOpen && lineup && (() => {
        const currentGroups: Record<string, string[]> = {
          forwards: lineup.forwards,
          backs: lineup.backs,
        };
        const currentBench = lineup.bench;

        // Only players present (in the current lineup → excludes squad
        // members who didn't attend) AND healthy. Shared rule across all
        // sports (Steve 2026-06-15, short-squad game).
        const inGameIds = new Set<string>([
          ...lineup.forwards,
          ...lineup.backs,
          ...lineup.bench,
        ]);
        const playersForPlan = availablePlayersForPlan(
          squad,
          inGameIds,
          injuredSet,
          loanedSet,
        );

        // Per-player game context for the planner rows (issue: plan with
        // break-level info). League tracks on-field time positionlessly, so
        // show total minutes only (no per-position breakdown).
        const planPlayerStats: Record<
          string,
          { totalMs: number; zones: { label: string; ms: number }[] }
        > = {};
        for (const p of playersForPlan) {
          planPlayerStats[p.id] = {
            totalMs: totalMsByPlayer[p.id] ?? 0,
            zones: [],
          };
        }

        const initialPlan = projectUpcomingRotation({
          sport,
          ageGroup,
          players: playersForPlan,
          onFieldSize: game.on_field_size,
          seed: 7,
          chipModeByKey: chipModes,
          fromPeriodIndex: Math.max(0, state.currentQuarter - 1),
          currentGroups,
          currentBench,
        });

        return (
          <GamePlanModal
            sport={sport}
            ageGroup={ageGroup}
            players={playersForPlan}
            onFieldSize={game.on_field_size}
            teamName={teamName}
            opponentName={game.opponent}
            seasonEvents={seasonEvents}
            chipModeByKey={chipModes}
            // Reopened after a pin: show the pinned next period, not a
            // fresh projection ("Suggested" still reverts to the projection).
            initialPlan={withPinnedPeriods(initialPlan, {
              pin: pinForThisGame,
              fromPeriodIndex: state.currentQuarter,
              availableIds: playersForPlan.map((p) => p.id),
            })}
            initialPeriodIndex={1}
            playerStats={planPlayerStats}
            planActions={[
              { key: "suggested", label: "Suggested", apply: () => initialPlan },
              {
                key: "manual",
                label: "Set manually",
                apply: (plan: GamePlan, i: number) => clearPeriodToBench(plan, i),
              },
            ]}
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

      {clockMenuOpen && (
        <ClockMenu
          sport={sport}
          periodAbbr={`${periodLabel.charAt(0).toUpperCase()}${state.currentQuarter}`}
          running={running}
          onPause={toggleClock}
          onResume={toggleClock}
          onEndEarly={isPeriodActive ? () => setEndQConfirmOpen(true) : undefined}
          onClose={() => setClockMenuOpen(false)}
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
          sport={sport}
          clock={running ? "running" : "paused"}
          // U10–U12 plays halves; U6–U9 plays quarters. The picker's
          // age-group config carries the right label so the modal
          // reads "End H2" instead of "End Q2" at U10+.
          periodLabel={periodLabel}
        />
      )}

      {scoreOverlays}

      {/* Force-vest-replace modal: shown when an FR/DH wearer leaves
          the field (sub, injury, loan) until the coach picks a
          replacement OR explicitly dismisses for the period. */}
      {forceVestReplaceOpen && vestRequired && lineup && (
        <Modal size="md" placement="sheet" label="Replace vest wearer" onClose={handleForceVestDismiss} padding="p-4">
            <header className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">
                  Replace {missingVestWearer === "fr" ? "First Receiver" : missingVestWearer === "dh" ? "Dummy Half" : "vest"}
                </h2>
                <p className="text-xs text-ink-mute">
                  {missingVestNote
                    ? `${missingVestNote}. Pick who wears the vest now.`
                    : "The vest wearer is no longer on the field. Pick a replacement to continue."}
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
              sport={sport}
              gameId={game.id}
              squad={squad}
              onFieldPlayerIds={[
                ...lineup.forwards,
                ...lineup.backs,
              ]}
              events={thisGameEvents}
              ageGroup={ageGroup}
              period={state.currentQuarter || 1}
              vest={missingVestWearer ?? undefined}
              onDone={() => setForceVestReplaceOpen(false)}
            />
          </Modal>
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
          // The kid's line (on the field) for the Switch hint, and their
          // lent minutes, as AFL's sheet has.
          currentLine={
            actionSheetOnField && lineup
              ? lineName(lineup.forwards.includes(actionSheetPlayer.id) ? "forward" : "back")
              : null
          }
          isInjured={actionSheetInjured}
          isLoaned={actionSheetLoaned}
          seasonLoanMins={chrome.loanMinutes(actionSheetPlayer.id).seasonLoanMins}
          squadLoanMins={chrome.loanMinutes(actionSheetPlayer.id).squadLoanMins}
          insight={
            <PlayerInsightSummary input={buildInsightInput(actionSheetPlayer.id)} />
          }
          onUnlock={() => setActionSheetPlayerId(null)}
          onToggleInjury={() => handleToggleInjury(actionSheetPlayer.id, !actionSheetInjured)}
          onToggleLoan={() => handleToggleLoan(actionSheetPlayer.id, !actionSheetLoaned)}
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

      {fillSpotZone && (
        <SlotFillSheet
          slotLabel={fillSpotZone === "forward" ? "forward spot" : "back spot"}
          candidates={swappableBench.map((p) => ({ id: p.id, name: p.full_name, jerseyNumber: p.jersey_number }))}
          emptyMessage="Nobody on the bench can come on."
          onPick={(pid) => {
            const zone = fillSpotZone;
            setFillSpotZone(null);
            // A deliberate pick: straight on, with AFL's toast.
            fillVacantSpot(pid, zone);
            chrome.swapped(null, pid);
          }}
          onCancel={() => setFillSpotZone(null)}
        />
      )}

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
            spotLabel={LEAGUE_SPOT_LABEL[injuryReplacementModal.zone]}
            candidates={candidates}
            onPickReplacement={(rid) => handleInjuryReplacement(injuryReplacementModal.injuredId, rid)}
            onSkipReplacement={() => handleInjuryMarkOnly(injuryReplacementModal.injuredId)}
            onCancel={() => setInjuryReplacementModal(null)}
          />
        );
      })()}

      {chrome.overlays}

      {/* First-tap long-press discovery hint. */}
      {/* Hidden while the player dock is open so it never covers it. */}
      <LongPressHint enabled={isPeriodActive && !selectedPlayer} />
    </div>
  );
}
