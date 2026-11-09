"use client";

// ─── LeagueLiveGame ──────────────────────────────────────────
// Rugby-league live-game orchestrator. Mirrors AFL `LiveGame.tsx`
// and netball `NetballLiveGame.tsx` end-to-end so coaches who run
// teams in multiple sports get a consistent live-game shell —
// shared live v3 shell (`LiveShell`, `LiveTopBar`, `LiveGameMenu`)
// wrapped around RL-specific surfaces.
//
// In-game writes are optimistic (useOptimisticEvents): a try, an undo, a
// sub or a move shows the moment it's tapped and the screen replays the
// server's events plus the ones on their way, as soccer's and touch's
// do. The shared live chrome (useLiveChrome) is AFL's undo strip flash,
// tap-tap swap confirm and toast, and lent minutes on the long-press
// sheet (UX audit 23 Oct 2026, "Drift from AFL").

import dynamic from "next/dynamic";
import { useOtherPhoneScores } from "@/components/live/useOtherPhoneScores";
import { WENT_HOME_REASON, wentHomeIds } from "@/lib/live/wentHome";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LiveTopBar } from "@/components/live/LiveTopBar";
import { LeagueGameSettingsModal } from "./LeagueGameSettingsButton";
import { LiveShell } from "@/components/live/LiveShell";
import { LiveGameMenu, settingsSummary } from "@/components/live/LiveGameMenu";
import { LiveScoreFix } from "@/components/live/ScoresSheet";
import { KidSlot, KidTile, type KidOutKind } from "@/components/live/KidTile";
import { KidBench } from "@/components/live/KidBench";
import { InfoLine } from "@/components/live/InfoLine";
import { PairsSheet, type SheetPair } from "@/components/live/PairsSheet";
import { KidBar, KidBarMore, TimeSplit } from "@/components/live/KidBar";
import { LateArrivalMenu } from "@/components/live/LateArrivalMenu";
import { StartQuarterModal } from "@/components/live/StartQuarterModal";
import { LeagueWalkthroughOffer } from "@/components/live/WalkthroughOffer";
import { useSquadNames } from "@/components/live/SquadNames";
import { barButton, BAR_SMALL } from "@/components/live/barButtons";
import { kidWords, type KidOut, type KidSubRole } from "@/lib/live/kidWords";
import { minBarText, pctOfGame, type MinTimeState } from "@/lib/live/minGameTime";
import { leagueMinTimeStates } from "@/lib/sports/rugby_league/minTime";
import { formatMinSec } from "@/lib/sports/netball/fairness";
import { reopenLeagueLineup } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/league-actions";
import { LEAGUE_DENSE_FROM, LeagueFieldLines } from "./LeagueFieldLines";
import { vestLabel } from "./PlayerVestBadge";
import { kickBadgeLabel } from "./PlayerKickBadge";
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
import { playSubDueBeep, useSubDueAudioUnlock } from "@/lib/live/subDueBeep";
import { useScrollToTopOnFinish } from "@/lib/live/useScrollToTopOnFinish";
import { hapticTap } from "@/lib/haptics";
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
import { liveEvents } from "@/lib/live/optimisticEvents";
import { undoOf, undoTap, type UndoTap } from "@/lib/live/undoTarget";
import type { UndoEvent } from "@/lib/live/lastUndoable";
import { useLiveChrome } from "@/components/live/useLiveChrome";
import { undoSwaps } from "@/lib/live/liveChrome";
import { computePeriodClockMs } from "@/lib/live/periodClock";
import { clockPauseInput } from "@/lib/live/clockPause";
import { useEventPeriodPause } from "@/lib/live/useClockPause";
import { resolveLeagueSubAnchorElapsed } from "@/lib/sports/rugby_league/subAnchor";
import { openSubBatch } from "@/lib/live/subAnchor";
import { leagueSwapPossible } from "@/lib/sports/rugby_league/legalSwap";
import { finaliseLeagueGame } from "@/app/(app)/teams/[teamId]/games/[gameId]/live/league-actions";
import { LeagueScoreBug } from "./LeagueScoreBug";
import { UnbrokenPeriodWarning } from "./UnbrokenPeriodWarning";
import { LeagueScorerPicker } from "./LeagueScorerPicker";
import { LeagueFullTimeReview } from "./LeagueFullTimeReview";
import { LeagueGameSummaryCard } from "./LeagueGameSummaryCard";
import { VestAssignmentCard } from "./VestAssignmentCard";
import { LeagueBreak } from "./LeagueBreak";
import { RecordConversionDialog } from "./RecordConversionDialog";
import { KickoffPicker } from "./KickoffPicker";
import { currentVests, missingVestOnField, type VestType } from "@/lib/sports/rugby_league/vests";
import {
  conversionTryEventId,
  playerConversionStatusInCycle,
  kickoffTakers,
  kickoffRecordedForPeriod,
  OPPONENT_NO_TRY,
  opponentTriesToConvert,
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
import { rugbyFills, type RugbyFill } from "@/lib/sports/rugby/fills";
import { rugbyForwards } from "@/lib/sports/rugby/lines";
import { Modal } from "@/components/ui/Modal";
import { periodLabels } from "@/lib/sports";
import { endPeriodWords } from "@/lib/sports/words";
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
  const { events: thisGameEvents, write, queueReady } = useOptimisticEvents(serverEvents, { gameId: game.id, onError: setError });
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
  // Live v3: the ⋯ game menu, Start H1's confirm, and the pairs sheet.
  const [menuOpen, setMenuOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [pairsOpen, setPairsOpen] = useState(false);
  const [kickoffOpen, setKickoffOpen] = useState(false);
  const names = useSquadNames();
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
    wentHome?: boolean;
    /** Lent, not hurt: the same who-comes-on, as AFL's lend. */
    lent?: boolean;
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
  const pause = useEventPeriodPause(thisGameEvents, state.currentQuarter, startedAtMs, clockMultiplier);
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
  // A score from the other phone says so (Stagehand round 8, #6).
  useOtherPhoneScores(thisGameEvents, RUGBY_SCORE_EVENT_TYPES, { teamName: teamName, opponentName: game.opponent || "Opponent" });
  const chrome = useLiveChrome({
    auth,
    gameId: game.id,
    teamName,
    opponentName: game.opponent || "Opponent",
    playersById: playerById,
    seasonLoanMinutes: seasonLoanMins,
    events: thisGameEvents,
    scoreTypes: RUGBY_SCORE_EVENT_TYPES,
    period: isPeriodActive ? state.currentQuarter : null,
    openElapsedMs: isPeriodActive ? elapsedMs : null,
    toastLook: "ink",
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
    // The clock reads now from the tap, not the last tick (a page opened
    // paused has none yet).
    setNowMs(now);
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
  // The summary after Finish opens at the top: the final score and Copy
  // for group chat, not the review's scroll (round 2, 24 Oct 2026).
  useScrollToTopOnFinish(state.finalised, liveRootRef);

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
  const wentHomeSet = useMemo(() => wentHomeIds(thisGameEvents), [thisGameEvents]);
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
    // A lent kid wears no vest of ours: the DH stayed drawn on a kid
    // playing for the other team (Stagehand round 9). The vest is still
    // theirs in the log until it's handed on (the missing-vest prompt).
    const map: Record<string, VestType> = {};
    if (activeVests.fr && !loanedSet.has(activeVests.fr)) map[activeVests.fr] = "fr";
    if (activeVests.dh && !loanedSet.has(activeVests.dh)) map[activeVests.dh] = "dh";
    return map;
  }, [activeVests, loanedSet]);
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

  useSubDueAudioUnlock();

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
  // A short side with a kid on the bench who can play: the empty spots
  // are the card's first suggestions, nobody off (rugby/fills; round 3
  // edge cases, 24 Oct 2026).
  const fillSuggestions = useMemo(() => {
    if (state.currentQuarter < 1 || state.quarterEnded || state.finalised || !lineup) return [];
    return rugbyFills({
      lineup,
      bench: swappableBench.map((p) => p.id),
      onFieldSize: game.on_field_size,
      forwards: rugbyForwards(ageGroup, game.on_field_size),
      msByPlayer: totalMsByPlayer,
    });
  }, [state.currentQuarter, state.quarterEnded, state.finalised, lineup, swappableBench, game.on_field_size, ageGroup, totalMsByPlayer]);
  const swapSuggestions = useMemo(() => {
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
  // One pair of the planned sub made: just the swaps still to make, not
  // the kid just taken off straight back on (lib/live/subAnchor).
  const batchLeft = useMemo(
    () => (state.quarterEnded || state.finalised ? 0 : openSubBatch(thisGameEvents, state.currentQuarter)),
    [thisGameEvents, state.currentQuarter, state.quarterEnded, state.finalised],
  );
  // A kid filling an empty spot isn't also swapped on.
  const nextSubSuggestions = useMemo(() => {
    const filling = new Set(fillSuggestions.map((f) => f.playerId));
    const swaps = swapSuggestions.filter((s) => !filling.has(s.on.playerId));
    return batchLeft > 0 ? swaps.slice(0, batchLeft) : swaps;
  }, [swapSuggestions, fillSuggestions, batchLeft]);

  // A sub is due only when the laws allow one: with §6 (or the floor)
  // keeping every kid on, "Sub due — rotate a player off" told the coach
  // to break the law, as the §6 card below said "Stay on to the hooter"
  // (round 2, 24 Oct 2026). The laws are mustStayOn's (legalSwap.ts).
  const swapPossible = useMemo(
    () =>
      isPeriodActive &&
      !!lineup &&
      leagueSwapPossible({
        events: thisGameEvents,
        period: state.currentQuarter,
        lineup: { forwards: lineup.forwards, backs: lineup.backs, bench: swappableBench.map((p) => p.id) },
        elapsedMs,
        laws: subLaws,
        playbook: leaguePlaybook,
        keepOn: excludeOff,
      }),
    [isPeriodActive, lineup, thisGameEvents, state.currentQuarter, swappableBench, elapsedMs, subLaws, leaguePlaybook, excludeOff],
  );

  // Live v3: the sub's due when the clock says so and the laws allow one.
  // The info line says it (an alert), the kids' words and the bar.
  const subDue = subIsDue && swapPossible;
  // The next sub falls at or after the hooter: no more this period, so
  // the pairs go (as AFL's), unless one's due now. A short side's empty
  // spots still fill.
  const subPastHooter =
    isPeriodActive && msUntilDue !== null && elapsedMs + msUntilDue >= periodSeconds * 1000;
  const subsDoneThisPeriod = subPastHooter && !subDue;
  const shownSwaps = isPeriodActive && !subsDoneThisPeriod ? nextSubSuggestions : [];
  const shownFills = isPeriodActive ? fillSuggestions : [];
  // Before the whistle: the lineup's set (the picker's Ready), H1 isn't.
  const preKickoff = !!lineup && state.currentQuarter === 0 && !state.finalised;

  // The 50% floor (plan default 5): who's at risk of missing it by full
  // time, counted as the suggester counts it (rugby_league/minTime).
  const minStates = useMemo(
    () =>
      isPeriodActive && lineup
        ? leagueMinTimeStates({
            events: thisGameEvents,
            currentQuarter: state.currentQuarter,
            elapsedMs,
            gameElapsedMs: nowAbsMs,
            periodMs: periodSeconds * 1000,
            periodCount: ageGroup.periodCount,
            minPct: subLaws.minGameTimePct ?? 0,
            soonMs: subIntervalMs ?? periodSeconds * 1000,
            playerIds: [...lineup.forwards, ...lineup.backs, ...lineup.bench],
            out: new Set([...injuredIds, ...loanedIds]),
          })
        : new Map<string, MinTimeState>(),
    [isPeriodActive, lineup, thisGameEvents, state.currentQuarter, elapsedMs, nowAbsMs, periodSeconds, ageGroup.periodCount, subLaws, subIntervalMs, injuredIds, loanedIds],
  );

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
  // A wearer hurt with nobody to replace them keeps their field slot,
  // but isn't wearing the vest on the field (round 3 edge cases, 24 Oct
  // 2026: H2 was played with no First Receiver and no prompt).
  const missingVestWearer = useMemo<VestType | null>(() => {
    if (!vestRequired || !lineup) return null;
    if (state.currentQuarter < 1 || state.finalised) return null;
    return missingVestOnField({
      vests: activeVests,
      onField: onFieldIds,
      injured: injuredSet,
      loaned: loanedSet,
      required: ageGroup.vestRequirements,
    });
  }, [
    vestRequired,
    lineup,
    state.currentQuarter,
    state.finalised,
    ageGroup.vestRequirements,
    activeVests,
    onFieldIds,
    injuredSet,
    loanedSet,
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

  // The sub due beeps and buzzes as it comes, as AFL's does. Not while
  // the coach is scoring (a scorer or kicker sheet up, or a field kid
  // picked with + Try in the kid bar): it waits for them, as AFL's waits.
  const holdForScoring =
    scorerPickerOpen || goalPicker !== null || conversionDialogOpen || (trackScoring && isPeriodActive && selectedOnField);
  const subDueRef = useRef(false);
  useEffect(() => {
    if (holdForScoring) return;
    if (subDue && !subDueRef.current) {
      playSubDueBeep();
      void hapticTap("heavy");
    }
    subDueRef.current = subDue;
  }, [subDue, holdForScoring]);

  // The player sheet closed: focus goes back to its kid. The kid bar's
  // More that opened it went with the kid bar, so the sheet's own
  // return has nowhere to land (a keyboard user was left on the page).
  const sheetKidRef = useRef<string | null>(null);
  useEffect(() => {
    if (actionSheetPlayerId) {
      sheetKidRef.current = actionSheetPlayerId;
      return;
    }
    const pid = sheetKidRef.current;
    sheetKidRef.current = null;
    if (!pid) return;
    const frame = window.requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      document.querySelector<HTMLElement>(`[data-testid="league-player-tile-${pid}"]`)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [actionSheetPlayerId]);

  // ── Click handlers ────────────────────────────────────────────
  function handlePlayerTap(playerId: string) {
    setError(null);
    setSelectedPlayerId((prev) => (prev === playerId ? null : playerId));
  }

  function handleClearSelection() {
    setSelectedPlayerId(null);
  }

  // The period's end is an optimistic write, like every other tap: the
  // break opens at the hooter with or without signal (round 3, 24 Oct
  // 2026: it waited on the save).
  const endQuarterAtClient = useCallback(
    (elapsed: number) => {
      setError(null);
      write(
        "endLeagueQuarter",
        [auth, game.id, state.currentQuarter, elapsed],
        liveEvents.periodEnd({ quarter: state.currentQuarter, elapsed_ms: elapsed }),
      );
    },
    [auth, game.id, state.currentQuarter, write],
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
    // Not before a queued period end from before a reload is drawn: it
    // would end the period a second time.
    if (!queueReady) return;
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
    queueReady,
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
  // A null scorer: "Not sure who" (the try counts without a name).
  function recordTryForPlayer(playerId: string | null) {
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
    const key = write(
      "recordTry",
      [auth, game.id, playerId, state.currentQuarter, elapsedRef.current],
      liveEvents.score("try", playerId, at()),
    );
    void hapticTap("light");
    chrome.scored({ side: "us", what: rugbyScoreWhat(sport, "try"), scorerId: playerId, key });
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
    const key = write(
      "recordOpponentTry",
      [auth, game.id, state.currentQuarter, elapsedRef.current],
      liveEvents.score("opponent_try", null, at()),
    );
    chrome.scored({ side: "them", what: rugbyScoreWhat(sport, "opponent_try"), key });
  }

  function handleOpenConversionDialog() {
    setError(null);
    setConversionAfterTry(false);
    setConversionDialogOpen(true);
  }

  function handleRecordOpponentConversion() {
    setError(null);
    // Their conversion needs one of their tries (the server checks too).
    if (opponentTriesToConvert(thisGameEvents) === 0) {
      setError(OPPONENT_NO_TRY);
      return;
    }
    const key = write(
      "recordOpponentConversion",
      [auth, game.id, state.currentQuarter, elapsedRef.current],
      liveEvents.score("opponent_conversion", null, at()),
    );
    chrome.scored({ side: "them", what: rugbyScoreWhat(sport, "opponent_conversion"), key });
  }

  // Our kick at goal after a try, from the conversion dialog. It names
  // the try it converts once the server has that try (a try still on its
  // way is paired by the server); a kick the server refuses comes off
  // the screen and the refusal shows above the field.
  function recordConversion(kickerId: string, made: boolean, force: boolean) {
    setError(null);
    const tryEventId = conversionTryEventId(thisGameEvents);
    const key = write(
      "recordConversionAttempt",
      [auth, game.id, kickerId, made, state.currentQuarter, elapsedRef.current, { force, tryEventId }],
      liveEvents.conversion({ kicker_id: kickerId, made, force, try_event_id: tryEventId, ...at() }),
    );
    chrome.scored({ side: "us", what: rugbyScoreWhat(sport, "conversion_attempt", made), scorerId: kickerId, key });
  }

  // U13+ (international laws): penalty goal 2, field goal 1. Ours name
  // the kicker (from the picker or the dock); theirs record directly.
  function recordLeagueGoalKind(
    kind: "penalty_goal" | "field_goal" | "opponent_penalty_goal" | "opponent_field_goal",
    kickerId: string | null,
  ) {
    setError(null);
    const ours = !kind.startsWith("opponent_");
    const key = write(
      "recordLeagueGoal",
      [auth, game.id, kind, kickerId, state.currentQuarter, elapsedRef.current],
      liveEvents.score(kind, ours ? kickerId : null, at()),
    );
    chrome.scored({ side: ours ? "us" : "them", what: rugbyScoreWhat(sport, kind), scorerId: ours ? kickerId : null, key });
    handleClearSelection();
  }

  // The strip's Undo takes back the score it names (useOneUndo: this
  // phone's newest, never whatever the other phone scored since, UX
  // round 2); full time's "Undo last score" the latest.
  function writeScoreUndo(tap: UndoTap) {
    if (tap.kind !== "undo") return;
    setError(null);
    write("undoLeagueScore", [auth, game.id, tap.target], tap.optimistic);
    chrome.undone();
  }
  const handleUndoScore = () => writeScoreUndo(undoTap(thisGameEvents, RUGBY_SCORE_EVENT_TYPES, null));
  const handleUndoNamedScore = (score: UndoEvent) => writeScoreUndo(undoOf(score));

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
  // doesn't restart (AFL's rule). `leftInBatch`: one pair of the planned
  // sub, with this many swaps still to make (the clock holds).
  function sub(offId: string, onId: string, manual = false, leftInBatch = 0, undo = false) {
    setError(null);
    const input = {
      off_player_id: offId,
      on_player_id: onId,
      ...(leftInBatch > 0 ? { batch_left: leftInBatch } : {}),
      ...(manual ? { manual } : {}),
      ...(undo ? { undo } : {}),
      ...at(),
    };
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
  /** Bench kids on into empty spots, nobody off: one lineup for them all. */
  function fillSpots(fills: readonly RugbyFill[]) {
    if (!lineup || fills.length === 0) return;
    const on = new Set(fills.map((f) => f.playerId));
    saveLineup({
      forwards: [...lineup.forwards, ...fills.filter((f) => f.zone === "forward").map((f) => f.playerId)],
      backs: [...lineup.backs, ...fills.filter((f) => f.zone === "back").map((f) => f.playerId)],
      bench: lineup.bench.filter((id) => !on.has(id)),
    });
  }

  function handleApplyAllSubs() {
    const fills = shownFills;
    const swaps = shownSwaps;
    const made = fills.length + swaps.length;
    if (made === 0) return;
    // The fills first (a whole lineup), then the swaps on top of it.
    fillSpots(fills);
    for (const swap of swaps) sub(swap.off.playerId, swap.on.playerId);
    // The toast's Undo puts the swaps back, last first (undoSwaps); a fill
    // has nobody to bring back, so there's no Undo once one is made.
    const undo =
      fills.length === 0
        ? undoSwaps(
            swaps.map((s) => ({ off: s.off.playerId, on: s.on.playerId })),
            (s) => sub(s.off, s.on),
          )
        : undefined;
    if (made === 1 && fills.length === 1) chrome.swapped(null, fills[0].playerId);
    else if (made === 1) chrome.swapped(swaps[0].off.playerId, swaps[0].on.playerId, undo);
    else chrome.showToast(`${made} subs made`, undo, `the ${made} swaps`);
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
    // Field ↔ bench (or bench ↔ field): a rolling sub, at once; the
    // toast says what changed, with Undo (AFL's).
    if (Boolean(firstZone) !== Boolean(secondZone)) {
      const off = firstZone ? first : secondId;
      const on = firstZone ? secondId : first;
      // Never bring a hurt or lent kid on, e.g. one selected before they
      // were lent (Stagehand round 4): this tap starts a new selection.
      if (injuredSet.has(on) || loanedSet.has(on)) return false;
      chrome.manualSwap({
        offId: off,
        onId: on,
        spotName: lineName((firstZone ?? secondZone)!),
        run: () => sub(off, on, true),
        undo: () => sub(on, off, true),
      });
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
      // A bench kid into an empty spot goes on at once, as AFL's does.
      chrome.manualSwap({ offId: null, onId: kid, spotName: lineName(slotZone), run: () => fillVacantSpot(kid, slotZone) });
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

  // Going home is an injury with reason "out" (lib/live/wentHome).
  function markInjured(playerId: string, injured: boolean, wentHome = false) {
    setError(null);
    const input = { player_id: playerId, injured, ...at(), ...(injured && wentHome ? { reason: WENT_HOME_REASON } : {}) };
    write("markInjury", [auth, game.id, input], liveEvents.injury(input));
  }

  function handleToggleInjury(playerId: string, injured: boolean, wentHome = false) {
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
        setInjuryReplacementModal({ injuredId: playerId, zone, wentHome });
        return;
      }
    }
    // Direct path: recovery, bench-player injury, or no bench available.
    markInjured(playerId, injured, wentHome);
    setActionSheetPlayerId(null);
  }

  /**
   * Coach picked a replacement from the InjuryReplacementModal.
   * Fires markInjury + recordLeagueSwap in order so the replay sees:
   *   1. injury (flag only — player stays in field slot)
   *   2. swap (off=injured, on=replacement) — replacement takes the
   *      exact same slot; injured moves to bench with INJ badge.
   */
  function handleInjuryReplacement(injuredId: string, replacementId: string, wentHome = false) {
    setInjuryReplacementModal(null);
    // In order, in the one game lane: the injury, then who comes on.
    markInjured(injuredId, true, wentHome);
    sub(injuredId, replacementId);
    chrome.swapped(injuredId, replacementId);
  }

  /**
   * Coach tapped "Mark injured without replacement" — just flag the
   * player as injured, leave their field slot vacant.
   */
  function handleInjuryMarkOnly(playerId: string, wentHome = false) {
    setInjuryReplacementModal(null);
    markInjured(playerId, true, wentHome);
  }

  function handleToggleLoan(playerId: string, loaned: boolean) {
    // A lent kid stops being selected now: the next tap would swap them
    // on (Stagehand round 4).
    if (loaned) setSelectedPlayerId((s) => (s === playerId ? null : s));
    // Lending a kid off the field asks who comes on, as AFL's does. It
    // left a gap with no word (Stagehand round 9); with nobody on the
    // bench the sheet says so and lends them short.
    const zone: "forward" | "back" | null =
      loaned && lineup && isPeriodActive
        ? lineup.forwards.includes(playerId)
          ? "forward"
          : lineup.backs.includes(playerId)
            ? "back"
            : null
        : null;
    if (zone) {
      setActionSheetPlayerId(null);
      setInjuryReplacementModal({ injuredId: playerId, zone, lent: true });
      return;
    }
    markLoan(playerId, loaned);
    setActionSheetPlayerId(null);
  }

  function markLoan(playerId: string, loaned: boolean) {
    setError(null);
    const input = { player_id: playerId, loaned, ...at() };
    write("markLoan", [auth, game.id, input], liveEvents.loan(input));
  }

  /**
   * A lent kid's replacement: the swap first (the replacement takes the
   * lent kid's slot, so the line keeps its shape; a loan drops the kid
   * from their line and the swap would then have no slot to fill), then
   * the loan on the kid now on the bench.
   */
  function handleLendReplacement(lentId: string, replacementId: string) {
    setInjuryReplacementModal(null);
    sub(lentId, replacementId);
    markLoan(lentId, true);
    chrome.swapped(lentId, replacementId);
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
          onNoScorer={() => {
            setScorerPickerOpen(false);
            recordTryForPlayer(null);
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
          write={write}
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
                  onUndo: handleUndoNamedScore,
                  disabled: pending,
                })}
                {/* The game's scores, each with "Change who scored" (the
                    Scores and fixes sheet's list, as every break's). */}
                {(state.teamScore.points > 0 || state.opponentScore.points > 0) && (
                  <div className="border-t border-hairline pt-3">
                    <LiveScoreFix
                      auth={auth}
                      gameId={game.id}
                      version={`${state.teamScore.points}:${state.opponentScore.points}`}
                    />
                  </div>
                )}
                {scoreOverlays}
              </div>
            ) : undefined
          }
        />
        {error && <InlineAlert kind="danger">{error}</InlineAlert>}
      </div>
    );
  }

  // ─── Live v3's shell (Phase 8) ─────────────────────────────
  // Before the first whistle and through the period the screen is
  // LiveShell, as AFL's: the top bar (‹ Exit · vs X · ⋯), the light score
  // header, the undo line, the info line (the next sub), rugby's field
  // (two lines of KidTiles), the bench and the bar. The break is
  // LeagueBreak (above); full time and the finished game keep their page.
  const lineLabel = (line: "forward" | "back") => (line === "forward" ? "Forwards" : "Backs");
  const lineShort = (zone: "forward" | "back") => (zone === "forward" ? "FWD" : "BACK");
  const inPlay = isPeriodActive;
  // The planned sub, pair by pair: a short side's empty spots first (a
  // bench kid on, nobody off), then the swaps. Each kid's part in it.
  type Planned =
    | { kind: "fill"; fill: RugbyFill; where: string }
    | { kind: "swap"; swap: (typeof nextSubSuggestions)[number]; where: string };
  const planned: Planned[] = [
    ...shownFills.map((fill) => ({ kind: "fill" as const, fill, where: lineShort(fill.zone) })),
    ...shownSwaps.map((swap) => ({ kind: "swap" as const, swap, where: swap.position?.label ?? lineShort(swap.zone) })),
  ];
  const pairOf = new Map<string, { i: number; role: "off" | "on"; where: string }>();
  planned.forEach((p, i) => {
    if (p.kind === "fill") pairOf.set(p.fill.playerId, { i, role: "on", where: p.where });
    else {
      pairOf.set(p.swap.off.playerId, { i, role: "off", where: p.where });
      pairOf.set(p.swap.on.playerId, { i, role: "on", where: p.where });
    }
  });
  const positionLabels = lineup
    ? assignLeaguePositionLabels({ forwards: lineup.forwards, backs: lineup.backs }, leaguePlaybook, heldSlots)
    : {};

  function makeOnePair(i: number) {
    const p = planned[i];
    if (!p) return;
    if (planned.length === 1) {
      makeAllPairs();
      return;
    }
    if (p.kind === "fill") {
      fillSpots([p.fill]);
      chrome.swapped(null, p.fill.playerId);
    } else {
      // One of the batch: the other swaps stay planned for the same time
      // and the sub clock holds. It used to count as the whole rotation:
      // the clock restarted and the rest slid an interval later
      // (Stagehand, 9 Nov 2026). A fill is a lineup, not a swap: it never
      // moved the clock.
      sub(p.swap.off.playerId, p.swap.on.playerId, false, shownSwaps.length - 1);
      // Undo puts the pair back in the plan: the swap back reopens the
      // whole batch, so the clock still holds (Stagehand round 10).
      const { off, on } = p.swap;
      const batch = shownSwaps.length;
      chrome.swapped(off.playerId, on.playerId, () => sub(on.playerId, off.playerId, false, batch, true));
    }
    handleClearSelection();
  }
  function makeAllPairs() {
    handleApplyAllSubs();
    setPairsOpen(false);
  }
  const sheetPairs: SheetPair[] = planned.flatMap((p, index) => {
    const offId = p.kind === "fill" ? null : p.swap.off.playerId;
    const onId = p.kind === "fill" ? p.fill.playerId : p.swap.on.playerId;
    const off = offId ? playerById.get(offId) : null;
    const on = playerById.get(onId);
    if (!on || (offId && !off)) return [];
    return [
      {
        index,
        offId: offId ?? "",
        onId,
        offName: off ? names.first(off) : "Empty spot",
        onName: names.first(on),
        offFull: off ? off.full_name : "the empty spot",
        onFull: on.full_name,
        where: p.where,
        edited: false,
      },
    ];
  });
  const openPairs = () => {
    handleClearSelection();
    setPairsOpen(true);
  };

  // Plan the next period (F2): the chip at the end of the info line, as
  // AFL's, in the period's last sub window; in ⋯ too.
  const nextPeriodTag = `${periodAbbrev}${state.currentQuarter + 1}`;
  const showPlanNext = isPeriodActive && inFinalWindow && !isLastPeriod;
  const planLabel = hasPinnedNextPeriod ? `Edit ${nextPeriodTag} plan` : `Plan ${nextPeriodTag}`;
  const planChip = showPlanNext ? (
    hasPinnedNextPeriod ? (
      <span
        data-testid="planned-next-period-badge"
        className="flex flex-none items-center gap-[4px] rounded-[11px] py-[2px] pl-[10px] pr-[4px] text-brand-700 shadow-[inset_0_0_0_1.5px_currentColor]"
      >
        <button
          type="button"
          data-testid="plan-next-period-entry"
          onClick={() => setPlanNextOpen(true)}
          aria-label={`${nextPeriodTag} ready. ${planLabel}`}
          className="min-h-[32px] font-display text-[0.78125rem] font-extrabold"
        >
          {nextPeriodTag} ready ✓
        </button>
        <button
          type="button"
          data-testid="plan-next-clear"
          onClick={() => setPlannedRotation(consumePeriodPin(pinForThisGame, state.currentQuarter))}
          className="inline-flex min-h-[32px] items-center px-[6px] font-display text-[0.75rem] font-extrabold underline underline-offset-2"
        >
          Clear
        </button>
      </span>
    ) : (
      <button
        type="button"
        data-testid="plan-next-period-entry"
        onClick={() => setPlanNextOpen(true)}
        className="inline-flex min-h-[36px] flex-none items-center rounded-[11px] px-[10px] font-display text-[0.78125rem] font-extrabold text-ink shadow-[inset_0_0_0_1.5px_rgb(var(--l-hairline))] hover:bg-surface-alt"
      >
        {planLabel}
      </button>
    )
  ) : null;

  // ── One kid (KidTile) ──
  function kidTile(pid: string, line: "forward" | "back" | null) {
    const p = playerById.get(pid);
    if (!p) return null;
    const hurt = injuredSet.has(pid);
    const lent = loanedSet.has(pid);
    const home = hurt && wentHomeSet.has(pid);
    const out: KidOut | null = hurt ? { kind: "injured", wentHome: home } : lent ? { kind: "lent" } : null;
    const outKind: KidOutKind | null = hurt ? (home ? "home" : "injured") : lent ? "lent" : null;
    const pair = out || !inPlay ? null : pairOf.get(pid) ?? null;
    const sub: KidSubRole | null = pair ? (pair.role === "off" ? { role: "off" } : { role: "on", to: pair.where }) : null;
    const floor = out ? null : minStates.get(pid) ?? null;
    const words = kidWords({
      place: line ? "field" : "bench",
      sub,
      subDue,
      needsMin: floor?.atRisk ? floor.neededMin : null,
      rollingSubs: true,
      subsDoneThisPeriod,
      out,
      inPlay,
      lastPeriod: isLastPeriod,
    });
    const tries = state.playerTries[pid] ?? 0;
    const kicks = conversionByPlayer[pid]?.attemptsInCycle ?? 0;
    const vest = vestByPlayer[pid] ?? null;
    const pos = line ? positionLabels[pid] ?? null : null;
    const totalMs = totalMsByPlayer[pid];
    // Their tries and (junior kick rotation) their kicks this cycle: "1T K1".
    const scoreText = [trackScoring && tries > 0 ? `${tries}T` : null, kicks > 0 ? `K${kicks}` : null].filter(Boolean).join(" ");
    return (
      <KidTile
        testId={`league-player-tile-${pid}`}
        name={names.tile(p)}
        spoken={{
          name: p.full_name,
          place: line ? pos || lineLabel(line) : null,
          number: p.jersey_number,
          time: totalMs !== undefined ? formatMinSec(totalMs) : null,
          states: [
            trackScoring && tries > 0 ? `${tries} ${tries === 1 ? "try" : "tries"}` : null,
            vest ? vestLabel(vest) : null,
            kickBadgeLabel(conversionByPlayer[pid] ?? null, kickoffTakerIds.has(pid)),
            floor?.atRisk ? `under ${floor.minPct}% of the game` : null,
          ],
        }}
        place={line ? "field" : "bench"}
        pos={pos}
        score={scoreText ? { text: scoreText, label: "" } : null}
        words={words}
        badge={pair ? { n: pair.i + 1, hot: subDue } : null}
        selected={selectedPlayerId === pid}
        due={!!pair && subDue}
        // At risk of the floor: the sun edge, in the planned sub or not
        // (its words then say when they go on).
        under={!!floor?.atRisk}
        flag={vest ? vest.toUpperCase() : null}
        out={outKind}
        dense={denseField && !!line}
        onClick={
          preKickoff
            ? undefined
            : out
              ? // Hurt or lent: a tap opens their sheet (Back on, Bring back).
                () => handlePlayerLongPress(pid)
              : () => handlePlayerTapMaybeSwap(pid)
        }
        onLongPress={() => handlePlayerLongPress(pid)}
      />
    );
  }

  const denseField = Math.max(game.on_field_size, onFieldIds.length) >= LEAGUE_DENSE_FROM;
  const fieldEl = lineup ? (
    <LeagueFieldLines
      sport={sport}
      forwardsBySize={ageGroup.forwardsBySize}
      forwardPlayers={forwardPlayers}
      backPlayers={backPlayers}
      onFieldSize={game.on_field_size}
      vestRequirements={ageGroup.vestRequirements}
      vestByPlayer={vestByPlayer}
      positionLabels={positionLabels}
      positionOrder={linePositionOrder(leaguePlaybook?.positions)}
      kid={(p, line) => kidTile(p.id, line === "forwards" ? "forward" : "back")}
      empty={(line) => (
        <KidSlot
          label={
            selectedPlayer
              ? `Move selected player to ${line}`
              : "Empty slot — tap to bring a bench player on"
          }
          text={selectedPlayer ? "Move here" : "Empty"}
          hot={!!selectedPlayer}
          onClick={() => {
            if (preKickoff) return;
            handleVacantSpotTap(line === "forwards" ? "forward" : "back");
          }}
        />
      )}
    />
  ) : null;

  // The bench: who can come on, then who's out (hurt, home, lent), then
  // kids lent before they were placed (tap one to bring them back).
  const benchIds = lineup?.bench ?? [];
  const lentAway = lentPlayers.filter((p) => !benchIds.includes(p.id) && !onFieldSet.has(p.id)).map((p) => p.id);
  const benchOrder = [
    ...benchIds.filter((id) => !injuredSet.has(id) && !loanedSet.has(id)),
    ...benchIds.filter((id) => injuredSet.has(id) || loanedSet.has(id)),
    ...lentAway,
  ];
  const benchEl = (
    <KidBench
      count={benchIds.length}
      dense={benchOrder.length > 6}
      tiles={benchOrder.map((pid) => (
        <div key={pid} className="min-w-0">
          {kidTile(pid, null)}
        </div>
      ))}
      late={
        lateArrivalCandidates.length > 0 ? (
          <LateArrivalMenu look="text" candidates={lateArrivalCandidates} onAdd={handleAddLateArrival} pending={pending} />
        ) : undefined
      }
    />
  );

  // ── The info line: the next sub, and who's under the floor ──
  const underCount = Array.from(minStates.values()).filter((m) => m.atRisk).length;
  const subSoft = !subDue && msUntilDue !== null && msUntilDue > 0 && msUntilDue <= 30_000 && hasSwappableBench && !subPastHooter;
  // Ending the period: ⋯'s "End Q2" (or "End 1st half") row, and "Time's
  // up: end Q2" on the info line once the clock reads 0:00 and it's still
  // open (paused at the hooter, the period waits). Both open the clock's
  // end confirm.
  const canEndPeriod = isPeriodActive && !!state.quarterStartedAt;
  const periodTimeUp = canEndPeriod && elapsedMs >= periodSeconds * 1000;
  const endWords = endPeriodWords({
    sport,
    periodLabel,
    period: state.currentQuarter,
    periodCount: ageGroup.periodCount,
    timeUp: periodTimeUp,
  });
  const openEndPeriod = () => {
    setSelectedPlayerId(null);
    setEndQConfirmOpen(true);
  };
  const infoEl =
    inPlay && (benchIds.length > 0 || planChip || periodTimeUp) ? (
      <InfoLine
        timeUp={periodTimeUp ? { prompt: endWords.prompt, onEnd: openEndPeriod } : undefined}
        state={subDue ? "due" : subSoft ? "soft" : "idle"}
        msUntilDue={subPastHooter ? null : msUntilDue}
        subIntervalMs={subIntervalMs ?? 0}
        swaps={sheetPairs.length}
        under={subLaws.minGameTimePct ? { count: underCount, minPct: subLaws.minGameTimePct } : null}
        periodWord={periodLabel}
        noBench={benchIds.length > 0 && !hasSwappableBench}
        onOpen={sheetPairs.length > 0 ? openPairs : undefined}
        plan={planChip}
      />
    ) : null;

  // ── Banners: notices that need the coach ──
  const misfits = isPeriodActive
    ? restrictedMisfits(liveSlots, leaguePlaybook).filter((m) => !injuredSet.has(m.playerId) && !loanedSet.has(m.playerId))
    : [];
  const BANNER = "rounded-[12px] bg-sun-soft px-3 py-2 text-[0.8125rem] leading-snug text-ink";
  // The whistle with nobody picked to kick off (§16): a prompt under the
  // top bar that opens the kick-off sheet, the score bar still in reach.
  const kickoffDue =
    kickoffNeededForPeriod && !kickoffSkippedRef.current.has(state.currentQuarter) && kickoffSkippedTick >= 0;
  const skipKickoff = () => {
    kickoffSkippedRef.current.add(state.currentQuarter);
    setKickoffSkippedTick((n) => n + 1);
    setKickoffOpen(false);
  };
  const bannersEl = (
    <>
      {error && (
        <p className="rounded-[12px] bg-blood-soft px-3 py-2 text-[0.8125rem] font-bold text-blood" role="alert">
          {error}
        </p>
      )}
      {/* The vest's replace sheet was closed while it still has no wearer
          on the field: a way back to it (round 5, league-u8-vests). */}
      {missingVestWearer && !forceVestReplaceOpen && isPeriodActive && (
        <div role="status" className={`flex items-center justify-between gap-3 ${BANNER}`}>
          <span>
            Nobody on the field is wearing the {missingVestWearer === "fr" ? "First Receiver" : "Dummy Half"} vest.
          </span>
          <button
            type="button"
            onClick={() => setForceVestReplaceOpen(true)}
            className="min-h-[36px] flex-none rounded-[10px] px-[10px] font-display text-[0.8125rem] font-extrabold text-ink shadow-[inset_0_0_0_1.5px_rgb(var(--l-hairline))]"
          >
            Pick
          </button>
        </div>
      )}
      {/* A front-row spot (union) held by a kid not picked for it: a sub,
          a replacement or a late arrival put them there. The planned sub
          never does; a coach's own swap can (UX audit, 23 Oct 2026). */}
      {misfits.map((m) => (
        <p key={m.key} role="status" data-testid="front-row-warning" className={BANNER}>
          {squad.find((p) => p.id === m.playerId)?.full_name ?? "A player"} is at {m.label} but isn&apos;t picked to play there.
        </p>
      ))}
      {kickoffDue && (
        <div
          role="status"
          data-testid="kickoff-prompt"
          className="flex items-center gap-[8px] rounded-[12px] px-3 py-[6px] text-[0.8125rem] leading-snug text-ink shadow-[inset_0_0_0_1.5px_rgb(var(--l-hairline))]"
        >
          <span className="min-w-0 flex-1">
            <b>Kickoff:</b> who&apos;s kicking off? It goes round the team.
          </span>
          <button
            type="button"
            onClick={() => {
              handleClearSelection();
              setKickoffOpen(true);
            }}
            className="min-h-[40px] flex-none rounded-[10px] bg-primary px-[12px] font-display text-[0.8125rem] font-extrabold text-on-primary"
          >
            Pick
          </button>
          <button
            type="button"
            onClick={skipKickoff}
            className="min-h-[40px] flex-none rounded-[10px] px-[8px] font-display text-[0.8125rem] font-extrabold text-ink-dim underline decoration-hairline underline-offset-[3px]"
          >
            Skip
          </button>
        </div>
      )}
      {/* §6: who must stay on, who must start the next period. */}
      {isPeriodActive && lineup && (
        <UnbrokenPeriodWarning
          sport={sport}
          players={[...fieldPlayers, ...benchPlayers]}
          events={thisGameEvents}
          ageGroup={ageGroup}
          currentQuarter={state.currentQuarter}
          currentElapsedMs={elapsedMs}
          sidelined={new Set([...Array.from(injuredSet), ...Array.from(loanedSet)])}
          shortName={names.tile}
        />
      )}
    </>
  );

  // ── The bar ──
  // A picked kid: the bar is theirs (KidBar). The sub due: MAKE ALL N
  // SWAPS and PAIRS. Otherwise the score bar, or (scoring off) where
  // things are.
  const btn = (tone: Parameters<typeof barButton>[0]) => barButton(tone, "sm");
  const gameMs = completedQuarterMs + liveOverlayMs;
  const kidBar =
    selectedPlayer && isPeriodActive
      ? (() => {
          const pid = selectedPlayer.id;
          const p = selectedPlayer;
          const line: "forward" | "back" | null = lineup?.forwards.includes(pid) ? "forward" : lineup?.backs.includes(pid) ? "back" : null;
          const pos = line ? positionLabels[pid] ?? null : null;
          const totalMs = totalMsByPlayer[pid] ?? 0;
          const floor = minStates.get(pid);
          const zm = zoneMsByPlayer?.[pid];
          const pair = pairOf.get(pid) ?? null;
          const plannedPair = pair ? planned[pair.i] : null;
          const first = names.first(p);
          const canScoreHere = trackScoring && !!line;
          const actions = [
            ...(canScoreHere
              ? [
                  <button key="try" type="button" onClick={handleRecordTryFromDock} disabled={pending} className={btn("primary")}>
                    + Try
                  </button>,
                  ...(goalsFromPlay
                    ? [
                        <button
                          key="pg"
                          type="button"
                          onClick={() => recordLeagueGoalKind("penalty_goal", pid)}
                          disabled={pending}
                          aria-label={`+ ${scoreWords.penaltyGoal.label}`}
                          className={btn("outlined")}
                        >
                          + {scoreWords.penaltyGoal.short}
                        </button>,
                        <button
                          key="fg"
                          type="button"
                          onClick={() => recordLeagueGoalKind("field_goal", pid)}
                          disabled={pending}
                          aria-label={`+ ${scoreWords.fieldGoal.label}`}
                          className={btn("outlined")}
                        >
                          + {scoreWords.fieldGoal.short}
                        </button>,
                      ]
                    : []),
                ]
              : []),
            <button
              key="injured"
              type="button"
              disabled={pending}
              onClick={() => {
                handleClearSelection();
                // On the field with someone to bring on: straight to who
                // comes on (handleToggleInjury); on the bench, marked at once.
                handleToggleInjury(pid, true);
              }}
              className={btn("hurt")}
            >
              <svg viewBox="0 0 20 20" className="h-[16px] w-[16px]" aria-hidden>
                <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
              </svg>
              Injured
            </button>,
            <KidBarMore
              key="more"
              onClick={() => {
                handleClearSelection();
                handlePlayerLongPress(pid);
              }}
            />,
          ];
          const pctLine = floor && subLaws.minGameTimePct ? minBarText(floor) : `${pctOfGame(totalMs, gameMs)}% of game`;
          return (
            <KidBar
              name={p.full_name}
              heading={`${p.jersey_number != null ? `#${p.jersey_number} ` : ""}${p.full_name}${pos ? ` · ${pos}` : ""}`}
              split={
                zm ? (
                  <TimeSplit
                    parts={[
                      { ms: zm.forwards, className: "bg-zone-f-fill" },
                      { ms: zm.centre, className: "bg-zone-c-fill" },
                      { ms: zm.backs, className: "bg-zone-b-fill" },
                    ]}
                  />
                ) : null
              }
              line={`${line ? lineLabel(line) : "Bench"} · ${Math.round(totalMs / 60_000)}′ this game · ${pctLine}`}
              hint={
                line ? (
                  <>
                    Tap another kid to swap with <b className="font-bold text-ink">{first}</b>.
                  </>
                ) : (
                  <>
                    Tap a field kid to swap <b className="font-bold text-ink">{first}</b> on.
                  </>
                )
              }
              pair={
                pair && plannedPair
                  ? {
                      n: pair.i + 1,
                      text:
                        plannedPair.kind === "fill"
                          ? `On → ${chrome.firstName(plannedPair.fill.playerId)}`
                          : `${chrome.firstName(plannedPair.swap.off.playerId)} → ${chrome.firstName(plannedPair.swap.on.playerId)}`,
                      where: pair.where,
                      hot: subDue,
                      onMake: () => makeOnePair(pair.i),
                      disabled: pending,
                    }
                  : null
              }
              actions={actions}
              columns={actions.length}
              onClose={handleClearSelection}
            />
          );
        })()
      : null;

  // The sub's due: the bar's one job is to make it.
  const dueBar =
    subDue && sheetPairs.length > 0 ? (
      <div className="grid grid-cols-[minmax(0,1fr)_84px] gap-[8px]">
        <button
          type="button"
          data-testid="bar-make-all"
          onClick={makeAllPairs}
          disabled={pending}
          aria-label={sheetPairs.length === 1 ? "Make this swap" : `Make all ${sheetPairs.length} swaps`}
          aria-describedby="bar-make-all-who"
          className={barButton("hot")}
        >
          {sheetPairs.length === 1 ? "Make this swap" : `Make all ${sheetPairs.length} swaps`}
          <span id="bar-make-all-who" className={`${BAR_SMALL} max-w-full truncate`}>
            {sheetPairs.map((sp) => sp.onName).join(", ")} on
          </span>
        </button>
        <button type="button" onClick={openPairs} aria-label="Pairs: edit one" className={barButton("outlined")}>
          Pairs
          <span className={BAR_SMALL}>see each</span>
        </button>
      </div>
    ) : null;

  // Before the whistle: the first-visit tour offer, then Start H1 (or
  // Q1), the place every sport starts from. Hi-vis: it's the "act now".
  const firstTag = `${periodAbbrev}1`;
  const preKickoffBar = (
    <div className="flex flex-col gap-[6px]">
      <LeagueWalkthroughOffer
        sport={sport}
        trackScoring={trackScoring}
        periodLabel={periodLabel}
        vests={{ fr: ageGroup.vestRequirements?.fr ?? false, dh: ageGroup.vestRequirements?.dh ?? false }}
        kickingAllowed={ageGroup.kickingAllowed === true}
        goalsFromPlay={ageGroup.goalsFromPlay === true}
        kickRotations={ageGroup.kickRotations === true}
        unbrokenPeriods={ageGroup.unbrokenPeriods === true}
        trackZoneTime={trackZoneTime}
      />
      <button
        type="button"
        onClick={() => setStartOpen(true)}
        disabled={pending}
        aria-label={`Start ${firstTag}`}
        className={barButton("hot")}
      >
        Start {firstTag}
        <span className={BAR_SMALL}>the clock starts when you confirm</span>
      </button>
    </div>
  );
  const scoringOffBar = (
    <p className="flex min-h-[58px] items-center px-[2px] text-[0.8125rem] text-ink-mute">
      <span>
        <b className="block font-display stretch-75 text-[1.125rem] font-extrabold text-ink">{teamName}</b>
        Tap any kid for swaps and player actions.
      </span>
    </p>
  );
  const scoreBugProps = {
    sport,
    teamName,
    opponentName: game.opponent || "Opponent",
    teamScore: state.teamScore,
    opponentScore: state.opponentScore,
    periodLabel,
    periodLabelPlural,
    currentPeriod: state.currentQuarter,
    periodCount: ageGroup.periodCount,
    clockReadout,
    quarterEnded: state.quarterEnded,
    trackScoring,
    kickingAllowed,
    pending,
    running,
  };
  const shellBar = preKickoff
    ? preKickoffBar
    : kidBar ??
      dueBar ??
      (trackScoring ? (
        <LeagueScoreBug
          {...scoreBugProps}
          part="bar"
          onTeamTry={isPeriodActive ? () => setScorerPickerOpen(true) : undefined}
          onTeamConversion={isPeriodActive && kickingAllowed ? handleOpenConversionDialog : undefined}
          onOpponentTry={isPeriodActive ? handleRecordOpponentTry : undefined}
          onOpponentConversion={isPeriodActive && kickingAllowed ? handleRecordOpponentConversion : undefined}
          onTeamPenaltyGoal={isPeriodActive && goalsFromPlay ? () => setGoalPicker("penalty_goal") : undefined}
          onTeamFieldGoal={isPeriodActive && goalsFromPlay ? () => setGoalPicker("field_goal") : undefined}
          onOpponentPenaltyGoal={isPeriodActive && goalsFromPlay ? () => recordLeagueGoalKind("opponent_penalty_goal", null) : undefined}
          onOpponentFieldGoal={isPeriodActive && goalsFromPlay ? () => recordLeagueGoalKind("opponent_field_goal", null) : undefined}
        />
      ) : (
        scoringOffBar
      ));

  const shellHeader = (
    <LeagueScoreBug
      {...scoreBugProps}
      part="header"
      preKickoff={preKickoff}
      subDue={subDue}
      onClockTap={isPeriodActive ? handleClockTap : undefined}
      onScores={
        trackScoring && !preKickoff
          ? () => {
              handleClearSelection();
              chrome.openScores();
            }
          : undefined
      }
    />
  );

  const roundWord = game.round_number != null ? `Round ${game.round_number}` : null;
  const sportLine = `${getSportConfig(sport).shortName} ${ageGroup.id}`;
  const topSubline = preKickoff
    ? [roundWord, game.location].filter(Boolean).join(" · ") || sportLine
    : [roundWord, sportLine].filter(Boolean).join(" · ");
  const whoRuns = auth.kind === "token" ? "Game-day link" : isAdmin ? "Team admin" : "Game manager";

  // Start H1 from the bar (live v3, B4, as AFL's): the picker's Ready set
  // the lineup; this is the whistle. On the queue, on screen at once.
  function handleStartFirstPeriod() {
    setStartOpen(false);
    setError(null);
    write("startLeagueQuarter", [auth, game.id, 1], liveEvents.periodStart(1));
    void hapticTap("medium");
  }
  // ⋯ → Edit lineup before the whistle: back to the picker with the
  // lineup as set (reopenLeagueLineup).
  function handleEditLineup() {
    setError(null);
    setPending(true);
    void reopenLeagueLineup(auth, game.id)
      .catch(() => ({ success: false as const, error: "Couldn't open the lineup — try again." }))
      .then((result) => {
        setPending(false);
        if (!result.success) {
          setError(result.error ?? "Couldn't open the lineup — try again.");
          return;
        }
        router.refresh();
      });
  }

  const onFieldNow = onFieldIds.length;

  return (
    <div ref={liveRootRef} className="ui-nonselect space-y-3">
      {isFinished ? (
        <>
          {/* Full time and the finished game keep their page: the top
              bar, the score, the review or the summary (as soccer's). */}
          <LiveTopBar exitHref={exitHref} game={game} isLive onHelp={handleOpenWalkthrough} />
          {error && <InlineAlert kind="danger">{error}</InlineAlert>}
          <div className="rounded-md bg-surface">
            <LeagueScoreBug {...scoreBugProps} />
          </div>
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
              // The review's own score chips: a buzzer-beater try lands
              // here (Steve 2026-05-18).
              onTeamTry={() => setScorerPickerOpen(true)}
              onTeamConversion={kickingAllowed ? handleOpenConversionDialog : undefined}
              onOpponentTry={handleRecordOpponentTry}
              onOpponentConversion={kickingAllowed ? handleRecordOpponentConversion : undefined}
              onTeamPenaltyGoal={goalsFromPlay ? () => setGoalPicker("penalty_goal") : undefined}
              onTeamFieldGoal={goalsFromPlay ? () => setGoalPicker("field_goal") : undefined}
              onOpponentPenaltyGoal={goalsFromPlay ? () => recordLeagueGoalKind("opponent_penalty_goal", null) : undefined}
              onOpponentFieldGoal={goalsFromPlay ? () => recordLeagueGoalKind("opponent_field_goal", null) : undefined}
              onUndo={state.teamScore.points > 0 || state.opponentScore.points > 0 ? handleUndoScore : undefined}
              scorePending={pending}
            />
          )}
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
        </>
      ) : (
        <LiveShell
          top={
            <LiveTopBar
              exitHref={exitHref}
              game={game}
              isLive={!preKickoff}
              onMenu={() => {
                // One sheet at a time: the kid is put down.
                handleClearSelection();
                setMenuOpen(true);
              }}
              subline={topSubline}
            />
          }
          banners={bannersEl}
          header={shellHeader}
          undo={chrome.undoStrip({
            show: isPeriodActive,
            onUndo: handleUndoNamedScore,
            disabled: pending,
            plain: true,
          })}
          info={infoEl}
          field={fieldEl}
          bench={benchEl}
          bar={shellBar}
          toast={isPeriodActive ? chrome.toast : null}
        />
      )}

      {/* ⋯: late arrival, settings, scores, the plan, the tour, feedback,
          the game-day link, Restart and (before the whistle) Edit lineup. */}
      <LiveGameMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        auth={auth}
        gameId={game.id}
        game={game}
        isAdmin={isAdmin}
        subline={[roundWord, whoRuns].filter(Boolean).join(" · ")}
        finished={state.finalised}
        lateCandidates={lateArrivalCandidates}
        onLateArrival={handleAddLateArrival}
        latePending={pending}
        settings={
          isAdmin && !isFinished
            ? { summary: settingsSummary(subIntervalSeconds ?? 300, game.on_field_size), subIntervalSeconds: subIntervalSeconds ?? 300 }
            : undefined
        }
        // (Before settingsDialog: the contract test reads this tag up to its first self-closing child.)
        onScores={!preKickoff ? chrome.openScores : undefined}
        settingsDialog={(onClose) => (
          <LeagueGameSettingsModal
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
            onClose={onClose}
          />
        )}
        trackScoring={trackScoring}
        planNext={showPlanNext ? { label: planLabel, onOpen: () => setPlanNextOpen(true) } : undefined}
        endPeriod={canEndPeriod ? { label: endWords.label, description: endWords.description, onSelect: openEndPeriod } : undefined}
        onWalkthrough={handleOpenWalkthrough}
        onEditLineup={preKickoff ? handleEditLineup : undefined}
      />

      {walkthroughOpen && <WalkthroughModal steps={walkthroughSteps} onClose={handleWalkthroughClose} />}

      {/* Start H1's confirm: "Start H1 now" when the whistle goes. Back
          leaves the lineup on screen; ⋯ → Edit lineup reopens the picker. */}
      {startOpen && preKickoff && (
        <StartQuarterModal
          quarter={1}
          periodLabel={periodLabel}
          cue={getSportConfig(sport).words.startCue}
          shortSide={{ playing: onFieldNow, size: game.on_field_size, min: ageGroup.minOnFieldSize }}
          loading={pending}
          onStart={handleStartFirstPeriod}
          onCancel={() => setStartOpen(false)}
        />
      )}

      {/* Who kicks off (§16): the prompt's sheet. */}
      {kickoffOpen && kickoffDue && (
        <Modal size="md" label="Kickoff" onClose={() => setKickoffOpen(false)} padding="px-[14px] pb-[12px] pt-[20px]">
          <KickoffPicker
            look="sheet"
            auth={auth}
            gameId={game.id}
            squad={kickoffSquad}
            events={thisGameEvents}
            seasonEvents={seasonEvents}
            period={state.currentQuarter}
            onSkip={skipKickoff}
            onPicked={() => setKickoffOpen(false)}
          />
        </Modal>
      )}

      {/* The planned sub, pair by pair (the info line, or the due bar's
          Pairs). Front-rowers and §6 kids are never in it: the suggester
          keeps them on. */}
      {pairsOpen && sheetPairs.length > 0 && isPeriodActive && (
        <PairsSheet
          pairs={sheetPairs}
          due={subDue}
          msUntilDue={subPastHooter ? null : msUntilDue}
          periodWord={periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)}
          onMakeOne={makeOnePair}
          onMakeAll={makeAllPairs}
          pending={pending}
          onClose={() => setPairsOpen(false)}
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
          elapsedMs={Math.min(elapsedMs, periodSeconds * 1000)}
          periodMs={periodSeconds * 1000}
          onConfirm={(full) => {
            setEndQConfirmOpen(false);
            // The time played, or (the game played on while the app's
            // clock sat paused) the whole half / quarter: the coach's
            // choice, as AFL's. Crediting the whole period was the
            // silent default, so a half ended seconds in gave every kid
            // on the field the full half (round 3, 24 Oct 2026).
            endQuarterAtClient(full ? periodSeconds * 1000 : Math.min(clockAt(Date.now()), periodSeconds * 1000));
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
                  {missingVestNote ? `${missingVestNote}. ` : "The vest wearer is no longer on the field. "}
                  Who takes the {missingVestWearer === "dh" ? "DH" : "FR"} vest?
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
              // Kids on the field who can play: a hurt wearer keeps their
              // slot but can't hand the vest to themselves.
              onFieldPlayerIds={kickoffSquad.map((p) => p.id)}
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
          wentHome={wentHomeSet.has(actionSheetPlayer.id)}
          onWentHome={() => handleToggleInjury(actionSheetPlayer.id, true, true)}
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
            reason={injuryReplacementModal.lent ? "lent" : injuryReplacementModal.wentHome ? "went_home" : "injured"}
            spotLabel={LEAGUE_SPOT_LABEL[injuryReplacementModal.zone]}
            candidates={candidates}
            onPickReplacement={(rid) =>
              injuryReplacementModal.lent
                ? handleLendReplacement(injuryReplacementModal.injuredId, rid)
                : handleInjuryReplacement(injuryReplacementModal.injuredId, rid, injuryReplacementModal.wentHome)
            }
            onSkipReplacement={() => {
              if (!injuryReplacementModal.lent) {
                handleInjuryMarkOnly(injuryReplacementModal.injuredId, injuryReplacementModal.wentHome);
                return;
              }
              setInjuryReplacementModal(null);
              markLoan(injuryReplacementModal.injuredId, true);
            }}
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
