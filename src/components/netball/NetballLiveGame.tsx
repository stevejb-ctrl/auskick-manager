"use client";

// ─── Netball Live Game ───────────────────────────────────────
// Compact, opinionated live shell for netball. Substitutions only
// happen at period breaks, so the UI has two modes:
//
//   LIVE       → shows current lineup on the court, score buttons,
//                and a "End quarter" button. No mid-play swap UI.
//   Q-BREAK    → shows the lineup picker for the upcoming quarter,
//                with a "Start quarter" confirm button.
//
// Score: +1 goal (our team) / +1 opponent goal. That's it.

import { SFButton, SFIcon } from "@/components/sf";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import type { Game, GameEvent, LiveAuth, Player } from "@/lib/types";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { RollingNumber, SCORE_GHOST, useScoreGhost } from "@/components/live/RollingNumber";
import { CourtDisplay } from "@/components/netball/CourtDisplay";
import { PositionToken } from "@/components/netball/PositionToken";
import { NetballBenchStrip } from "@/components/netball/NetballBenchStrip";
import { NetballLineupPicker } from "@/components/netball/LineupPicker";
import { LockModal } from "@/components/live/LockModal";
import { NetballQuarterBreak } from "@/components/netball/NetballQuarterBreak";
import { NetballGameSummaryCard } from "@/components/netball/NetballGameSummaryCard";
import {
  InjuryReplacementModal,
  type InjuryReplacementCandidate,
} from "@/components/live/InjuryReplacementModal";
import { LongPressHint } from "@/components/live/LongPressHint";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import { useHypeSong } from "@/lib/live/useHypeSong";
import { LiveAdminUtilityRow } from "@/components/live/LiveAdminUtilityRow";
import { ScoreRecordingDock } from "@/components/live/ScoreRecordingDock";
import { LiveStickyScoreBar } from "@/components/live/LiveStickyScoreBar";
import { hapticTap, hapticSiren } from "@/lib/haptics";
import { QuarterScoreModal } from "@/components/live/QuarterScoreModal";
import { buildNetballWalkthroughSteps } from "@/components/netball/netballWalkthroughSteps";
import { WalkthroughOffer } from "@/components/live/WalkthroughOffer";
import { ClockMenu } from "@/components/live/ClockMenu";

// Perf phase 8: same dynamic-import pattern as LiveGame.tsx for
// the rare-state netball modals. Saves cold-start bundle weight
// on the live page.
const NetballFullTimeReview = dynamic(
  () =>
    import("@/components/netball/NetballFullTimeReview").then(
      (m) => m.NetballFullTimeReview,
    ),
  { ssr: false },
);
const WalkthroughModal = dynamic(
  () => import("@/components/live/WalkthroughModal").then((m) => m.WalkthroughModal),
  { ssr: false },
);
const ManualEndQuarterConfirm = dynamic(
  () =>
    import("@/components/live/ManualEndQuarterConfirm").then(
      (m) => m.ManualEndQuarterConfirm,
    ),
  { ssr: false },
);
// F2 plan-ahead planner (ROTPLAN-02): the SAME shared GamePlanModal AFL
// uses, opened on the NEXT period's tab during the final rotation
// window so the coach can build the upcoming lineup before the break.
const GamePlanModal = dynamic(
  () => import("@/components/game-plan/GamePlanModal").then((m) => m.GamePlanModal),
  { ssr: false },
);
import { PulseDot } from "@/components/ui/PulseDot";
import { netballSport, primaryThirdFor } from "@/lib/sports/netball";
import type { AgeGroupConfig } from "@/lib/sports/types";
import {
  type GenericLineup,
  type InProgressContribution,
  type InProgressSegment,
  type PlayerThirdMs,
  type ThirdLookup,
  emptyGenericLineup,
  gamePositionCounts,
  playedZoneMsByPeriod,
  playerThirdMs,
  replayNetballGame,
  seasonPositionCounts,
  lineupAfterSubs,
  splitQuarterSegments,
  formatMinSec,
} from "@/lib/sports/netball/fairness";
import { computePeriodClockMs } from "@/lib/live/periodClock";
import { gameLoanMinutes, seasonLoanMinutes } from "@/lib/fairness";
import {
  saveNetballLineupDraft,
  startNetballGame,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/netball-actions";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import { netballPositionLocks, replayLocks, type PlayerLock } from "@/lib/live/locks";
import { Button } from "@/components/ui/Button";
import { LiveTopBar } from "@/components/live/LiveTopBar";
import { ZoneTimeLegend } from "@/components/live/ZoneTimeLegend";
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
import { UndoStrip } from "@/components/live/UndoStrip";
import { pairScoreUndos } from "@/lib/live/scoreUndo";
import { presentPlayerIds } from "@/lib/live/presentPlayers";
import { periodLabels } from "@/lib/sports";
import { SCORE_CHIP, SCORE_TEAM_NAME } from "@/components/live/scoreChip";

interface NetballLiveGameProps {
  game: Game;
  auth: LiveAuth;
  /** Team's own name — drives the home-side label in the score bug. */
  teamName: string;
  squad: Player[];
  availableIds: string[];
  ageGroup: AgeGroupConfig;
  /**
   * Effective quarter duration in seconds for THIS team. Comes from
   * the parent (live page) which resolves
   * `team.quarter_length_seconds ?? ageGroup.periodSeconds`. Used in
   * place of `ageGroup.periodSeconds` for the countdown clock,
   * auto-end-at-hooter, and time-credit accounting so a per-team
   * override flows through every clock surface.
   */
  quarterLengthSeconds: number;
  initialLineup: GenericLineup | null;
  currentQuarter: number;
  quarterElapsedMs: number;
  /**
   * ISO timestamp of the most recent `quarter_start` event, or null
   * when no quarter is in progress (pre-game, between quarters, or
   * finalised). Used to anchor the live clock to wall-clock time so
   * Chrome's background-tab interval throttling can't slow the clock
   * down — see the useClockTick / clockMs derivation below for the
   * full story.
   */
  quarterStartedAt: string | null;
  teamScore: { goals: number };
  opponentScore: { goals: number };
  /** Per-player goals scored this game (from replayNetballGame.playerGoals). */
  playerGoals: Record<string, number>;
  quarterEnded: boolean;
  finalised: boolean;
  thisGameEvents: GameEvent[];
  seasonEvents: GameEvent[];
  /**
   * Whether this team records goals/scores. NETBALL-04: when false,
   *   • +G opponent-goal button hidden in the score bug
   *   • GS/GA tap is a no-op for scoring (long-press still opens
   *     the actions modal, mirroring track_scoring-agnostic flows)
   *   • Undo chip never appears (scoring path is fully suppressed)
   *   • Score-bug numeric goal counts hidden (em-dash placeholder)
   *   • Walkthrough "Recording scores" step dropped (NETBALL-07)
   *   • Bottom hint copy drops the "Tap GS or GA to score" sentence
   *   • Summary card omits the result + goals lines (NETBALL-06)
   * Defaults to false to match the codebase convention
   * (`teamRow?.track_scoring ?? false` at every call site).
   */
  trackScoring?: boolean;
  /**
   * Speed-up factor for the perceived clock — used by the demo flow
   * (8× = a 10-min quarter ticks down in 1m15s of wall-clock). The
   * raw wall-clock elapsed is multiplied by this; the hooter, the
   * countdown display, and per-third minute accounting all consume
   * the multiplied value so they stay in sync. Defaults to 1
   * (real-time) to mirror AFL's `clockMultiplier` semantics in
   * `LiveGame.tsx` and the migration default in 0021_demo.sql.
   */
  clockMultiplier?: number;
  /**
   * When the server rendered the page (ms). The first client render
   * uses it as "now" so tile times and the clock match the server's
   * HTML; after mount the clock runs off Date.now(). Without it a
   * second's gap before hydration ("1:00" vs "1:02") made React throw
   * the HTML away and swallow the coach's first tap.
   */
  renderedAtMs?: number;
  /**
   * True when the current user has admin role on this team. Drives
   * the "Restart game" affordance — folded into the same row as
   * "+ Add late arrival" at the bottom of the live court so the
   * two destructive/utility actions share one strip of scrolling
   * real estate (Steve 2026-05-13). Mirrors LiveGame.tsx.
   */
  isAdmin?: boolean;
  /** Game-day "Who's here" panel for the pre-kickoff picker (team auth). */
  availabilityPanel?: React.ReactNode;
  /**
   * Pre-game lineup draft fetched server-side from
   * game_lineup_drafts. Drives two things on the pre-kickoff
   * NetballLineupPicker:
   *   - `initialLineup` so the picker pre-populates instead of
   *     re-running the suggester
   *   - `initialSavedAt` so the "Plan saved" badge surfaces +
   *     the "Save plan & exit" button label flips to "Update plan
   *     & exit"
   * Null when the coach hasn't stashed anything yet.
   */
  initialDraft?: {
    lineup: import("@/lib/sports/netball/fairness").GenericLineup;
    updated_at: string;
  } | null;
  /**
   * Steve 2026-05-16: team-level toggle (defaults false). When true,
   * the long-press player actions (the shared LockModal) offer
   * "Switch player" for mid-quarter substitutions. When
   * false (default), the affordance is hidden and the existing
   * midQuarterSubs state machine just never fires — netball is
   * overwhelmingly a "subs at the break" sport and the simpler
   * actions menu wins for the majority of teams. Toggled via the
   * team Settings page; threaded down here from the page-level
   * `teams.allow_mid_quarter_subs` column.
   *
   * Steve 2026-05-17 (migration 0036): the EFFECTIVE value is now
   * `game override ?? team default ?? false`. This prop carries the
   * resolved effective value used for live-play gating. The two
   * `team*` / `game*` props below carry the RAW inputs so the
   * pre-game LineupPicker can show a "Use team default" link when
   * a per-game override is active.
   */
  allowMidQuarterSubs?: boolean;
  teamAllowMidQuarterSubs?: boolean;
  gameAllowMidQuarterSubs?: boolean | null;
  /**
   * Steve 2026-05-16 (AFL parity): cohort-chip mode map. AFL has
   * been honouring this in its suggester since chips shipped;
   * netball was silently ignoring it. Threaded down to both the
   * pre-game LineupPicker and the in-game NetballQuarterBreak so
   * a netball coach who configures chips on their team settings
   * actually sees them influence the rotation.
   */
  chipModeByKey?: Partial<Record<"a" | "b" | "c", import("@/lib/chips").ChipMode>>;
  /** How we play for the netball suggester (UX plan Phase 5). */
  netballPlaybook?: import("@/lib/sports/netball/engine").NetballPlaybookInput;
  /** Player roles on the pre-game lineup (long-press). Coaches only. */
  roleSheet?: import("@/components/playbook/useRoleSheet").RoleSheetConfig;
  /**
   * Steve 2026-05-16 (AFL parity): team hype song. Plays a snippet
   * on each own-team goal commit. AFL has had this since song
   * settings shipped; netball was silently ignoring the columns
   * even though the team Settings page exposes them. Wired via the
   * shared `useHypeSong` hook (YouTube iframe or audio fallback).
   * `songUrl` null = no song configured = playSong is a no-op.
   */
  songUrl?: string | null;
  songStartSeconds?: number;
  songDurationSeconds?: number;
  /**
   * Optional pre-game "Game plan" opener. Forwarded to the pre-kickoff
   * NetballLineupPicker's shared breadcrumb so the planner sits in the
   * same spot it does for AFL / RL. Built by the server page (which
   * has team name / opponent / season events). Only shown pre-kickoff.
   */
  gamePlan?: import("@/components/game-plan/GamePlanButton").GamePlanButtonProps;
}

export function NetballLiveGame(props: NetballLiveGameProps) {
  const {
    game,
    auth,
    teamName,
    squad,
    availableIds,
    ageGroup,
    quarterLengthSeconds,
    initialLineup,
    currentQuarter,
    quarterElapsedMs: _quarterElapsedMs,
    quarterStartedAt,
    teamScore,
    opponentScore,
    playerGoals,
    quarterEnded,
    finalised,
    thisGameEvents,
    seasonEvents,
    trackScoring = false,
    clockMultiplier = 1,
    renderedAtMs,
    isAdmin = false,
    initialDraft = null,
    allowMidQuarterSubs = false,
    teamAllowMidQuarterSubs = false,
    gameAllowMidQuarterSubs = null,
    chipModeByKey = {},
    netballPlaybook,
    roleSheet,
    songUrl = null,
    songStartSeconds = 0,
    songDurationSeconds = 15,
    gamePlan,
    availabilityPanel,
  } = props;

  const [isPending, startTransition] = useTransition();
  // Phase 5: router.refresh() after server-action success so the live
  // page re-fetches game_events and rerenders into the new branch
  // (Q-break / Q4-finalise / next-quarter live state) without a manual
  // reload. Pairs with revalidatePath calls in netball-actions.ts.
  // (Phase 4 deferred items #1 + #2 / 04-EVIDENCE.md §5.)
  const router = useRouter();

  // Steve 2026-05-16 (AFL parity): hype song. Same hook AFL uses,
  // same call shape. `hydrated=true` here unconditionally because
  // NetballLiveGame doesn't use a zustand store the way AFL does —
  // its state derives from events on every render, so it's "ready"
  // as soon as the component mounts.
  const { playSong } = useHypeSong({
    songUrl,
    songStartSeconds,
    songDurationSeconds,
    hydrated: true,
    gameId: game.id,
  });

  // ─── Live clock — wall-clock anchored ────────────────────────
  // We DERIVE clockMs on every render from `Date.now() -
  // quarterStartedAtMs`. The 500ms ticker below merely forces a re-
  // render — it does NOT increment a counter. Why this matters:
  // Chrome aggressively throttles `setInterval` in background tabs
  // (down to once per minute in deep background), which silently
  // slowed the old "+= 500ms each tick" implementation to a crawl
  // whenever the coach moved off the live page. Anchoring to wall-
  // clock means the next render after the tab returns instantly
  // catches up — the elapsed time is whatever the wall clock says it
  // is, regardless of how long we were throttled.
  //
  // Quarter-end / finalised / pre-game: fall back to the snapshot
  // `_quarterElapsedMs` from the parent (which represents the frozen
  // recorded value) so a closed quarter can't keep ticking.
  const [, setClockTick] = useState(0);
  // Server's "now" until mounted, so hydration sees the same text.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Pause state. `pausedAtMs` is the wall-clock timestamp of the
  // current pause (null when running). `accumulatedPauseMs` is the
  // total paused time across all pauses this quarter — subtracted
  // from `Date.now() - quarterStartedAt` so the clock skips paused
  // intervals. Both are in-memory only (lost on reload), mirroring
  // AFL's pause model — the comment on liveGameStore.ts explicitly
  // notes pauses don't survive reload there either.
  const [pausedAtMs, setPausedAtMs] = useState<number | null>(null);
  const [accumulatedPauseMs, setAccumulatedPauseMs] = useState(0);
  // Reset pause state on quarter transition so a fresh quarter
  // starts unpaused with zero accumulated. Otherwise the
  // accumulatedPauseMs from Q1 would silently steal time from Q2.
  useEffect(() => {
    setPausedAtMs(null);
    setAccumulatedPauseMs(0);
  }, [currentQuarter]);
  // Scroll to the top of the page (= top of the scorebug) when a
  // new quarter goes live. Without this the page inherits the
  // Q-break scroll position and the coach lands mid-page as the
  // action restarts. Mirrors AFL's LiveGame fix.
  useEffect(() => {
    if (currentQuarter < 1 || quarterEnded || finalised) return;
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentQuarter, quarterEnded, finalised]);
  useEffect(() => {
    if (currentQuarter < 1 || quarterEnded || finalised || !quarterStartedAt) {
      return;
    }
    // Skip the tick when paused — no need to re-render every 500ms
    // if the displayed clock isn't advancing.
    if (pausedAtMs !== null) return;
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => setClockTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, [currentQuarter, quarterEnded, finalised, quarterStartedAt, pausedAtMs]);
  // Quarter-clock calculation extracted to a pure helper so the
  // freeze invariant is unit-testable (src/lib/live/periodClock.ts).
  // Steve 2026-05-15: the freeze branch is load-bearing for the
  // auto-hooter bug fix — between hooter and the server-confirmed
  // quarter_end refresh, the helper MUST return the value captured
  // at pausedAtMs (set by the hooter useEffect below), otherwise
  // player tile time keeps ticking up during that window.
  //
  // clockMultiplier scales perceived elapsed time. Default 1 (real-
  // time); 8 for the demo flow so a 10-min quarter ticks down in
  // 1m15s of wall-clock. Per-third minute accounting + the hooter
  // trigger downstream consume the multiplied value, so all three
  // surfaces (countdown, dashboard time bars, auto-end) stay in
  // sync. Mirrors AFL's clockMultiplier semantics in LiveGame.tsx.
  // Date.parse returns NaN on malformed input; treat that the same
  // as a null start (falls through to fallbackElapsedMs).
  const quarterStartedAtMs = (() => {
    if (!quarterStartedAt) return null;
    const ms = Date.parse(quarterStartedAt);
    return Number.isNaN(ms) ? null : ms;
  })();
  const clockMs = computePeriodClockMs({
    currentQuarter,
    quarterEnded,
    finalised,
    quarterStartedAtMs,
    pausedAtMs,
    accumulatedPauseMs,
    fallbackElapsedMs: _quarterElapsedMs,
    clockMultiplier,
    nowMs: mounted || renderedAtMs === undefined ? Date.now() : renderedAtMs,
  });
  const isPaused = pausedAtMs !== null;
  const toggleClock = useCallback(() => {
    if (currentQuarter < 1 || quarterEnded || finalised) return;
    // Once the auto-hooter has fired for this quarter the clock is
    // locked — tapping the pill to "resume" would re-start time
    // accrual after the quarter is already over (just waiting on
    // server confirmation). The hooter's setPausedAtMs is the
    // freeze anchor; users shouldn't be able to break it.
    if (hooterFiredForQuarterRef.current === currentQuarter) return;
    if (pausedAtMs !== null) {
      // Resume: bank the elapsed pause-time and clear the pause anchor.
      setAccumulatedPauseMs((prev) => prev + (Date.now() - pausedAtMs));
      setPausedAtMs(null);
    } else {
      setPausedAtMs(Date.now());
    }
  }, [currentQuarter, quarterEnded, finalised, pausedAtMs]);

  // Quarter length in ms — varies by age group (Set 6min, Go/11u 8min,
  // 12u 10min, 13u 12min, Open 15min). Drives the countdown header and
  // the auto-end-at-hooter trigger below.
  const quarterLengthMs = quarterLengthSeconds * 1000;
  const remainingMs = Math.max(0, quarterLengthMs - clockMs);

  // ─── F2 plan-ahead (ROTPLAN-02) ──────────────────────────────
  // The coach can build the NEXT period's lineup during the final
  // rotation window of the current one, pinning it into the SAME shared
  // `plannedRotation` slice AFL uses; the upcoming break opens
  // pre-seeded from it (NetballQuarterBreak reads the pin directly).
  const plannedRotation = useLiveGame((s) => s.plannedRotation);
  const setPlannedRotation = useLiveGame((s) => s.setPlannedRotation);
  const [planNextOpen, setPlanNextOpen] = useState(false);
  // Final-rotation window, in GAME time. Netball's clockMs already has
  // the demo multiplier applied, so we compare against a game-time sub
  // interval (NOT divided by the multiplier like AFL's wall-clock
  // frame). Once less than one sub interval remains the coach can plan
  // ahead; hidden on the last period (no next period to plan).
  const planSubIntervalMs = (ageGroup.subIntervalSeconds ?? 240) * 1000;
  const inFinalWindow =
    quarterLengthMs > 0 && clockMs >= quarterLengthMs - planSubIntervalMs;
  const isLastPeriod = currentQuarter >= ageGroup.periodCount;
  const pinForThisGame =
    plannedRotation && plannedRotation.gameId === game.id
      ? plannedRotation
      : null;
  const hasPinnedNextPeriod = hasPinnedPeriod(pinForThisGame, currentQuarter);

  // ─── Pulse triggers ─────────────────────────────────────────
  // The Siren brand pulse fires at moments that ARE a siren going
  // off — quarter-end hooter + game finalised. Bumped from the
  // useEffects below; consumed by NetballScoreBug's clock pill via
  // its `clockPulseKey` prop. State (not ref) so React re-renders
  // and the wrapped pill picks up the new key.
  //
  // Initial null (not 0) so a fresh page load doesn't auto-pulse —
  // the SirenPulseHalo atom skips rendering its halo span when
  // triggerKey is null.
  const [clockPulseKey, setClockPulseKey] = useState<number | null>(null);

  // Bumped on the pre-game → Q1 transition. Drives Court's
  // `wakeUpKey` prop — one-shot brand halo around the court
  // perimeter at the moment the umpire's whistle goes. Null on
  // every fresh page load so a coach landing mid-game doesn't
  // see a phantom celebration; only a real isPreGame → !isPreGame
  // flip fires the pulse. Mirrors AFL LiveGame's
  // `fieldWakeUpKey` (P1.5-5 / commit 753c2a4).
  const [courtWakeUpKey, setCourtWakeUpKey] = useState<number | null>(null);
  const prevIsPreGameRef = useRef<boolean | null>(null);
  // Detect the pre-game → Q1 transition. First effect run captures
  // the initial isPreGame value (null → current) WITHOUT firing —
  // a freshly-mounted live view with currentQuarter > 0 (e.g. page
  // reload mid-game) shouldn't pulse just because it appeared. Only
  // a real flip from currentQuarter === 0 to currentQuarter > 0
  // fires the halo. Mirrors AFL LiveGame (commit 753c2a4).
  useEffect(() => {
    const isPreGame = currentQuarter === 0;
    if (prevIsPreGameRef.current === true && !isPreGame) {
      setCourtWakeUpKey((k) => (k === null ? 1 : k + 1));
    }
    prevIsPreGameRef.current = isPreGame;
  }, [currentQuarter]);

  // Manual "End Q early" confirmation gate. Opens when the coach
  // taps the End-Q-early chip on the score-bug (only visible when
  // paused). Confirming fires endNetballQuarter with the full
  // quarter length so on-court players are credited the time they
  // actually played, not the wall-clock that was paused.
  const [showManualEndConfirm, setShowManualEndConfirm] = useState(false);
  // The clock pill opens the clock menu (pause / resume / end now).
  const [clockMenuOpen, setClockMenuOpen] = useState(false);
  // Steve 2026-05-17 bug: was `useRef(false)` and flipped to `true`
  // on first fire and never reset. Q1's manual end-early worked
  // once, but Q2's tap silently no-op'd because the guard was
  // still true. Mirror the `hooterFiredForQuarterRef` pattern
  // below — store the QUARTER NUMBER that already fired so a new
  // quarter automatically becomes fireable again.
  const manualEndFiredForQuarterRef = useRef<number | null>(null);
  function handleManualEndQuarter() {
    if (manualEndFiredForQuarterRef.current === currentQuarter) return;
    manualEndFiredForQuarterRef.current = currentQuarter;
    // Block the auto-hooter from also firing when we land on the
    // Q-break next render; the ref above is enough for our handler
    // but the hooter ref in the existing useEffect (line ~266) is
    // gated on `remainingMs > 0` and a per-quarter sentinel, so
    // it's already safe.
    setClockPulseKey(currentQuarter);
    // Same sirenic haptic as the auto-hooter below — manual-end is
    // still "the quarter is ending" from the player's POV. P1-10.
    void hapticSiren();
    const { flushed } = enqueueLiveAction("endNetballQuarter", [
      auth,
      game.id,
      currentQuarter,
      quarterLengthMs,
    ]);
    flushed.then(() => startTransition(() => router.refresh()));
  }

  // Pending goal: tap on a GS/GA token doesn't fire the goal directly;
  // it sets this and surfaces a confirm sheet (mirrors AFL's score
  // sheet). Prevents accidental scoring from a stray tap during play.
  // Declared before the hooter useEffect so the picker-race guard
  // below can reference it.
  const [pendingGoal, setPendingGoal] = useState<{
    playerId: string;
    positionId: string;
  } | null>(null);

  // Steve 2026-05-17 cross-sport handler audit: AFL has felt-instant
  // scoring because its zustand store increments the score
  // optimistically; netball was waiting for `router.refresh()` to
  // come back from the server before the scorebug ticked over
  // (~200-800ms lag — Stagehand kid-runner flagged this earlier in
  // the session and the audit confirmed it).
  //
  // Fix: track a LOCAL DELTA on top of the server-derived props.
  // Effective score = props + delta. Increment delta on commit,
  // reset to zero every time the underlying score props refresh
  // (server caught up). Negative deltas are intentional for undo —
  // we want the scorebug to drop instantly when the coach taps
  // Undo before the refresh round-trips. The reset useEffect
  // realigns once the new server truth arrives.
  const [localScoreDelta, setLocalScoreDelta] = useState<{
    team: number;
    opp: number;
    player: Record<string, number>;
  }>({ team: 0, opp: 0, player: {} });

  // Reset deltas whenever the server-derived score props change —
  // means a server round-trip landed and the truth is now baked into
  // props. Cleared in a single set so React batches the update.
  useEffect(() => {
    setLocalScoreDelta({ team: 0, opp: 0, player: {} });
    // Deps deliberately on the primitive goal counts + the
    // playerGoals object identity. teamScore/opponentScore are
    // fresh objects each props refresh, so depending on
    // `.goals` keeps the effect from firing on no-op re-renders
    // where only an unrelated prop changed.
  }, [teamScore.goals, opponentScore.goals, playerGoals]);

  const effectiveTeamScore = useMemo(
    () => ({ goals: teamScore.goals + localScoreDelta.team }),
    [teamScore.goals, localScoreDelta.team],
  );
  const effectiveOpponentScore = useMemo(
    () => ({ goals: opponentScore.goals + localScoreDelta.opp }),
    [opponentScore.goals, localScoreDelta.opp],
  );
  const effectivePlayerGoals = useMemo(() => {
    if (Object.keys(localScoreDelta.player).length === 0) return playerGoals;
    const merged: Record<string, number> = { ...playerGoals };
    for (const [pid, d] of Object.entries(localScoreDelta.player)) {
      merged[pid] = (merged[pid] ?? 0) + d;
    }
    return merged;
  }, [playerGoals, localScoreDelta.player]);

  // Steve 2026-05-16: scorebug-driven goal scorer picker. AFL has had
  // +G chips on both sides of the scorebug for a while (tap → picker
  // → record), but netball only ever surfaced the OPPONENT +G — to
  // record an own-team goal a coach had to find the GS/GA token on
  // the court and tap it. That's discoverable when the user knows
  // the rules; Stagehand kid-runner showed it isn't otherwise. This
  // state opens a SlotFillSheet of currently-on-court GS + GA
  // players when the new own-team +G chip is tapped; pick →
  // recordNetballGoal directly (no confirm sheet — picker IS the
  // confirmation, mirrors AFL's pattern).
  const [pickScorerOpen, setPickScorerOpen] = useState(false);

  // Hooter: when the countdown reaches zero, auto-fire endNetballQuarter
  // exactly once. Mirrors AFL's hooter-trigger pattern at LiveGame.tsx:730
  // (which uses a ref to ensure single-fire). The coach doesn't need to
  // tap an "End Q{n}" button — the clock running out IS the end of the
  // quarter. The next render lands in the quarter-break branch which
  // shows the next-quarter lineup picker.
  const hooterFiredForQuarterRef = useRef<number | null>(null);
  useEffect(() => {
    if (currentQuarter < 1 || quarterEnded || finalised) return;
    if (remainingMs > 0) return;
    if (hooterFiredForQuarterRef.current === currentQuarter) return;
    // Picker-race guard: if the goal-confirm modal is open (coach
    // tapped a player and is mid-confirm), DON'T fire the auto-
    // hooter. Stagehand explore 2026-05-10 caught this in netball
    // — the agent attempted to score at ~9:55 of a 10-min quarter,
    // the picker opened, the 10:00 hooter fired before they could
    // confirm, the goal was lost. With this gate the quarter
    // doesn't end until the modal is resolved (confirmed or
    // cancelled).
    if (pendingGoal !== null) return;
    hooterFiredForQuarterRef.current = currentQuarter;
    // Freeze the local clock at the hooter so per-player tile time
    // doesn't keep ticking up while we wait for the server-confirmed
    // quarter_end refresh to land. Without this setPausedAtMs call,
    // computePeriodClockMs(...) returns the live `Date.now()` delta
    // and player times accrue during the ~100-500ms (often longer
    // on slow networks) between hooter and refresh — the bug Steve
    // reported 2026-05-15. Idempotent guard: if the coach manually
    // paused earlier and the hooter then auto-fires, don't overwrite
    // the earlier pause anchor.
    setPausedAtMs((prev) => prev ?? Date.now());
    // Bump the pulse key so the next render (Q-break score-bug for
    // Q1-3, Q4-end for Q4) shows the brand halo on the clock pill.
    // Re-keys per quarter so the pulse fires once per hooter.
    setClockPulseKey(currentQuarter);
    // Siren-pattern haptic — quarter end IS the hooter, the same
    // sirenic moment AFL pre-existed and full-time mirrors. P1-10.
    void hapticSiren();
    const { flushed: hooterFlushed } = enqueueLiveAction("endNetballQuarter", [
      auth,
      game.id,
      currentQuarter,
      quarterLengthMs,
    ]);
    // Chain refresh after the queue flushes so SSR sees the
    // quarter_end event and renders the Q-break shell.
    hooterFlushed.then(() => startTransition(() => router.refresh()));
  }, [
    remainingMs,
    currentQuarter,
    quarterEnded,
    finalised,
    auth,
    game.id,
    quarterLengthMs,
    router,
    pendingGoal,
  ]);

  // ─── Injured / loaned — derived from events ─────────────────
  // Every markInjury / markLoan call writes an `injury` /
  // `player_loan` event with metadata `{ injured: bool }` /
  // `{ loaned: bool }` so the audit trail captures the toggle in
  // both directions. Deriving the current sets from those events
  // (latest per player wins) means the status survives:
  //   • a quarter transition (period_break_swap doesn't reset events)
  //   • a page refresh mid-quarter (events are persisted to Supabase)
  //   • a navigation away and back to the live page
  // Replaces an earlier React-only useState model that lost the
  // status the moment the events prop refreshed without the local
  // state being re-seeded.
  // Steve 2026-05-17 cross-sport audit follow-up: AFL feels instant
  // when the coach taps Mark Injured / Lend on a player (the AFL
  // zustand store flips the flag immediately). Netball waited for
  // the server round-trip + page refresh — ~500ms before the INJ /
  // LENT badge appeared. Local per-player overrides give us the
  // same instant feedback, and the useEffect below drops the
  // override the moment the server-derived set agrees (no stale
  // override sticks around if a server write fails or arrives
  // out-of-order).
  const [localInjuredOverride, setLocalInjuredOverride] = useState<
    Record<string, boolean>
  >({});
  const [localLoanedOverride, setLocalLoanedOverride] = useState<
    Record<string, boolean>
  >({});

  const injuredIds = useMemo(() => {
    const latest = new Map<string, { ts: string; injured: boolean }>();
    for (const ev of thisGameEvents) {
      if (ev.type !== "injury" || !ev.player_id) continue;
      const injured = ((ev.metadata as { injured?: boolean }).injured) ?? true;
      const cur = latest.get(ev.player_id);
      if (!cur || ev.created_at > cur.ts) {
        latest.set(ev.player_id, { ts: ev.created_at, injured });
      }
    }
    const set = new Set<string>();
    latest.forEach((v, k) => {
      if (v.injured) set.add(k);
    });
    // Apply local optimistic overrides on top of server truth.
    for (const [pid, val] of Object.entries(localInjuredOverride)) {
      if (val) set.add(pid);
      else set.delete(pid);
    }
    return set;
  }, [thisGameEvents, localInjuredOverride]);
  const loanedIds = useMemo(() => {
    const latest = new Map<string, { ts: string; loaned: boolean }>();
    for (const ev of thisGameEvents) {
      if (ev.type !== "player_loan" || !ev.player_id) continue;
      const loaned = ((ev.metadata as { loaned?: boolean }).loaned) ?? true;
      const cur = latest.get(ev.player_id);
      if (!cur || ev.created_at > cur.ts) {
        latest.set(ev.player_id, { ts: ev.created_at, loaned });
      }
    }
    const set = new Set<string>();
    latest.forEach((v, k) => {
      if (v.loaned) set.add(k);
    });
    // Apply local optimistic overrides on top of server truth.
    for (const [pid, val] of Object.entries(localLoanedOverride)) {
      if (val) set.add(pid);
      else set.delete(pid);
    }
    return set;
  }, [thisGameEvents, localLoanedOverride]);

  // Auto-reconcile: when the server-derived set (excluding our
  // override) agrees with the override for a given player, drop
  // that override. This means a tap → INJ badge appears
  // instantly via override → server write flushes → revalidatePath
  // refreshes thisGameEvents → server-derived set now contains
  // that player → useEffect notices the match and drops the
  // override. From there the badge is "real" not "optimistic".
  // Per-player so an UNRELATED event refresh (a goal landing
  // while injury is mid-flight) doesn't wipe the override before
  // its corresponding event arrives.
  useEffect(() => {
    setLocalInjuredOverride((prev) => {
      // Server-derived injuries (without our overrides) — re-derive
      // from events so the comparison is "real server truth" not
      // "current effective set (which already includes overrides)".
      const serverInjured = new Set<string>();
      const latest = new Map<string, { ts: string; injured: boolean }>();
      for (const ev of thisGameEvents) {
        if (ev.type !== "injury" || !ev.player_id) continue;
        const injured = ((ev.metadata as { injured?: boolean }).injured) ?? true;
        const cur = latest.get(ev.player_id);
        if (!cur || ev.created_at > cur.ts) {
          latest.set(ev.player_id, { ts: ev.created_at, injured });
        }
      }
      latest.forEach((v, k) => {
        if (v.injured) serverInjured.add(k);
      });
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [pid, want] of Object.entries(prev)) {
        const have = serverInjured.has(pid);
        if (have === want) {
          // Server agrees — drop the override.
          changed = true;
        } else {
          next[pid] = want;
        }
      }
      return changed ? next : prev;
    });
  }, [thisGameEvents]);

  useEffect(() => {
    setLocalLoanedOverride((prev) => {
      const serverLoaned = new Set<string>();
      const latest = new Map<string, { ts: string; loaned: boolean }>();
      for (const ev of thisGameEvents) {
        if (ev.type !== "player_loan" || !ev.player_id) continue;
        const loaned = ((ev.metadata as { loaned?: boolean }).loaned) ?? true;
        const cur = latest.get(ev.player_id);
        if (!cur || ev.created_at > cur.ts) {
          latest.set(ev.player_id, { ts: ev.created_at, loaned });
        }
      }
      latest.forEach((v, k) => {
        if (v.loaned) serverLoaned.add(k);
      });
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [pid, want] of Object.entries(prev)) {
        const have = serverLoaned.has(pid);
        if (have === want) {
          changed = true;
        } else {
          next[pid] = want;
        }
      }
      return changed ? next : prev;
    });
  }, [thisGameEvents]);

  // Per-quarter scoreboard for the live QuarterScoreStrip. Mirrors
  // the netball QuarterBreak's scoreByQuarter computation but
  // exposes results indexed 1..4 (index 0 unused) to match the
  // strip's expected shape and the AFL store convention.
  const scoreByQuarter = useMemo(() => {
    // Index 0 unused — coach-friendly Q1=index1, Q2=index2, etc.
    const periods: Array<{
      ours: { goals: number; behinds: number };
      theirs: { goals: number; behinds: number };
    }> = [
      { ours: { goals: 0, behinds: 0 }, theirs: { goals: 0, behinds: 0 } },
      { ours: { goals: 0, behinds: 0 }, theirs: { goals: 0, behinds: 0 } },
      { ours: { goals: 0, behinds: 0 }, theirs: { goals: 0, behinds: 0 } },
      { ours: { goals: 0, behinds: 0 }, theirs: { goals: 0, behinds: 0 } },
      { ours: { goals: 0, behinds: 0 }, theirs: { goals: 0, behinds: 0 } },
    ];
    // Undos pair the way the replay pairs them (named target, else the
    // latest standing score), so this matches the header.
    const undoneTargets = new Set(
      pairScoreUndos(
        [...thisGameEvents].sort((a, b) => a.created_at.localeCompare(b.created_at)),
        new Set(["goal", "opponent_goal"]),
      ).values(),
    );
    for (const ev of thisGameEvents) {
      if (ev.type !== "goal" && ev.type !== "opponent_goal") continue;
      if (undoneTargets.has(ev.id)) continue;
      const meta = ev.metadata as
        | { quarter?: number; intended_quarter?: number }
        | null;
      const q =
        typeof meta?.intended_quarter === "number"
          ? meta.intended_quarter
          : typeof meta?.quarter === "number"
            ? meta.quarter
            : 0;
      if (q < 1 || q > 4) continue;
      if (ev.type === "goal") periods[q].ours.goals++;
      else periods[q].theirs.goals++;
    }
    return periods;
  }, [thisGameEvents]);

  // Late arrivals: squad players who weren't marked available pre-game
  // but turned up after the umpire's first whistle. addLateArrival
  // upserts game_availability + writes a player_arrived event for audit.
  // Tracked client-side too so the bench strip lights up immediately
  // (the action doesn't revalidatePath, mirroring the AFL pattern at
  // src/components/live/LiveGame.tsx:528). Rehydrated from
  // player_arrived events on mount so a refresh mid-quarter doesn't
  // lose the late arrival from the bench (the FK quirk on
  // game_availability.player_id stops fill-ins arriving via the same
  // path, but persistent regular-player late arrivals are intact).
  const [lateArrivedIds, setLateArrivedIds] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    for (const ev of thisGameEvents) {
      if (ev.type === "player_arrived" && ev.player_id) ids.add(ev.player_id);
    }
    return ids;
  });
  // Persistent position locks: pin a player to a position so every
  // subsequent quarter-break suggester places them there. Sticky
  // until the coach explicitly unlocks. Coaches use this to keep a
  // strong shooter at GS or a defensive specialist at GK across the
  // game without having to re-pin each break.
  // Saved as player_lock events, so a reload or a co-manager's phone
  // keeps them (UX plan 5.5).
  const [nextBreakLocks, setNextBreakLocks] = useState<Record<string, string>>(() =>
    netballPositionLocks(replayLocks(thisGameEvents)),
  );
  // Mid-quarter sub log for the CURRENT quarter only. Each entry
  // records the exact clockMs at which a player vacated a position
  // and another took it. Drives accurate per-player time accounting:
  // the sub-out player's bar stops at `atMs`, the sub-in player's bar
  // starts at `atMs`. Cleared when the quarter changes (next
  // period_break_swap absorbs the post-sub state into events).
  //
  // outPlayerId may be null when the slot was already empty before
  // the sub — happens when a coach lent a player and cancelled the
  // replacement picker, then later tapped the empty token to fill
  // it. The segment-rebuilder treats null-out as "nobody to bench"
  // (skips the bench-add step) so a phantom null id can't pollute
  // the bench.
  type MidQuarterSub = {
    positionId: string;
    outPlayerId: string | null;
    // null = vacate-only (Steve 2026-05-23 short-squad "Move to empty
    // position"). The "Move" action emits TWO subs with the same atMs:
    //   1) { positionId: source, outPlayerId: X, inPlayerId: null }
    //   2) { positionId: target, outPlayerId: null, inPlayerId: X }
    // Replay processes them in order; the brief intermediate "X on
    // bench" state lives for 0ms so time credit goes from source to
    // target with no on-bench credit between.
    inPlayerId: string | null;
    atMs: number;
  };
  // The quarter's sub log is the one source of truth for the court
  // (onCourt below), and it's saved on the phone until the break writes
  // it: a reload (phone locked, app switched) used to lose every
  // mid-quarter sub, putting an injured or lent kid back on court
  // (sideline combos).
  const subsKey = `siren-netball-subs:${game.id}`;
  const [midQuarterSubs, setMidQuarterSubs] = useState<MidQuarterSub[]>([]);
  // Restore after hydration (the server can't see the phone's storage,
  // so restoring in the initial state would mismatch the server render).
  const subsRestoredRef = useRef(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(subsKey) ?? "null") as
        | { quarter: number; subs: MidQuarterSub[] }
        | null;
      if (saved && saved.quarter === currentQuarter && Array.isArray(saved.subs) && saved.subs.length) {
        setMidQuarterSubs(saved.subs);
      }
    } catch {
      // Storage unavailable: nothing to restore.
    }
    subsRestoredRef.current = true;
    // Mount only: later quarters start empty (below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const subsQuarterRef = useRef(currentQuarter);
  useEffect(() => {
    // A new quarter starts with no subs (the last quarter's are written
    // by its break). Only on an actual change, not on mount, so a
    // restored log survives.
    if (subsQuarterRef.current !== currentQuarter) {
      subsQuarterRef.current = currentQuarter;
      setMidQuarterSubs([]);
    }
  }, [currentQuarter]);
  useEffect(() => {
    // Not before the restore has read what's saved.
    if (!subsRestoredRef.current) return;
    try {
      if (midQuarterSubs.length === 0 || finalised) window.localStorage.removeItem(subsKey);
      else window.localStorage.setItem(subsKey, JSON.stringify({ quarter: currentQuarter, subs: midQuarterSubs }));
    } catch {
      // Storage unavailable: the subs still live in memory.
    }
  }, [midQuarterSubs, currentQuarter, finalised, subsKey]);
  // Per-position pulse keys for the brand halo on PositionToken.
  // Each entry maps a positionId to the atMs of the most recent
  // mid-quarter sub at that position. When a new sub commits the
  // map gets a new value for that position → the token re-keys
  // its SirenPulseHalo → halo fires once. Re-renders that don't
  // change midQuarterSubs (e.g. clock ticks) reuse the same keys
  // → no spurious pulse. Quarter transitions reset midQuarterSubs
  // to [] → all per-position keys clear, ready for the next
  // quarter's subs.
  //
  // In-memory only — fresh page load starts with no keys, so a
  // refresh during a quarter doesn't replay halos for already-
  // applied subs. (The subs themselves persist via period_break_swap
  // events written at the next break.)
  const positionPulseKeys = useMemo(() => {
    const map: Record<string, string> = {};
    for (const sub of midQuarterSubs) {
      map[sub.positionId] = String(sub.atMs);
    }
    return map;
  }, [midQuarterSubs]);
  // Modal target: long-press opens player actions for this player.
  const [actionsTarget, setActionsTarget] = useState<{
    playerId: string;
    positionId: string | null;
  } | null>(null);
  // A court kid leaving mid-quarter (hurt, lent, switched off): the
  // shared InjuryReplacementModal asks who comes on at their bib, as
  // AFL's does (UX audit 23 Oct 2026: netball's own sheet read "Amelia
  // → Wing Attack", as if she were moving). Nothing is recorded until
  // the coach picks someone or goes without; Cancel leaves them on.
  const [leaving, setLeaving] = useState<{
    playerId: string;
    positionId: string;
    reason: "injured" | "lent" | "subbed";
  } | null>(null);
  // An empty bib tapped mid-quarter (after going without a
  // replacement): the shared SlotFillSheet fills it.
  const [fillPosition, setFillPosition] = useState<string | null>(null);
  // Steve 2026-05-15: removed `pendingQuarterStart` state — the
  // Q1 await-kickoff modal now lives INSIDE NetballLineupPicker
  // (parity with AFL). The picker hosts NetballStartQuarterModal
  // and the modal's "Start Q1" tap fires startNetballGame with
  // startQuarterToo=true, committing lineup_set + quarter_start
  // atomically. No intermediate page state, no pendingQuarterStart
  // gate needed here.
  // Undo last goal — mirrors AFL's pattern at LiveGame.tsx:206. After a
  // goal is recorded a "[Team] goal — Player · Undo" chip appears for
  // 8 seconds (toast); after the toast fades the chip stays as a
  // muted "Undo last score" affordance until another goal is
  // recorded (which replaces it). Tap fires score_undo; the replay
  // engine pops the LIFO undo stack so the latest score is reverted.
  const [lastScore, setLastScore] = useState<
    | { kind: "team" | "opp"; playerName: string | null }
    | null
  >(null);
  const [undoToastVisible, setUndoToastVisible] = useState(false);
  const undoToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startUndoToast = useCallback(
    (kind: "team" | "opp", playerName: string | null) => {
      if (undoToastTimerRef.current !== null) {
        clearTimeout(undoToastTimerRef.current);
      }
      setLastScore({ kind, playerName });
      setUndoToastVisible(true);
      undoToastTimerRef.current = setTimeout(() => {
        setUndoToastVisible(false);
      }, 8000);
    },
    [],
  );
  const handleUndoLastScore = useCallback(() => {
    if (!lastScore) return;
    const undoKind = lastScore.kind;
    setLastScore(null);
    setUndoToastVisible(false);
    if (undoToastTimerRef.current !== null) {
      clearTimeout(undoToastTimerRef.current);
      undoToastTimerRef.current = null;
    }
    // Optimistic delta — subtract one so the scorebug drops
    // instantly (Steve 2026-05-17). The server refresh below
    // reconciles when it lands; if the delta was already at 0
    // (server caught up to the goal first) we go briefly negative,
    // then the prop-refresh useEffect resets to 0 with the new
    // lower truth. Net result: no visible glitch either way.
    setLocalScoreDelta((prev) =>
      undoKind === "team"
        ? { ...prev, team: prev.team - 1 }
        : { ...prev, opp: prev.opp - 1 },
    );
    const { flushed } = enqueueLiveAction("undoNetballScore", [auth, game.id]);
    // Refresh after flush so the rolled-back goal disappears from
    // the scorebug + PositionToken chip on the next render.
    flushed.then(() => startTransition(() => router.refresh()));
  }, [lastScore, auth, game.id, router]);
  // Reset the undo state if the user transitions out of LIVE play
  // (Q-break, finalised) so a stale chip doesn't carry across phases.
  useEffect(() => {
    if (quarterEnded || finalised) {
      setLastScore(null);
      setUndoToastVisible(false);
    }
  }, [quarterEnded, finalised]);

  const squadById = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad]);

  // ─── State machine ─────────────────────────────────────────
  // hasStarted: we've recorded an initial lineup_set already.
  const hasStarted = !!initialLineup;

  // onCourt: the lineup actually playing now (for live display).
  // localOverlay wins if present (mid-quarter substitution); otherwise
  // we fall back to the replayed lineup. When quarterEnded + !finalised,
  // we show the LineupPicker instead of this lineup.
  const onCourt = lineupAfterSubs(
    initialLineup ?? emptyGenericLineup(ageGroup.positions),
    midQuarterSubs,
  );

  // Set of positionIds whose tokens get a "tap to score" affordance.
  // In netball only GS and GA can legally shoot — other tokens are
  // tappable only as a no-op (long-press still works for actions menu).
  const SCORING_POSITIONS = useMemo(() => new Set(["gs", "ga"]), []);

  // Per-player time-by-third stats. Recomputes when clockMs ticks
  // (every 500ms) so the bar fills smoothly.
  //
  // For the in-progress quarter we pass `inProgress.segments` — a
  // chronological list of (lineup, durationMs) slices built from the
  // start-of-quarter lineup plus midQuarterSubs. This gives EACH
  // PLAYER their own timer:
  //   - Q starts at clockMs=0, lineup A is on
  //   - Sub at clockMs=180000 → lineup A credited 180000ms
  //   - Lineup B credited (clockMs - 180000)ms, growing live
  // The sub-out player's bar stops at the sub moment; the sub-in
  // player's bar starts at zero contribution from this quarter and
  // accrues from there. No more inheritance.
  // In-progress contribution for the trailing (still-open) quarter,
  // built ONCE and reused by both `playerStats` (whole-game per-third)
  // and `playedZoneByPeriod` (F3 per-period per-zone) so the two are a
  // single split of the SAME credited ms.
  //
  // "Open" means the trailing quarter is still live from a client-state
  // POV — that's LIVE play AND the Q-break window BEFORE
  // period_break_swap is confirmed. Once confirmed, the post-sub lineup
  // is durable in events and both accessors fall back to the event-only
  // path (undefined here). This catches the Q-break case where the
  // injured player would otherwise get credited the full quarter and
  // their substitute would show 0:00.
  const inProgressContribution = useMemo<InProgressContribution | undefined>(() => {
    const isQuarterOpen = !finalised && currentQuarter > 0;
    if (!isQuarterOpen) return undefined;
    // Build segments from the start-of-quarter lineup + each sub in
    // chronological order. The start-of-quarter lineup is whatever the
    // replay engine handed us (the most recent lineup_set or
    // period_break_swap before the trailing quarter_start).
    //
    // While LIVE, total in-progress duration = clockMs.
    // At Q-break (quarterEnded), the quarter ran its full course so
    // we credit the full quarterLengthMs even if clockMs ticked
    // slightly under that.
    const startLineup =
      initialLineup ?? emptyGenericLineup(ageGroup.positions);
    const totalElapsed = quarterEnded ? quarterLengthMs : clockMs;
    // The replay's own split, so the live clock and the replay agree.
    return { segments: splitQuarterSegments(startLineup, totalElapsed, midQuarterSubs) };
  }, [
    clockMs,
    quarterEnded,
    finalised,
    currentQuarter,
    quarterLengthMs,
    initialLineup,
    midQuarterSubs,
    ageGroup.positions,
  ]);

  // Per-player time-by-third stats. When the trailing quarter is open
  // we hand `playerThirdMs` the in-progress segments so EACH PLAYER
  // gets their own timer (sub-out stops at the sub moment, sub-in
  // starts from zero); otherwise the event-only path covers finalised
  // + pre-game.
  const playerStats = useMemo(() => {
    return playerThirdMs(
      thisGameEvents,
      null,
      quarterLengthSeconds,
      primaryThirdFor as ThirdLookup,
      inProgressContribution,
    );
  }, [thisGameEvents, quarterLengthSeconds, inProgressContribution]);

  // ─── F3 (Phase 12) long-press player insight ────────────────
  // Shared, sport-agnostic summary surfaced inside the shared LockModal
  // via its `insight` slot. Mirrors the AFL LockModal wiring verbatim
  // — same PlayerInsightSummary, same buildPlayerInsight contract — so
  // a coach who runs a footy team AND a netball team sees identical
  // chrome (reuse-before-fork).

  // Labelled zones for the summary, derived from the netball sport
  // config in display order and filtered to (a) this age group's zones
  // (D-03 — never a hardcoded list) AND (b) the thirds that actually
  // accrue time. Netball positions credit time into the three THIRDS
  // (via primaryThirdFor); the two goal CIRCLES never get time, so
  // including them would show a permanent "0%" season slice. Deriving
  // the credited set from primaryThirdFor keeps this config-driven.
  const insightZones = useMemo(() => {
    const credited = new Set<string>();
    for (const posId of ageGroup.positions) {
      const third = primaryThirdFor(posId);
      if (third) credited.add(third);
    }
    return netballSport.zones.filter(
      (z) => ageGroup.zones.includes(z.id) && credited.has(z.id),
    );
  }, [ageGroup.positions, ageGroup.zones]);

  // Season per-zone "minutes" — netball measures season usage in
  // QUARTERS-per-position, so we feed the builder per-third quarter
  // counts. buildPlayerInsight is unit-agnostic for the season slice
  // (D-04: percentages only), so counts produce the right per-third
  // season percentage with no minutes ever surfaced.
  const seasonZoneCounts = useMemo(() => {
    const byPlayer = seasonPositionCounts(seasonEvents);
    const out: Record<string, Record<string, number>> = {};
    for (const [pid, posCounts] of Object.entries(byPlayer)) {
      const z: Record<string, number> = {};
      for (const [posId, n] of Object.entries(posCounts)) {
        const third = primaryThirdFor(posId);
        if (third) z[third] = (z[third] ?? 0) + n;
      }
      out[pid] = z;
    }
    return out;
  }, [seasonEvents]);

  // Loan minutes over completed games, for the Lend line in the player
  // actions (AFL's: "Season total: 12m · squad avg 8m").
  const seasonLoanMinsByPlayer = useMemo(() => seasonLoanMinutes(seasonEvents), [seasonEvents]);

  // Per-player, per-period, per-zone played ms (F3 / D-05). Same
  // credited ms as playerStats, split by period — reuses the SAME
  // inProgressContribution so the trailing live quarter lands in the
  // current period and the buckets provably sum to playerStats.
  const playedZoneByPeriod = useMemo(
    () =>
      playedZoneMsByPeriod(
        thisGameEvents,
        quarterLengthSeconds,
        primaryThirdFor as ThirdLookup,
        inProgressContribution,
      ),
    [thisGameEvents, quarterLengthSeconds, inProgressContribution],
  );

  // Replay-derived per-player "most recently came on" timeline for the
  // "time since last sub" line (D-06). Netball subs only at breaks, so
  // this is period-granular; frame is completedQuarterMs + elapsed.
  const replayState = useMemo(
    () => replayNetballGame(thisGameEvents),
    [thisGameEvents],
  );

  // Absolute game-elapsed "now" in the same frame replayState uses:
  // completed (quarter_end'd) quarters + the live within-quarter
  // elapsed. While a quarter runs, completedQuarterMs excludes it and
  // we add clockMs; once quarter_end fires (Q-break) or the game is
  // finalised the quarter is already in completedQuarterMs, so add 0.
  const completedQuarterMs = useMemo(
    () =>
      thisGameEvents
        .filter((e) => e.type === "quarter_end")
        .reduce(
          (acc, e) => acc + ((e.metadata as { elapsed_ms?: number }).elapsed_ms ?? 0),
          0,
        ),
    [thisGameEvents],
  );
  const liveOverlayMs =
    !finalised && currentQuarter > 0 && !quarterEnded ? clockMs : 0;
  const nowAbsMs = completedQuarterMs + liveOverlayMs;

  // Period label initial for the per-period rows (e.g. "Q" → "Q1").
  const periodAbbrev = periodLabels("netball", ageGroup).label.charAt(0).toUpperCase();

  // Build the PlayerInsightSummary input for one player. Reused by the
  // long-press action modal's `insight` slot. Maps PlayerThirdMs
  // (attack/centre/defence) onto the config third zone ids the rest of
  // the summary is keyed by.
  const buildInsightInput = (pid: string) => {
    const s = playerStats.get(pid);
    const inGameZoneMs: Record<string, number> = {
      "attack-third": s?.attack ?? 0,
      "centre-third": s?.centre ?? 0,
      "defence-third": s?.defence ?? 0,
    };
    const byPeriod = playedZoneByPeriod[pid] ?? {};
    const perPeriod = Object.keys(byPeriod)
      .map(Number)
      .sort((a, b) => a - b)
      .map((q) => ({
        period: q,
        periodLabel: `${periodAbbrev}${q}`,
        zoneMs: byPeriod[q],
      }))
      .filter((p) => Object.values(p.zoneMs).some((v) => v > 0));
    // On court now (mid-quarter subs included)? A kid on the bench has no
    // On time (UX audit 23 Oct 2026: "On 10:18" kept ticking after they
    // went off). A kid who came on mid-quarter has been on since that
    // sub, which the replay won't know until the break saves it.
    const onField = Object.values(onCourt.positions).some((ids) => ids.includes(pid));
    let lastSubbedOnMs = replayState.lastSubbedOnMs[pid] ?? null;
    if (liveOverlayMs > 0) {
      const ons = midQuarterSubs.filter((s) => s.inPlayerId === pid);
      const cameOn = ons[ons.length - 1];
      if (cameOn) lastSubbedOnMs = completedQuarterMs + cameOn.atMs;
    }
    return {
      zones: insightZones,
      inGameZoneMs,
      perPeriod,
      seasonZoneMs: seasonZoneCounts[pid] ?? {},
      // Netball's season is counted in quarters.
      seasonPeriod: 1,
      lastSubbedOnMs,
      nowAbsMs,
      onField,
    };
  };

  // ─── Action handlers ───────────────────────────────────────
  // tap on a GS/GA token → open the confirm sheet (mirrors AFL's
  // score sheet, prevents accidental scoring). The goal only records
  // after the coach confirms via handleConfirmGoal.
  // tap on any other token → no-op (long-press still works).
  const handleTokenTap = (positionId: string, playerId: string | null) => {
    if (currentQuarter < 1 || quarterEnded || finalised) return;
    if (!playerId) {
      // Empty slot — common after a lend without a replacement.
      // Tapping it opens the fill sheet so the coach can fill the bib
      // at any point in the quarter rather than wait for the break.
      setFillPosition(positionId);
      return;
    }
    // Shooters with scoring on get the goal dock (which also offers
    // Player actions). Everyone else opens the action sheet straight
    // away — a tap used to do nothing here, leaving injure / lend /
    // keep behind a long-press only (UX plan H5).
    if (!SCORING_POSITIONS.has(positionId) || !trackScoring) {
      setActionsTarget({ playerId, positionId });
      return;
    }
    setPendingGoal({ playerId, positionId });
  };

  const handleConfirmGoal = () => {
    if (!pendingGoal) return;
    const { playerId } = pendingGoal;
    const player = squadById.get(playerId);
    const playerName =
      player?.full_name.trim().split(/\s+/)[0] ?? null;
    // Optimistic delta — scorebug + per-player chip tick instantly
    // (Steve 2026-05-17 audit fix). Reset when server refresh
    // lands via the useEffect on score-prop change.
    setLocalScoreDelta((prev) => ({
      ...prev,
      team: prev.team + 1,
      player: { ...prev.player, [playerId]: (prev.player[playerId] ?? 0) + 1 },
    }));
    const { flushed } = enqueueLiveAction("recordNetballGoal", [
      auth,
      game.id,
      playerId,
      currentQuarter,
      clockMs,
    ]);
    flushed.then(() => startTransition(() => router.refresh()));
    setPendingGoal(null);
    startUndoToast("team", playerName);
    // Light haptic tap — confirms the goal recorded. P1-10 mirror
    // of AFL `15b0a7c`. Fire-and-forget; the bridge no-ops on web.
    void hapticTap("light");
    // Hype song — AFL parity (Steve 2026-05-16). Plays
    // songDurationSeconds from the configured start point. No-op
    // when the team has no song configured.
    playSong();
  };

  const handleCancelGoal = () => setPendingGoal(null);

  const handleOpponentGoal = useCallback(() => {
    // Optimistic delta — opp scorebug ticks instantly (Steve
    // 2026-05-17 audit fix). Reset via the score-prop refresh
    // useEffect.
    setLocalScoreDelta((prev) => ({ ...prev, opp: prev.opp + 1 }));
    const { flushed } = enqueueLiveAction("recordNetballOpponentGoal", [
      auth,
      game.id,
      currentQuarter,
      clockMs,
    ]);
    flushed.then(() => startTransition(() => router.refresh()));
    startUndoToast("opp", null);
    // Light haptic — opponent goal still counts as a registered tap.
    // P1-10 mirror of AFL `15b0a7c`.
    void hapticTap("light");
  }, [auth, game.id, currentQuarter, clockMs, startUndoToast, router]);

  // long-press on any token (court OR bench strip) → open the player
  // actions modal. Bench tiles pass positionId=null; the modal hides
  // the lock-for-next-break action for bench targets since there's no
  // current position to lock to.
  const handleTokenLongPress = (positionId: string | null, playerId: string | null) => {
    if (!playerId) return;
    setActionsTarget({ playerId, positionId });
  };

  // ─ Modal action wiring ───
  const closeActions = () => setActionsTarget(null);

  // A court kid comes off now: recorded as a vacate at this moment, so
  // their clock stops whether or not anyone replaces them.
  const vacate = (playerId: string, positionId: string) => {
    setMidQuarterSubs((prev) => [
      ...prev,
      { positionId, outPlayerId: playerId, inPlayerId: null, atMs: clockMs },
    ]);
  };
  // A bench kid goes into an empty bib. The brand halo fires on the new
  // tile by itself (positionPulseKeys re-derives from midQuarterSubs).
  // The sub becomes durable at the next break's period_break_swap.
  const fill = (positionId: string, playerId: string) => {
    setMidQuarterSubs((prev) => [
      ...prev,
      { positionId, outPlayerId: null, inPlayerId: playerId, atMs: clockMs },
    ]);
    // Light haptic — mid-quarter sub is a registered tap moment.
    void hapticTap("light");
  };

  // The injury / loan events. The badges come from the events; the
  // overrides show them instantly until the server agrees (Steve
  // 2026-05-17 audit fix).
  const recordInjury = (playerId: string, injured: boolean) => {
    setLocalInjuredOverride((prev) => ({ ...prev, [playerId]: injured }));
    enqueueLiveAction("markInjury", [
      auth,
      game.id,
      { player_id: playerId, injured, quarter: Math.max(1, currentQuarter), elapsed_ms: clockMs },
    ]);
  };
  const recordLoan = (playerId: string, loaned: boolean) => {
    setLocalLoanedOverride((prev) => ({ ...prev, [playerId]: loaned }));
    enqueueLiveAction("markLoan", [
      auth,
      game.id,
      { player_id: playerId, loaned, quarter: Math.max(1, currentQuarter), elapsed_ms: clockMs },
    ]);
  };

  // Hurt, lent or switched off: a court kid's bib asks who comes on (if
  // anyone can). A bench kid, or nobody to bring on, just records it.
  // The actions sheet closes first so a stale sheet can't trap the next
  // long-press.
  const startLeaving = (playerId: string, positionId: string | null, reason: "injured" | "lent" | "subbed") => {
    closeActions();
    if (positionId && benchCandidates.length > 0) {
      setLeaving({ playerId, positionId, reason });
      return;
    }
    leaveNow(playerId, positionId, reason);
  };
  const leaveNow = (playerId: string, positionId: string | null, reason: "injured" | "lent" | "subbed") => {
    if (reason === "injured") recordInjury(playerId, true);
    else if (reason === "lent") recordLoan(playerId, true);
    if (positionId) vacate(playerId, positionId);
  };

  const handleMarkInjured = () => {
    if (!actionsTarget) return;
    startLeaving(actionsTarget.playerId, actionsTarget.positionId, "injured");
  };

  const handleUnInjury = () => {
    if (!actionsTarget) return;
    const { playerId } = actionsTarget;
    closeActions();
    recordInjury(playerId, false);
  };

  // Loan = same UX as injury: the lent kid's bib asks who comes on.
  const handleMarkLoaned = () => {
    if (!actionsTarget) return;
    startLeaving(actionsTarget.playerId, actionsTarget.positionId, "lent");
  };

  const handleUnLoan = () => {
    if (!actionsTarget) return;
    const { playerId } = actionsTarget;
    closeActions();
    recordLoan(playerId, false);
  };

  const handleLockForNextBreak = () => {
    if (!actionsTarget?.positionId) return;
    const { playerId, positionId } = actionsTarget;
    closeActions();
    // One bib per kid: holding them at a new bib frees the old one.
    setNextBreakLocks((prev) => {
      const next: Record<string, string> = {};
      for (const [pos, pid] of Object.entries(prev)) if (pid !== playerId) next[pos] = pid;
      next[positionId] = playerId;
      return next;
    });
    saveLock(playerId, { kind: "position", position: positionId });
  };

  const handleUnlock = () => {
    if (!actionsTarget?.positionId) return;
    const { positionId } = actionsTarget;
    closeActions();
    const held = nextBreakLocks[positionId];
    setNextBreakLocks((prev) => {
      const next = { ...prev };
      delete next[positionId];
      return next;
    });
    if (held) saveLock(held, null);
  };

  function saveLock(playerId: string, lock: PlayerLock | null) {
    enqueueLiveAction("recordPlayerLock", [
      auth,
      game.id,
      { player_id: playerId, lock, quarter: Math.max(1, currentQuarter), elapsed_ms: clockMs },
    ]);
  }

  // The coach picked who comes on: record why the kid left, then the
  // swap at their bib, at the same moment.
  const handlePickReplacement = (replacementId: string) => {
    if (!leaving) return;
    const { playerId, positionId, reason } = leaving;
    setLeaving(null);
    leaveNow(playerId, positionId, reason);
    fill(positionId, replacementId);
  };

  // Late arrival: a squad player who wasn't marked available pre-game
  // but turned up after first whistle. Optimistically add them to the
  // bench (lateArrivedIds), then write a player_arrived audit event
  // and upsert their availability server-side. They flow into the
  // next-quarter lineup picker via availableIds so the suggester can
  // include them in the rotation. Mirrors AFL's pattern at
  // src/components/live/LiveGame.tsx:528.
  const handleLateArrival = (playerId: string) => {
    setLateArrivedIds((prev) => new Set(prev).add(playerId));
    enqueueLiveAction("addLateArrival", [
      auth,
      game.id,
      {
        player_id: playerId,
        quarter: Math.max(1, currentQuarter),
        elapsed_ms: clockMs,
      },
    ]);
  };

  // Candidate pool for the late-arrival menu: active squad members who
  // aren't on court, aren't already available, and haven't already been
  // added as a late arrival. Players already injured/loaned aren't
  // surfaced — they're sidelined for a reason.
  const lateArrivalCandidates = useMemo<Player[]>(() => {
    const onCourtIds = new Set<string>();
    for (const ids of Object.values(onCourt.positions)) {
      for (const id of ids) onCourtIds.add(id);
    }
    const benchIds = new Set(onCourt.bench);
    const availSet = new Set(availableIds);
    return squad.filter((p) =>
      !onCourtIds.has(p.id) &&
      !benchIds.has(p.id) &&
      !availSet.has(p.id) &&
      !lateArrivedIds.has(p.id) &&
      !injuredIds.has(p.id) &&
      !loanedIds.has(p.id),
    );
  }, [squad, onCourt, availableIds, lateArrivedIds, injuredIds, loanedIds]);

  // ─── Off-court roster (drives the bench strip on the live view) ──
  // Anyone in the available pool who isn't currently in a court
  // position. We surface bench / injured / lent in a single strip
  // because the coach mostly cares "who's not playing right now and
  // why" — splitting them into separate sections is more clutter than
  // signal at the point of decision.
  type OffCourtStatus = "bench" | "injured" | "loaned";
  const offCourt = useMemo(() => {
    const onCourtIds = new Set<string>();
    for (const ids of Object.values(onCourt.positions)) {
      for (const id of ids) onCourtIds.add(id);
    }
    const seen = new Set<string>();
    const list: { player: Player; status: OffCourtStatus }[] = [];
    const consider = (pid: string) => {
      if (!pid || seen.has(pid) || onCourtIds.has(pid)) return;
      seen.add(pid);
      const player = squadById.get(pid);
      if (!player) return;
      const status: OffCourtStatus = injuredIds.has(pid)
        ? "injured"
        : loanedIds.has(pid)
        ? "loaned"
        : "bench";
      list.push({ player, status });
    };
    // Order: explicit bench first (most likely to come on next), then
    // anyone else available, then late arrivals so they appear on the
    // bench immediately after the coach taps "Add late arrival" (the
    // server doesn't revalidate, so without this loop they wouldn't
    // show up until the next page render).
    for (const id of onCourt.bench) consider(id);
    for (const id of availableIds) consider(id);
    lateArrivedIds.forEach(consider);
    // Sort sidelined to the end so the active bench stands out.
    list.sort((a, b) => {
      const rank = (s: OffCourtStatus) => (s === "bench" ? 0 : 1);
      return rank(a.status) - rank(b.status);
    });
    return list;
  }, [onCourt, availableIds, lateArrivedIds, squadById, injuredIds, loanedIds]);

  // Who can come on mid-quarter: the kids here today (availableIds plus
  // the optimistic late arrivals) who aren't on court, hurt or lent,
  // least court time first (the suggested pick).
  const totalMsOf = (pid: string) => {
    const t = playerStats.get(pid);
    return t ? t.attack + t.centre + t.defence : 0;
  };
  const benchCandidates = useMemo<Player[]>(() => {
    const onCourtIds = new Set<string>();
    for (const ids of Object.values(onCourt.positions)) {
      for (const id of ids) onCourtIds.add(id);
    }
    const availableSet = new Set<string>(availableIds);
    lateArrivedIds.forEach((id) => availableSet.add(id));
    const total = (pid: string) => {
      const t = playerStats.get(pid);
      return t ? t.attack + t.centre + t.defence : 0;
    };
    return squad
      .filter(
        (p) =>
          availableSet.has(p.id) &&
          !onCourtIds.has(p.id) &&
          !injuredIds.has(p.id) &&
          !loanedIds.has(p.id),
      )
      .sort((a, b) => total(a.id) - total(b.id));
  }, [onCourt, squad, availableIds, lateArrivedIds, injuredIds, loanedIds, playerStats]);

  // ─── Walkthrough state ──────────────────────────────────────
  // Mirrors AFL's first-visit walkthrough at
  // src/components/live/LiveGame.tsx:299. localStorage key is
  // sport-specific (`nb-walkthrough-seen`) so a coach who's seen
  // the AFL walkthrough still gets the netball one on their first
  // netball game — different mechanics, different copy.
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  // Q-by-Q modal trigger — set to true when the coach taps the
  // small chip under the clock pill in NetballScoreBug. Mirrors
  // AFL's quarterScoresOpen in LiveGame.tsx.
  const [quarterScoresOpen, setQuarterScoresOpen] = useState(false);
  // NETBALL-07: walkthrough scoring-step gate is wired to the team's
  // actual track_scoring (was hard-coded `true` before plan 04-04).
  // The "Recording scores" step is dropped when trackScoring=false so
  // the onboarding doesn't promise an affordance the live shell now
  // suppresses.
  const walkthroughSteps = useMemo(
    () => buildNetballWalkthroughSteps({ trackScoring }),
    [trackScoring],
  );
  // No auto-open: the tour is offered on the pre-kickoff lineup screen
  // (WalkthroughOffer, passed into the picker below) and the "?" opens
  // it on demand — never a modal over the clock or a break (UX plan H1).
  function handleWalkthroughClose() {
    if (typeof window !== "undefined") {
      localStorage.setItem("nb-walkthrough-seen", "1");
    }
    setWalkthroughOpen(false);
  }
  function handleOpenWalkthrough() {
    setWalkthroughOpen(true);
  }

  // ─── In-game top bar: Exit · round/date/venue · walkthrough ? ─
  // Replaces the prior thin "✕ Exit / ?" utility row plus the
  // page-level GameInfoHeader strip — now one sticky bar at the
  // top, mirroring the (app) layout header's visual treatment.
  // AppHeaderShell hides the (app) header on /live routes so this
  // is the sole top chrome during a live game (Steve 2026-05-13).
  // The "?" button opens the walkthrough modal; auto-welcome is
  // skipped because the coach already knows what they signed up
  // for at this point.
  const exitHref =
    auth.kind === "team"
      ? `/teams/${auth.teamId}/games/${game.id}`
      : `/run/${auth.token}`;
  const topUtilityRow = (
    <LiveTopBar
      exitHref={exitHref}
      game={game}
      isLive={currentQuarter > 0}
      onHelp={handleOpenWalkthrough}
    />
  );
  const walkthroughOverlay = walkthroughOpen ? (
    <WalkthroughModal steps={walkthroughSteps} onClose={handleWalkthroughClose} />
  ) : null;

  // ─── Initial lineup (before game starts) ────────────────────
  if (!hasStarted) {
    // Pre-kickoff: just the lineup picker. The earlier draft of this
    // branch had a "vs {opponent}" + "Set your starting lineup for
    // Q1" header on top, but the back-to-availability breadcrumb +
    // the auto-suggested callout inside the picker already give the
    // coach all the context they need. Keeping the chrome minimal
    // here puts the actual decision (the lineup) front and centre.
    return (
      <div className="flex flex-col gap-4 pb-4">
        {topUtilityRow}
        {walkthroughOverlay}
        <NetballLineupPicker
          // Rebuild the suggestion when who's-here changes on game day.
          key={[...availableIds].sort().join(",")}
          ageGroup={ageGroup}
          squad={squad}
          availableIds={availableIds}
          initialLineup={initialDraft?.lineup ?? null}
          thisGameEvents={thisGameEvents}
          seasonEvents={seasonEvents}
          defaultQuarterSeconds={quarterLengthSeconds}
          // AFL-parity Lend-a-player support (Steve 2026-05-16).
          // The `loanedIds` memo above derives the set from
          // player_loan events so a refresh / re-entry to the
          // picker preserves the loan state. auth + gameId enable
          // the picker to write further player_loan events as the
          // coach toggles chips.
          auth={auth}
          gameId={game.id}
          initialLoanedIds={Array.from(loanedIds)}
          chipModeByKey={chipModeByKey}
          netballPlaybook={netballPlaybook}
          roleSheet={roleSheet}
          teamAllowMidQuarterSubs={teamAllowMidQuarterSubs}
          gameAllowMidQuarterSubs={gameAllowMidQuarterSubs}
          // "Back to availability" breadcrumb — only meaningful for
          // the team-auth path (game detail page exists). Token-auth
          // (share runner) doesn't have a netball flow yet, so the
          // link is hidden in that case.
          // The game-day panel replaces the "Update availability" link.
          availabilityHref={
            auth.kind === "team" && !availabilityPanel
              ? `/teams/${auth.teamId}/games/${game.id}/availability`
              : undefined
          }
          availabilityPanel={availabilityPanel}
          gamePlan={gamePlan}
          walkthroughOffer={
            <WalkthroughOffer storageKey="nb-walkthrough-seen" steps={walkthroughSteps} />
          }
          currentOnFieldSize={game.on_field_size}
          onConfirm={async (lineup, quarterOverrideSeconds, chosenOnFieldSize) =>
            new Promise<void>((resolve) => {
              startTransition(async () => {
                // Steve 2026-05-15: passes startQuarterToo=true so
                // lineup_set + quarter_start commit atomically.
                // Matches AFL's two-step kickoff — the picker hosts
                // NetballStartQuarterModal and the modal's "Start
                // Q1" tap fires this onConfirm; both events land in
                // one server call, the page goes straight from
                // pre-kickoff to live play with no intermediate
                // "lineup locked, ready the kickoff" state.
                //
                // Steve 2026-05-23: short-squad — pass the picker's
                // chosen on-field-size through to the kickoff write
                // so games.on_field_size reflects what the coach
                // actually wanted. Falls back to defaultOnFieldSize
                // when the dropdown wasn't touched (or wasn't shown
                // in this picker configuration).
                await startNetballGame(
                  auth,
                  game.id,
                  lineup,
                  chosenOnFieldSize ?? ageGroup.defaultOnFieldSize,
                  quarterOverrideSeconds,
                  /* startQuarterToo */ true,
                );
                resolve();
              });
            })
          }
          // Save plan & exit — team-auth only (token-auth runner has
          // no "page to exit to"). Persists the netball lineup as JSON
          // in game_lineup_drafts; redirects back to the game-detail
          // page on success. Mirrors AFL LineupPicker's
          // handleSavePlan flow (Steve 2026-05-13 sport-parity fix).
          onSavePlan={
            auth.kind === "team"
              ? async (lineup) => {
                  const result = await saveNetballLineupDraft(
                    auth,
                    game.id,
                    lineup,
                  );
                  if (!result.success) {
                    throw new Error(result.error);
                  }
                  router.push(`/teams/${auth.teamId}/games/${game.id}`);
                }
              : undefined
          }
          initialSavedAt={initialDraft?.updated_at ?? null}
          confirmLabel="Start Q1"
          disabled={isPending}
        />
      </div>
    );
  }

  // ─── Game finalised ─────────────────────────────────────────
  if (finalised) {
    return (
      <div className="flex flex-col gap-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {topUtilityRow}
        {walkthroughOverlay}
        <NetballScoreBug
          teamName={teamName}
          opponentName={game.opponent}
          team={teamScore}
          opponent={opponentScore}
          quarterLabel="FT"
          clockText="—"
          showScores={trackScoring}
          clockPulseKey={clockPulseKey}
        />
        {/* CourtDisplay + bench strip removed from the finalised
            view (Steve 2026-05-13) — the post-game summary doesn't
            need stale on-court positions, just the scoreboard +
            shareable recap. The pb on this wrapper clears the
            sticky "Done" CTA below. */}
        <NetballGameSummaryCard
          teamName={teamName}
          opponentName={game.opponent}
          teamScore={teamScore}
          opponentScore={opponentScore}
          playerGoals={playerGoals}
          playerStats={playerStats}
          squad={squad}
          trackScoring={trackScoring}
          presentIds={presentPlayerIds(thisGameEvents)}
        />
        {/* Sticky-bottom "Done" CTA — locks to the viewport
            so the user has a big, unmissable exit. It said "Finish
            game" after the game had finished; AFL says "Done" (UX
            audit 23 Oct 2026). Team-auth coach
            goes to /dashboard. Token-auth parent-runner gets a
            "you can close this tab" success card instead — they
            don't have a /dashboard, sending them there hits the
            login wall (Steve 2026-05-13 usability test, Lisa B3).
            Mirrors the AFL LiveGame finalised flow. */}
        {auth.kind === "team" && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(26,30,26,0.04)] sm:px-7 sm:pt-4">
            <div className="mx-auto max-w-4xl">
              <SFButton href="/dashboard" variant="accent" size="lg" full>
                Done
              </SFButton>
            </div>
          </div>
        )}
        {auth.kind === "token" && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(26,30,26,0.04)] sm:px-7 sm:pt-4">
            <div className="mx-auto max-w-4xl text-center">
              <p className="text-sm font-semibold text-ink">
                All done — thanks for running today&apos;s game!
              </p>
              <p className="mt-0.5 text-xs text-ink-dim">
                Everything&apos;s saved. You can close this tab.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Full-time review (Q4 ended, not yet finalised) ───────
  // Mirrors AFL's FullTimeReview: gives the coach a chance to
  // reconcile / fix scores before locking the result. Ends with a
  // "Finalise game" button that fires game_finalised → flips us
  // into the finalised branch above on next render.
  if (quarterEnded && currentQuarter >= ageGroup.periodCount) {
    return (
      <div className="flex flex-col gap-4 pb-4">
        {topUtilityRow}
        {walkthroughOverlay}
        <NetballScoreBug
          teamName={teamName}
          opponentName={game.opponent}
          team={teamScore}
          opponent={opponentScore}
          quarterLabel="FT"
          clockText="—"
          showScores={trackScoring}
          clockPulseKey={clockPulseKey}
        />
        <NetballFullTimeReview
          auth={auth}
          gameId={game.id}
          trackScoring={trackScoring}
          teamScore={teamScore}
          opponentScore={opponentScore}
          scoreByQuarter={scoreByQuarter}
          players={squad}
          finalisedElapsedMs={_quarterElapsedMs ?? 0}
          midQuarterSubs={midQuarterSubs}
          opponentName={game.opponent}
        />
      </div>
    );
  }

  // ─── Quarter break — Siren Footy-style reshuffle ──────────
  // Replaced the position-by-position lineup picker with the
  // NetballQuarterBreak component (mirrors AFL's QuarterBreak design):
  // header card with fairness score + suggested-reshuffle toggle,
  // per-third sections, two-tap to swap, time bars per player. The
  // component handles its own period_break_swap + startNetballQuarter
  // writes; we just clear the local overlay/lock state on success.
  if (quarterEnded && currentQuarter < ageGroup.periodCount) {
    return (
      <div className="pb-4">
        {walkthroughOverlay}
        <NetballQuarterBreak
          auth={auth}
          gameId={game.id}
          game={game}
          exitHref={exitHref}
          onHelp={handleOpenWalkthrough}
          squad={squad}
          availableIds={availableIds}
          ageGroup={ageGroup}
          currentQuarter={currentQuarter}
          currentOnFieldSize={game.on_field_size}
          previousLineup={onCourt}
          preAppliedLocks={(() => {
            // Filter out locks for players who are now injured or on
            // loan — pinning a sidelined player to a court slot would
            // ignore the rules-of-play. The lock entry itself stays
            // in nextBreakLocks (so it re-applies once the coach
            // recovers/returns the player), it's just suppressed in
            // this break's preApplied set.
            const filtered: Record<string, string> = {};
            for (const [posId, pid] of Object.entries(nextBreakLocks)) {
              if (!injuredIds.has(pid) && !loanedIds.has(pid)) {
                filtered[posId] = pid;
              }
            }
            return filtered;
          })()}
          periodSeconds={quarterLengthSeconds}
          thisGameEvents={thisGameEvents}
          seasonEvents={seasonEvents}
          injuredIds={injuredIds}
          loanedIds={loanedIds}
          playerGoals={playerGoals}
          playerStats={playerStats}
          midQuarterSubs={midQuarterSubs}
          chipModeByKey={chipModeByKey}
          netballPlaybook={netballPlaybook}
          trackScoring={trackScoring}
          onStarted={() => {
            // nextBreakLocks INTENTIONALLY persist across the
            // transition: the coach's "🔒 Keep at GS next break" is
            // a sticky preference, not a one-shot. Each subsequent
            // Q-break re-applies the same locks to the suggester
            // until the coach explicitly unlocks the slot. The
            // Q-break component already filters injured/loaned
            // players out of the candidate pool, so a locked-but-
            // sidelined player won't get re-placed at their slot.
            // Belt-and-braces: clear any modal-/sheet-driving state
            // that might have lingered from the previous quarter so
            // a stuck overlay can't block long-press in the new one.
            // (closeActions / setLeaving(null) on the success paths
            // usually handle this; this is the safety net.)
            setActionsTarget(null);
            setLeaving(null);
            setFillPosition(null);
            setPendingGoal(null);
          }}
        />
      </div>
    );
  }

  // Steve 2026-05-15: the intermediate "lineup locked, ready the
  // kickoff" page-state branch (currentQuarter === 0 && !quarterEnded)
  // is gone. NetballLineupPicker now hosts NetballStartQuarterModal
  // in-place and `startNetballGame` writes lineup_set + quarter_start
  // atomically via the `startQuarterToo=true` flag. There's no longer
  // a moment when the page can render with a committed lineup but no
  // quarter_start event — matches AFL's flow exactly.

  // ─── Between Q4 and finalise: show finalise button ──────────
  if (quarterEnded && currentQuarter >= ageGroup.periodCount) {
    return (
      <div className="flex flex-col gap-4 pb-4">
        {topUtilityRow}
        {walkthroughOverlay}
        <NetballScoreBug
          teamName={teamName}
          opponentName={game.opponent}
          team={teamScore}
          opponent={opponentScore}
          quarterLabel="Q4 END"
          clockText="—"
          showScores={trackScoring}
          clockPulseKey={clockPulseKey}
        />
        <CourtDisplay lineup={onCourt} ageGroup={ageGroup} squadById={squadById} disabled />
        <button
          type="button"
          onClick={() => {
            const { flushed } = enqueueLiveAction("endNetballQuarter", [
              auth,
              game.id,
              4,
              clockMs,
            ]);
            // Refresh after flush so SSR sees the finalise events
            // and the page rerenders into FT review.
            flushed.then(() => startTransition(() => router.refresh()));
          }}
          disabled={isPending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-white font-semibold disabled:opacity-60"
        >
          {isPending && <PulseDot size="sm" />}
          {isPending ? "Finishing…" : "Finish game"}
        </button>
      </div>
    );
  }

  // ─── LIVE (currentQuarter > 0, not ended) ───────────────────
  // Goal scoring is per-player: tap a GS or GA token to attribute a
  // goal to that player. Long-press any player to open the actions
  // modal (injury / loan / lock-for-next-break).
  const actionsPlayer = actionsTarget
    ? squadById.get(actionsTarget.playerId) ?? null
    : null;

  // Live-play scorebug — pinned to the bottom of the viewport so
  // the +G chip is thumb-reachable during a quarter (Steve
  // 2026-05-13). Mirrors the AFL LiveGame pattern. Other states
  // (pre-game, Q-break, FT review, finalised) keep the scorebug
  // top-anchored — those branches return earlier with their own
  // inline scorebug rendering.
  const liveScoreBug = (
    <NetballScoreBug
      teamName={teamName}
      opponentName={game.opponent}
      // Effective values (props + optimistic delta) so the scorebug
      // ticks instantly on +G tap, doesn't wait for the server
      // refresh. Steve 2026-05-17 audit fix.
      team={effectiveTeamScore}
      opponent={effectiveOpponentScore}
      quarterLabel={isPaused ? "PAUSE" : `Q${currentQuarter}`}
      clockText={formatClock(remainingMs)}
      isPending={isPending}
      // NETBALL-04: pass undefined when scoring isn't tracked so
      // NetballScoreBug's existing `{onOpponentGoal && (...)}` gate
      // hides the +G affordance (no opponent-goal button visible).
      onOpponentGoal={trackScoring ? handleOpponentGoal : undefined}
      // Steve 2026-05-16: AFL-parity own-team +G chip. Hidden when
      // (a) scoring isn't tracked at all, OR (b) a goal-confirm
      // sheet is already mid-flight (avoids two scorer pickers
      // open at once if the coach tapped a GS tile first then
      // hits +G). Tap opens the SlotFillSheet rendered below the
      // sticky bar; pick → records directly without a confirm.
      onTeamGoal={
        trackScoring && !pendingGoal && !pickScorerOpen
          ? () => setPickScorerOpen(true)
          : undefined
      }
      onClockTap={
        currentQuarter >= 1 && !quarterEnded && !finalised
          ? () => setClockMenuOpen(true)
          : undefined
      }
      clockLabel={`Clock — Q${currentQuarter}, ${isPaused ? "paused" : "running"}`}
      // Q-by-Q chip surfaces only when there's something to show.
      // trackScoring=false hides it entirely (would be empty).
      onShowQuarterScores={
        trackScoring ? () => setQuarterScoresOpen(true) : undefined
      }
      paused={isPaused}
      showScores={trackScoring}
      // Strip the inner card chrome — this scorebug renders
      // inside the sticky-bottom wrapper at the end of this
      // branch's JSX. Mirrors AFL.
      flat
    />
  );

  return (
    <div className="flex flex-col gap-4 pb-4">
      {topUtilityRow}
      {walkthroughOverlay}

      {/* End-Q-early confirm. Mirrors the AFL one at
          src/components/live/LiveGame.tsx — destructive, full
          quarter credit per Steve's spec ("apply all the
          remaining minutes of the quarter to the players on
          field"). */}
      {clockMenuOpen && (
        <ClockMenu
          periodAbbr={`Q${currentQuarter}`}
          running={!isPaused}
          onPause={toggleClock}
          onResume={toggleClock}
          onEndEarly={() => setShowManualEndConfirm(true)}
          onClose={() => setClockMenuOpen(false)}
        />
      )}

      {showManualEndConfirm && (
        <ManualEndQuarterConfirm
          quarter={currentQuarter}
          playersLabel="On-court"
          onConfirm={() => {
            setShowManualEndConfirm(false);
            handleManualEndQuarter();
          }}
          onCancel={() => setShowManualEndConfirm(false)}
        />
      )}

      {quarterScoresOpen && (
        <QuarterScoreModal
          sport="netball"
          scoreByQuarter={scoreByQuarter}
          currentQuarter={currentQuarter}
          quarterEnded={quarterEnded}
          teamName={teamName}
          opponentName={game.opponent}
          onClose={() => setQuarterScoresOpen(false)}
          // Wire fix-scores so coach can unwind a misattributed
          // goal mid-quarter without waiting for the break.
          auth={auth}
          gameId={game.id}
          players={squad}
        />
      )}

      {/* Undo strip moved into the sticky-bottom bar (Steve
          2026-05-13). Mirrors AFL. NETBALL-04 trackScoring gate
          applies down there. */}

      {/* No colour key here (UI polish audit §13): on the live court
          each token's bib chip reads in its third's colour right
          above the bar, and the bands name themselves. The key stays
          on the quarter-break and picker screens, where bare bars are
          the decision aid (Steve 2026-06-29). */}
      <CourtDisplay
        lineup={onCourt}
        ageGroup={ageGroup}
        squadById={squadById}
        onTokenTap={handleTokenTap}
        onTokenLongPress={handleTokenLongPress}
        scoringPositionIds={SCORING_POSITIONS}
        injuredIds={injuredIds}
        loanedIds={loanedIds}
        nextBreakLocks={nextBreakLocks}
        playerStats={playerStats}
        // Effective per-player goals (props + optimistic delta) so
        // the GS/GA chip pulses instantly on goal commit. Steve
        // 2026-05-17 audit fix.
        playerGoals={effectivePlayerGoals}
        positionPulseKeys={positionPulseKeys}
        wakeUpKey={courtWakeUpKey}
      />

      <NetballBenchStrip
        entries={offCourt}
        playerStats={playerStats}
        playerGoals={effectivePlayerGoals}
        onTileLongPress={(pid) => handleTokenLongPress(null, pid)}
      />

      {/* Plan-NEXT-period entry (F2 / ROTPLAN-02): in the final
          rotation window of the period (inFinalWindow, derived from the
          live game clock) and not on the last period, the coach can
          open the SAME shared planner on the NEXT period's tab and
          build its lineup so the break opens pre-seeded. A "Next period
          ready" badge + Clear appears once pinned. Mirrors AFL. */}
      {inFinalWindow && !isLastPeriod && (
        <div className="flex items-center justify-between gap-2 px-1">
          <SFButton
            variant="ghost"
            size="md"
            data-testid="plan-next-period-entry"
            onClick={() => setPlanNextOpen(true)}
            icon={<SFIcon.whistle />}
          >
            {hasPinnedNextPeriod
              ? `Edit Q${currentQuarter + 1} plan`
              : `Plan Q${currentQuarter + 1}`}
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
                onClick={() => setPlannedRotation(consumePeriodPin(pinForThisGame, currentQuarter))}
                className="font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim transition-colors hover:text-ink"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* Plan-NEXT-period planner (F2). Same shared GamePlanModal,
          opened on the NEXT period's tab (initialPeriodIndex=1 —
          period[0] mirrors the current court, period[1] is the
          projected next period). On pin we store the edited next-period
          positions/bench in the SAME plannedRotation slice; the
          upcoming break opens pre-seeded from it. */}
      {planNextOpen && (() => {
        const currentGroups: Record<string, string[]> = {};
        for (const pos of ageGroup.positions) {
          currentGroups[pos] = onCourt.positions[pos] ?? [];
        }
        const currentBench = onCourt.bench;

        // Only players present (on court / bench) AND healthy. Shared
        // rule across all sports — drops away players AND anyone injured /
        // loaned out mid-game (Steve 2026-06-15, short-squad game).
        const inGameIds = new Set<string>([
          ...ageGroup.positions.flatMap((pos) => onCourt.positions[pos] ?? []),
          ...onCourt.bench,
        ]);
        const playersForPlan = availablePlayersForPlan(
          squad,
          inGameIds,
          injuredIds,
          loanedIds,
        );

        // Per-player game context for the planner rows (issue: plan with
        // break-level info) — total minutes + per-third breakdown this
        // game, from the same playerThirdMs map the tiles use.
        const planPlayerStats: Record<
          string,
          { totalMs: number; zones: { label: string; ms: number }[] }
        > = {};
        for (const p of playersForPlan) {
          const t = playerStats.get(p.id);
          const byThird = (t ?? {}) as Record<string, number>;
          const totalMs = t ? t.attack + t.centre + t.defence : 0;
          planPlayerStats[p.id] = {
            totalMs,
            zones: insightZones.map((z) => ({
              label: z.shortLabel,
              ms: byThird[z.id] ?? 0,
            })),
          };
        }

        const initialPlan = projectUpcomingRotation({
          sport: "netball",
          ageGroup,
          players: playersForPlan,
          onFieldSize: game.on_field_size,
          seed: 7,
          chipModeByKey,
          netballPlaybook,
          fromPeriodIndex: Math.max(0, currentQuarter - 1),
          currentGroups,
          currentBench,
        });

        return (
          <GamePlanModal
            sport="netball"
            ageGroup={ageGroup}
            players={playersForPlan}
            onFieldSize={game.on_field_size}
            teamName={teamName}
            opponentName={game.opponent}
            seasonEvents={seasonEvents}
            chipModeByKey={chipModeByKey}
            netballPlaybook={netballPlaybook}
            // Reopened after a pin: show the pinned next period, not a
            // fresh projection ("Suggested" still reverts to the projection).
            initialPlan={withPinnedPeriods(initialPlan, {
              pin: pinForThisGame,
              fromPeriodIndex: currentQuarter,
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
            pinLabel={`Pin Q${currentQuarter + 1} plan`}
            onPin={(plan) => {
              // The coach edited the NEXT period. Find it by absolute
              // period number (robust to a Reshuffle that rerolls the
              // whole-game projection), then pin its groups + bench.
              const targetPeriodNum = currentQuarter + 1;
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
                nextPeriodIndex: currentQuarter,
                nextPeriodGroups,
                nextPeriodBench: next.bench,
              });
            }}
            onClose={() => setPlanNextOpen(false)}
          />
        );
      })()}

      {/* Admin / utility action row — chrome owned by the shared
          LiveAdminUtilityRow (Phase 5b). lateArrivalCandidates is
          already pre-filtered by netball's state machine, so we
          just pass it through. */}
      <LiveAdminUtilityRow
        candidates={lateArrivalCandidates}
        onLateArrival={handleLateArrival}
        lateArrivalPending={isPending}
        auth={auth}
        gameId={game.id}
        isAdmin={isAdmin}
        finished={finalised}
      />

      <p className="text-center text-xs text-ink-dim">
        {trackScoring
          ? "Tap GS or GA to score (with confirm). Long-press any player for actions. The quarter ends automatically when the clock reaches zero."
          : "Long-press any player for actions. The quarter ends automatically when the clock reaches zero."}
      </p>

      {/* Player actions — the shared LockModal, as AFL's (UX audit
          23 Oct 2026: netball had its own copy with emoji pills, no
          lines under the actions and an amber Mark injured). Opens on a
          long-press of any token or a tap on a bench tile. Netball's
          lock is "Keep in GS next break": a hint to the break's
          suggester, not a mid-play rotation lock. */}
      {actionsTarget && actionsPlayer && (() => {
        const { playerId, positionId } = actionsTarget;
        const isInjured = injuredIds.has(playerId);
        const isLoaned = loanedIds.has(playerId);
        const bibOf = (pid: string) => netballSport.allPositions.find((p) => p.id === pid);
        const short = positionId ? bibOf(positionId)?.shortLabel ?? positionId.toUpperCase() : null;
        // Short-squad blank-slot reshuffle (Steve 2026-05-23), with mid-
        // quarter subs on: one action per empty bib.
        // Season loan minutes: completed games plus this game so far, an
        // open loan counted to now (a closing quarter_end at the clock).
        const thisGameLoans = gameLoanMinutes(
          liveOverlayMs > 0
            ? [
                ...thisGameEvents,
                { type: "quarter_end", metadata: { elapsed_ms: clockMs }, created_at: "9999" } as unknown as GameEvent,
              ]
            : thisGameEvents,
        );
        const seasonLoanMins = (seasonLoanMinsByPlayer[playerId] ?? 0) + (thisGameLoans[playerId] ?? 0);
        const squadValues = Object.values(seasonLoanMinsByPlayer).filter((v) => v > 0);
        const squadLoanMins = squadValues.length > 0 ? squadValues.reduce((a, b) => a + b, 0) / squadValues.length : 0;
        const emptyPositions =
          allowMidQuarterSubs && positionId && !isInjured && !isLoaned
            ? ageGroup.positions.filter((pid) => (onCourt.positions[pid]?.length ?? 0) === 0)
            : [];
        return (
          <LockModal
            player={actionsPlayer}
            currentLock={positionId && nextBreakLocks[positionId] === playerId ? "zone" : null}
            currentZone={null}
            currentLine={short}
            seasonLoanMins={seasonLoanMins}
            squadLoanMins={squadLoanMins}
            zoneLabel={short ? `${short} next break` : undefined}
            lockZoneHint={short ? `Stays at ${short} when the next break's lineup is made` : undefined}
            lockedNote={short ? `Kept at ${short} for the next break.` : undefined}
            isInjured={isInjured}
            isLoaned={isLoaned}
            insight={<PlayerInsightSummary input={buildInsightInput(playerId)} />}
            onLockZone={positionId ? handleLockForNextBreak : undefined}
            onUnlock={handleUnlock}
            onToggleInjury={isInjured ? handleUnInjury : handleMarkInjured}
            onToggleLoan={isLoaned ? handleUnLoan : handleMarkLoaned}
            // Mid-quarter sub, only with the team's allow_mid_quarter_subs
            // on (Steve 2026-05-16: most netball comps ban them) and
            // someone on the bench to bring on.
            onSwitch={
              allowMidQuarterSubs && positionId && benchCandidates.length > 0
                ? () => startLeaving(playerId, positionId, "subbed")
                : undefined
            }
            switchHint={short ? `Pick who comes on at ${short}` : undefined}
            extraActions={emptyPositions.map((target) => {
              const bib = bibOf(target);
              return {
                label: `Move to ${bib?.shortLabel ?? target.toUpperCase()}`,
                hint: `${bib?.label ?? target}: leaves ${short} empty`,
                onClick: () => {
                  // A paired vacate + fill at the same atMs, so the next
                  // period_break_swap snapshots the move and the replay
                  // credits no bench time in between.
                  if (!positionId || positionId === target) return;
                  closeActions();
                  const atMs = clockMs;
                  setMidQuarterSubs((prev) => [
                    ...prev,
                    { positionId, outPlayerId: playerId, inPlayerId: null, atMs },
                    { positionId: target, outPlayerId: null, inPlayerId: playerId, atMs },
                  ]);
                },
              };
            })}
            onClose={closeActions}
          />
        );
      })()}

      {/* Who comes on at the bib a kid is leaving (hurt, lent, switched
          off) — the shared InjuryReplacementModal, least court time
          suggested. */}
      {leaving && (() => {
        const who = squadById.get(leaving.playerId);
        if (!who) return null;
        const bib = netballSport.allPositions.find((p) => p.id === leaving.positionId);
        const candidates: InjuryReplacementCandidate[] = benchCandidates.map((p) => ({
          player: p,
          totalMs: totalMsOf(p.id),
        }));
        return (
          <InjuryReplacementModal
            injuredPlayer={who}
            spotLabel={bib?.shortLabel ?? leaving.positionId.toUpperCase()}
            reason={leaving.reason}
            candidates={candidates}
            onPickReplacement={handlePickReplacement}
            onSkipReplacement={() => {
              const { playerId, positionId, reason } = leaving;
              setLeaving(null);
              leaveNow(playerId, positionId, reason);
            }}
            onCancel={() => setLeaving(null)}
          />
        );
      })()}

      {/* An empty bib, tapped: fill it from the bench. */}
      {fillPosition && (
        <SlotFillSheet
          slotLabel={netballSport.allPositions.find((p) => p.id === fillPosition)?.shortLabel ?? fillPosition.toUpperCase()}
          candidates={benchCandidates.map((p) => ({
            id: p.id,
            name: p.full_name,
            subLabel: `Played ${formatMinSec(totalMsOf(p.id))}`,
          }))}
          emptyMessage="Nobody on the bench can come on."
          onPick={(pid) => {
            const pos = fillPosition;
            setFillPosition(null);
            fill(pos, pid);
          }}
          onCancel={() => setFillPosition(null)}
        />
      )}

      {/* Scorebug-driven scorer picker. Opens when the coach taps
          the new own-team +G chip on the scorebug. Lists only the
          currently-on-court GS + GA (the only positions allowed to
          score in netball). Pick → record directly; no confirm
          sheet, mirrors AFL's GameHeader-driven picker pattern. If
          no eligible scorers are on court (rare — only if the GS
          OR GA tile is empty mid-quarter via injury or vacancy)
          the sheet still renders so the coach sees "no candidates"
          instead of nothing visibly happening on the tap.
          Steve 2026-05-16. */}
      {pickScorerOpen && (() => {
        const eligibleIds = [
          ...(onCourt.positions.gs ?? []),
          ...(onCourt.positions.ga ?? []),
        ];
        // Dressed rows, not bare text (UI polish audit §11): the
        // AFL who-scored picker gives each row a number circle and
        // a position caption; a netball goal deserves the same
        // moment. The bib label rides in the circle (netball has no
        // jersey numbers) and the full position name captions it.
        const candidates = eligibleIds
          .map((pid) => {
            const player = squadById.get(pid);
            if (!player) return null;
            const positionId = (onCourt.positions.gs ?? []).includes(pid) ? "GS" : "GA";
            return {
              id: pid,
              name: player.full_name,
              jerseyNumber: positionId,
              subLabel: positionId === "GS" ? "Goal Shooter" : "Goal Attack",
            };
          })
          .filter((c): c is NonNullable<typeof c> => !!c);
        return (
          <SlotFillSheet
            slotLabel="goal"
            titleVerb="Record"
            subtitle="Pick the scorer. Only GS and GA can score a netball goal."
            emptyMessage="No GS or GA on court right now."
            candidates={candidates}
            onPick={(playerId) => {
              setPickScorerOpen(false);
              const player = squadById.get(playerId);
              const playerName = player?.full_name.trim().split(/\s+/)[0] ?? null;
              // Optimistic delta — same as the court-tap path.
              setLocalScoreDelta((prev) => ({
                ...prev,
                team: prev.team + 1,
                player: {
                  ...prev.player,
                  [playerId]: (prev.player[playerId] ?? 0) + 1,
                },
              }));
              const { flushed } = enqueueLiveAction("recordNetballGoal", [
                auth,
                game.id,
                playerId,
                currentQuarter,
                clockMs,
              ]);
              flushed.then(() => startTransition(() => router.refresh()));
              startUndoToast("team", playerName);
              // Same light-tap haptic as the court flow's
              // handleConfirmGoal so coaches feel the same
              // confirmation regardless of entry point.
              void hapticTap("light");
              // Hype song — same as court-flow path. AFL parity.
              playSong();
            }}
            onCancel={() => setPickScorerOpen(false)}
          />
        );
      })()}

      {/* Goal confirm sheet — chrome owned by the shared
          ScoreRecordingDock (Phase 5c). Coach taps a GS/GA token,
          this surfaces so they can sanity-check the player before
          committing. Single + Goal button (netball is goals-only —
          no behinds). */}
      {pendingGoal && (() => {
        const player = squadById.get(pendingGoal.playerId);
        return (
          <ScoreRecordingDock
            heading={
              <>
                Record goal for{" "}
                <span className="text-brand-700">
                  {player?.full_name ?? "player"}
                </span>
              </>
            }
            onCancel={handleCancelGoal}
          onPlayerActions={() => {
            const target = pendingGoal;
            handleCancelGoal();
            if (target) setActionsTarget(target);
          }}
            actions={
              <button
                type="button"
                onClick={handleConfirmGoal}
                disabled={isPending}
                className="w-full rounded-sm bg-brand-600 py-3 font-mono text-base font-bold uppercase tracking-micro text-white shadow-card transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
              >
                + Goal
              </button>
            }
          />
        );
      })()}

      {/* Sticky-bottom scorebug — Steve 2026-05-13: thumb-reach
          +G AND the bar must look properly locked to the bottom
          (not a floating card). Full-width, edge-to-edge solid
          surface with a top border + upward shadow so scrolling
          content disappears cleanly behind it. The NetballScoreBug
          inside renders `flat` so its inner card chrome is
          stripped — no card-on-card. Safe-area-aware bottom
          padding clears the iPhone home indicator. z-30 sits
          below modals (z-50) so confirm sheets still overlay
          cleanly. */}
      {/* Sticky-bottom scorebug + undo strip — chrome owned by
          the shared LiveStickyScoreBar (Phase 5d). NETBALL-04 gate
          (`trackScoring`) gates the undo strip locally; when the
          team has scoring turned off, there's no goal flow + no
          undo to show. */}
      <LiveStickyScoreBar
        scorebug={liveScoreBug}
          scoringOff={
            !trackScoring
              ? { settingsHref: auth.kind === "team" && isAdmin ? `/teams/${auth.teamId}/settings#section-game-day-extras` : null }
              : undefined
          }
        undoStrip={
          trackScoring && lastScore ? (
            <UndoStrip
              flashing={undoToastVisible}
              message={`${lastScore.kind === "team" ? teamName : game.opponent} goal${
                lastScore.playerName ? ` — ${lastScore.playerName}` : ""
              }`}
              onUndo={handleUndoLastScore}
              disabled={isPending}
            />
          ) : null
        }
      />

      {/* First-time onboarding hint for the long-press affordance.
          Self-dismisses on first long-press / Got-it tap / 12s. The
          hint shares a localStorage flag with AFL's mount so users
          who saw it on the AFL side don't see it again here.
          P1.5-3 in MICRO-INTERACTIONS-PLAN.md — netball mirror of
          commit 2ca8e90. We mount it unconditionally on the
          live-play branch (this branch only renders when
          currentQuarter > 0 && !quarterEnded && !finalised). */}
      {/* Hidden while the goal dock is open so it never covers it. */}
      <LongPressHint enabled={!pendingGoal} />

    </div>
  );
}

// ─── Score bug ──────────────────────────────────────────────
// Broadcast-style scoreboard: HOME · clock pill · AWAY in three
// columns, mirroring the AFL GameHeader at src/components/live/
// GameHeader.tsx:73. Same tokens, same proportions — single-number
// scores instead of AFL's "G·B + total" because netball is
// goals-only. The clock pill is non-interactive (netball has no
// pause/resume; the clock auto-runs and auto-ends at the hooter).
//
// quarterLabel + clockText are computed by the parent so a single
// component covers every phase: PRE / Q1-4 / BRK / FT.
function NetballScoreBug({
  teamName,
  opponentName,
  team,
  opponent,
  quarterLabel,
  clockText,
  onTeamGoal,
  onOpponentGoal,
  isPending,
  onClockTap,
  onShowQuarterScores,
  clockLabel,
  paused = false,
  showScores = true,
  clockPulseKey = null,
  flat = false,
}: {
  teamName: string;
  opponentName: string;
  team: { goals: number };
  opponent: { goals: number };
  /** Small uppercase label inside the clock pill — e.g. "PRE", "Q2", "BRK", "FT". */
  quarterLabel: string;
  /** Big numeric line inside the clock pill — e.g. "08:00", "—". */
  clockText: string;
  /**
   * Steve 2026-05-16: AFL-parity own-team goal chip. When wired,
   * a +G button mirrors the opponent +G on the left side of the
   * scorebug. Parent owns the picker UI — this just opens it. The
   * existing GS/GA tile-tap flow on the court continues to work
   * independently for coaches who prefer that path.
   */
  onTeamGoal?: () => void;
  onOpponentGoal?: () => void;
  isPending?: boolean;
  /**
   * Optional tap handler on the centre clock pill — wired during
   * live play so the coach can pause/resume by tapping. Mirrors
   * AFL's GameHeader pattern (src/components/live/GameHeader.tsx:34).
   * When undefined, the pill renders as a plain div (no affordance).
   */
  onClockTap?: () => void;
  /**
   * Tap the small "Q-by-Q" chip below the clock pill. Parent owns
   * the modal so the same data the strip uses can be reused
   * without re-passing the full scoreByQuarter array down here.
   * Hidden when omitted (pre-Q1 / track_scoring=false / FT).
   * Mirrors AFL's GameHeader.onShowQuarterScores prop.
   */
  onShowQuarterScores?: () => void;
  /**
   * Tap the "End Q early" chip — only rendered when paused. Parent
   * owns the confirmation flow. Mirrors AFL's GameHeader prop of
   * the same name. Real-game scenario: paused at the start of the
   * quarter, forgot to resume, need to skip to the Q-break.
   */
  /** Accessible name of the clock pill, e.g. "Clock — Q2, running". */
  clockLabel?: string;
  /** Whether the clock is currently paused — drives the visual cue. */
  paused?: boolean;
  /**
   * Whether to render the numeric goal counts. NETBALL-04: when the
   * team isn't tracking scores the broadcast scoreboard is misleading
   * — both sides would show "0" all game. Replace with an em-dash
   * placeholder so the score-bug retains its broadcast layout (team
   * names + clock pill stay aligned) without lying about a 0-0 score.
   * Defaults to true so the existing track_scoring=true behaviour is
   * unchanged at every call site that doesn't pass the prop.
   */
  showScores?: boolean;
  /**
   * Bump this whenever a moment that ARE a siren going off
   * occurs — quarter-end hooter, game finalised. The clock pill
   * pulses once with the brand's siren halo. Pass `null` (the
   * default) to suppress the pulse on score-bug instances that
   * aren't tied to a sirenic moment.
   */
  clockPulseKey?: string | number | null;
  /**
   * Strip the outer card chrome — used when nested inside the
   * sticky-bottom wrapper during live play (Steve 2026-05-13).
   * Mirrors GameHeader.flat.
   */
  flat?: boolean;
}) {
  // Motion (design session 17 Oct 2026): totals roll one slot, a "+1"
  // ghost rises off the side that scored, a light haptic on touch-down.
  const teamGhost = useScoreGhost(team.goals);
  const oppGhost = useScoreGhost(opponent.goals);
  const tapDown = () => void hapticTap("light");
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-x-3 px-4 pb-6 pt-3 ${
        flat ? "" : "rounded-md bg-surface shadow-card"
      }`}
    >
      {/* Left: home team. Re-skin (design session 17 Oct 2026):
          mirrors GameHeader — total 44/700 tabular, names recede,
          one baseline across the three columns. */}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="min-w-0">
          <p data-testid="scorebug-team-name" className={SCORE_TEAM_NAME}>
            {teamName}
          </p>
          <p className="nums mt-1 font-mono tabular-nums text-ink">
            {/* Pre-Q1 the scoreboard renders "—" instead of zero so a
                freshly-mounted game doesn't look like it's already
                0-0 (visually identical to a finished 0-0 result).
                Once Q1 starts (showScores=true), RollingNumber takes
                over and rolls one slot on each goal. */}
            {showScores ? (
              <RollingNumber
                value={team.goals}
                className="text-[44px] font-bold leading-10 tracking-[-0.04em]"
              />
            ) : (
              <span className="text-[44px] font-bold leading-10 tracking-[-0.04em]">—</span>
            )}
          </p>
        </div>
        {/* Own-team +G chip. Mirrors the opponent +G on the right
            side and AFL GameHeader's onTeam("goal") chip. Tap
            opens a player picker (parent owns UI) so the coach can
            attribute the goal without first hunting for the GS/GA
            tile on the court. Steve 2026-05-16. */}
        {onTeamGoal && (
          <div className="relative flex">
            {teamGhost && (
              <span key={teamGhost.key} aria-hidden className={`${SCORE_GHOST} left-3`}>
                {teamGhost.text}
              </span>
            )}
            <button
              type="button"
              onClick={onTeamGoal}
              onPointerDown={tapDown}
              disabled={isPending}
              className={`${SCORE_CHIP} w-12`}
              aria-label={`Add goal, ${teamName}`}
            >
              +G
            </button>
          </div>
        )}
      </div>

      {/* Centre: dark clock pill. Tappable when onClockTap is wired
          (live play only) so the coach can pause/resume. When
          paused, the pill picks up a brand-tinted ring + a small
          ▶ glyph in the top corner so the state's unmistakable.
          suppressHydrationWarning on the countdown text because the
          parent's clockMs state is updated by an interval tick after
          hydration; React 18 occasionally flags the first post-mount
          setState as a hydration diff if the tick lands inside the
          hydration commit. */}
      {(() => {
        const inner = (
          <>
            <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase leading-3 tracking-micro text-warm/[0.72]">
              {/* Running: the mint live dot, as AFL's pill. Paused keeps
                  its ▶ badge + ring below. */}
              {onClockTap && !paused && (
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-mint" />
              )}
              <span>{quarterLabel}</span>
            </span>
            <span
              className="nums mt-1 font-mono text-[28px] font-bold leading-7 tracking-[-0.03em] tabular-nums text-warm"
              suppressHydrationWarning
            >
              {clockText}
            </span>
          </>
        );
        const baseClass =
          "relative flex min-w-[104px] flex-col items-center justify-center rounded-md bg-ink px-4 pb-2.5 pt-2 text-warm shadow-[0_6px_16px_rgba(26,30,26,0.18)]";
        const pill = !onClockTap ? (
          <div className={baseClass}>{inner}</div>
        ) : (
          <button
            type="button"
            onClick={onClockTap}
            aria-label={clockLabel}
            className={`${baseClass} transition-shadow hover:bg-ink/90 ${
              paused ? "ring-2 ring-brand-500" : ""
            }`}
          >
            {/* ▶ glyph top-left when paused — tap to resume. */}
            {paused && (
              <span className="pointer-events-none absolute -left-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[8px] font-bold leading-none text-warm shadow-card">
                ▶
              </span>
            )}
            {inner}
          </button>
        );
        // Wrap in SirenPulseHalo so the clock pill briefly halos
        // when a sirenic moment fires (quarter-end hooter, game
        // finalised). When clockPulseKey is null (every render
        // before the first hooter), the halo renders inert.
        // The flex-col wrapper is so the new "Q-by-Q" chip sits
        // immediately below the pill (mirrors AFL GameHeader's
        // arrangement).
        return (
          <div className="flex flex-col items-center">
            <SirenPulseHalo triggerKey={clockPulseKey} size="md" className="rounded-md">
              {pill}
            </SirenPulseHalo>
            {/* 44pt text button (the old bordered 9px pill was ~20px). */}
            {onShowQuarterScores && (
              <button
                type="button"
                onClick={onShowQuarterScores}
                className="min-h-[44px] px-3 font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
                aria-label="Show quarter-by-quarter scores"
              >
                Q-by-Q
              </button>
            )}
          </div>
        );
      })()}

      {/* Right: opponent — mirror layout */}
      <div className="flex min-w-0 flex-col items-end gap-2 text-right">
        <div className="min-w-0 max-w-full">
          <p data-testid="scorebug-team-name" className={SCORE_TEAM_NAME}>
            {opponentName}
          </p>
          <p className="nums mt-1 font-mono tabular-nums text-ink">
            {showScores ? (
              <RollingNumber
                value={opponent.goals}
                className="text-[44px] font-bold leading-10 tracking-[-0.04em]"
              />
            ) : (
              <span className="text-[44px] font-bold leading-10 tracking-[-0.04em]">—</span>
            )}
          </p>
        </div>
        {onOpponentGoal && (
          <div className="relative flex justify-end">
            {oppGhost && (
              <span key={oppGhost.key} aria-hidden className={`${SCORE_GHOST} right-3`}>
                {oppGhost.text}
              </span>
            )}
            <button
              type="button"
              onClick={onOpponentGoal}
              onPointerDown={tapDown}
              disabled={isPending}
              className={`${SCORE_CHIP} w-12`}
              aria-label={`Add goal, ${opponentName}`}
            >
              +G
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const ss = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

// ─── applyLocks ─────────────────────────────────────────────
// Pre-applies a lock map to a lineup before passing to the next-quarter
// lineup picker. For each (positionId, playerId) lock:
//   1. Remove the player from any other position they currently occupy.
//   2. Bump whoever currently holds positionId out to the bench.
//   3. Place the locked player at positionId.
// Soft lock: the picker shows this as the starting state, coach can
// still rearrange.
function applyLocks(
  base: GenericLineup,
  locks: Record<string, string>,
  positionIds: readonly string[],
): GenericLineup {
  if (Object.keys(locks).length === 0) return base;
  const next: GenericLineup = {
    positions: {},
    bench: [...base.bench],
  };
  for (const id of positionIds) {
    next.positions[id] = [...(base.positions[id] ?? [])];
  }
  for (const [posId, playerId] of Object.entries(locks)) {
    // 1. Remove the locked player from any other position.
    for (const id of Object.keys(next.positions)) {
      if (id !== posId) {
        next.positions[id] = next.positions[id].filter((p) => p !== playerId);
      }
    }
    next.bench = next.bench.filter((p) => p !== playerId);
    // 2. Bench the existing occupant of the target position (if any).
    const displaced = next.positions[posId] ?? [];
    for (const p of displaced) {
      if (p !== playerId && !next.bench.includes(p)) next.bench.push(p);
    }
    // 3. Place the locked player.
    next.positions[posId] = [playerId];
  }
  return next;
}
