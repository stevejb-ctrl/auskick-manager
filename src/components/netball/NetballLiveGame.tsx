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

import { SFButton } from "@/components/sf";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import type { Game, GameEvent, LiveAuth, Player } from "@/lib/types";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { PulsingNumber } from "@/components/live/PulsingNumber";
import { Court } from "@/components/netball/Court";
import { PositionToken } from "@/components/netball/PositionToken";
import { NetballBenchStrip } from "@/components/netball/NetballBenchStrip";
import { NetballLineupPicker } from "@/components/netball/LineupPicker";
import { NetballPlayerActions } from "@/components/netball/NetballPlayerActions";
import { NetballQuarterBreak } from "@/components/netball/NetballQuarterBreak";
import { NetballGameSummaryCard } from "@/components/netball/NetballGameSummaryCard";
import { PickReplacementSheet } from "@/components/netball/PickReplacementSheet";
import { LongPressHint } from "@/components/live/LongPressHint";
import { LiveAdminUtilityRow } from "@/components/live/LiveAdminUtilityRow";
import { ScoreRecordingDock } from "@/components/live/ScoreRecordingDock";
import { LiveStickyScoreBar } from "@/components/live/LiveStickyScoreBar";
import { hapticTap, hapticSiren } from "@/lib/haptics";
import { QuarterScoreModal } from "@/components/live/QuarterScoreModal";
import { buildNetballWalkthroughSteps } from "@/components/netball/netballWalkthroughSteps";

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
import { PulseDot } from "@/components/ui/PulseDot";
import { netballSport, primaryThirdFor } from "@/lib/sports/netball";
import type { AgeGroupConfig } from "@/lib/sports/types";
import {
  type GenericLineup,
  type InProgressSegment,
  type PlayerThirdMs,
  emptyGenericLineup,
  gamePositionCounts,
  playerThirdMs,
  seasonPositionCounts,
} from "@/lib/sports/netball/fairness";
import { computeNetballClockMs } from "@/lib/sports/netball/clock";
import {
  saveNetballLineupDraft,
  startNetballGame,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/netball-actions";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import { Button } from "@/components/ui/Button";
import { LiveTopBar } from "@/components/live/LiveTopBar";

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
   * Suppress the first-visit walkthrough auto-open. Used by the
   * runner-token page when it ALSO renders an availability section
   * above this component — without this, the welcome modal opens
   * at z-50 fixed inset-0 and silently swallows clicks meant for
   * the availability buttons underneath. Default behaviour
   * (auto-open on first visit) is unchanged when omitted. The "?"
   * button stays as a manual trigger.
   */
  suppressAutoWalkthrough?: boolean;
  /**
   * True when the current user has admin role on this team. Drives
   * the "Restart game" affordance — folded into the same row as
   * "+ Add late arrival" at the bottom of the live court so the
   * two destructive/utility actions share one strip of scrolling
   * real estate (Steve 2026-05-13). Mirrors LiveGame.tsx.
   */
  isAdmin?: boolean;
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
    suppressAutoWalkthrough = false,
    isAdmin = false,
    initialDraft = null,
  } = props;

  const [isPending, startTransition] = useTransition();
  // Phase 5: router.refresh() after server-action success so the live
  // page re-fetches game_events and rerenders into the new branch
  // (Q-break / Q4-finalise / next-quarter live state) without a manual
  // reload. Pairs with revalidatePath calls in netball-actions.ts.
  // (Phase 4 deferred items #1 + #2 / 04-EVIDENCE.md §5.)
  const router = useRouter();

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
  // freeze invariant is unit-testable (src/lib/sports/netball/clock.ts).
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
  const clockMs = computeNetballClockMs({
    currentQuarter,
    quarterEnded,
    finalised,
    quarterStartedAtMs,
    pausedAtMs,
    accumulatedPauseMs,
    fallbackElapsedMs: _quarterElapsedMs,
    clockMultiplier,
    nowMs: Date.now(),
  });
  const isPaused = pausedAtMs !== null;
  const handleClockTap = useCallback(() => {
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
  const manualEndFiredRef = useRef(false);
  function handleManualEndQuarter() {
    if (manualEndFiredRef.current) return;
    manualEndFiredRef.current = true;
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
    // computeNetballClockMs(...) returns the live `Date.now()` delta
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
    return set;
  }, [thisGameEvents]);
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
    return set;
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
    const undoneTargets = new Set<string>();
    for (const ev of thisGameEvents) {
      if (ev.type !== "score_undo") continue;
      const target = (ev.metadata as { target_event_id?: string } | null)
        ?.target_event_id;
      if (target) undoneTargets.add(target);
    }
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
  const [nextBreakLocks, setNextBreakLocks] = useState<Record<string, string>>({});
  // Mid-quarter substitution overlay. Coach injuries a court player and
  // picks a bench replacement; the change is reflected here client-side
  // until the next quarter break makes it durable via period_break_swap.
  // Refreshing the page mid-quarter loses the overlay (the replayed
  // lineup_set / period_break_swap events are the authoritative state).
  // Coach can re-do the sub if that happens.
  const [localOverlay, setLocalOverlay] = useState<GenericLineup | null>(null);
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
    inPlayerId: string;
    atMs: number;
  };
  const [midQuarterSubs, setMidQuarterSubs] = useState<MidQuarterSub[]>([]);
  useEffect(() => {
    setMidQuarterSubs([]);
  }, [currentQuarter]);
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
  // Pick-replacement target: set after marking a court player as
  // injured OR lent to opposition. Either reason vacates the slot and
  // prompts the coach to pick a bench player to fill it for the rest
  // of the quarter; the post-sub state lives in localOverlay until the
  // next period_break_swap makes it durable.
  const [replacingTarget, setReplacingTarget] = useState<{
    positionId: string;
    /**
     * The player vacating the slot, or null when the coach is filling
     * a previously-emptied slot (e.g. after a lend without an
     * immediate replacement). The picker title flips from
     * "Replace X → POS" to "Fill POS" when null, and the segment-
     * rebuilder skips the bench-add for the sub since there's no
     * sub-out player to bench.
     */
    vacatingPlayerId: string | null;
  } | null>(null);
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
    setLastScore(null);
    setUndoToastVisible(false);
    if (undoToastTimerRef.current !== null) {
      clearTimeout(undoToastTimerRef.current);
      undoToastTimerRef.current = null;
    }
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
  const onCourt = localOverlay ?? initialLineup ?? emptyGenericLineup(ageGroup.positions);

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
  const playerStats = useMemo(() => {
    // Use segments any time the trailing quarter is "still open" from
    // a client-state POV — that's LIVE play AND the Q-break window
    // BEFORE period_break_swap is confirmed. Once confirmed, the
    // post-sub lineup is durable in events and we can fall back to
    // the event-only path. This catches the Q-break case where the
    // injured player would otherwise get credited the full quarter
    // and their substitute would show 0:00.
    const isQuarterOpen = !finalised && currentQuarter > 0;
    if (!isQuarterOpen) {
      return playerThirdMs(
        thisGameEvents,
        null,
        quarterLengthSeconds,
        primaryThirdFor as (positionId: string) => "attack-third" | "centre-third" | "defence-third" | null,
      );
    }
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
    const segments: InProgressSegment[] = [];
    let current = startLineup;
    let prevMs = 0;
    for (const sub of midQuarterSubs) {
      const dur = Math.max(0, Math.min(sub.atMs, totalElapsed) - prevMs);
      if (dur > 0) segments.push({ lineup: current, durationMs: dur });
      // Apply the sub: outPlayer leaves position, inPlayer takes it.
      // outPlayerId may be null when the slot was already empty
      // (coach lent a player + cancelled the picker, then later
      // tapped the empty token to fill it). In that case there's
      // nobody to filter out of the position list and nobody to
      // bench — just plug the inPlayer in.
      const next: GenericLineup = {
        positions: { ...current.positions },
        bench: current.bench.filter((id) => id !== sub.inPlayerId),
      };
      next.positions[sub.positionId] = (next.positions[sub.positionId] ?? [])
        .filter((id) => sub.outPlayerId == null || id !== sub.outPlayerId)
        .concat([sub.inPlayerId]);
      if (sub.outPlayerId != null && !next.bench.includes(sub.outPlayerId)) {
        next.bench = [...next.bench, sub.outPlayerId];
      }
      current = next;
      prevMs = Math.min(sub.atMs, totalElapsed);
    }
    const finalDur = Math.max(0, totalElapsed - prevMs);
    if (finalDur > 0) segments.push({ lineup: current, durationMs: finalDur });
    return playerThirdMs(
      thisGameEvents,
      null,
      quarterLengthSeconds,
      primaryThirdFor as (positionId: string) => "attack-third" | "centre-third" | "defence-third" | null,
      { segments },
    );
  }, [
    thisGameEvents,
    clockMs,
    quarterEnded,
    finalised,
    currentQuarter,
    quarterLengthSeconds,
    quarterLengthMs,
    initialLineup,
    midQuarterSubs,
  ]);

  // ─── Action handlers ───────────────────────────────────────
  // tap on a GS/GA token → open the confirm sheet (mirrors AFL's
  // score sheet, prevents accidental scoring). The goal only records
  // after the coach confirms via handleConfirmGoal.
  // tap on any other token → no-op (long-press still works).
  const handleTokenTap = (positionId: string, playerId: string | null) => {
    if (currentQuarter < 1 || quarterEnded || finalised) return;
    if (!playerId) {
      // Empty slot — common after a lend without immediate
      // replacement (or any time the coach cancelled the picker).
      // Tapping the empty token re-opens the replacement sheet so
      // they can fill the slot at any point during the quarter
      // instead of being stuck with a hole in the lineup until the
      // break. vacatingPlayerId stays null because there's no one
      // to vacate.
      setReplacingTarget({ positionId, vacatingPlayerId: null });
      return;
    }
    if (!SCORING_POSITIONS.has(positionId)) return;
    // NETBALL-04: scoring affordance gated on track_scoring. The tap
    // becomes a no-op when the team isn't tracking scores; long-press
    // (handleTokenLongPress) is unaffected so coaches can still open
    // the actions modal on GS/GA tokens.
    if (!trackScoring) return;
    setPendingGoal({ playerId, positionId });
  };

  const handleConfirmGoal = () => {
    if (!pendingGoal) return;
    const { playerId } = pendingGoal;
    const player = squadById.get(playerId);
    const playerName =
      player?.full_name.trim().split(/\s+/)[0] ?? null;
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
  };

  const handleCancelGoal = () => setPendingGoal(null);

  const handleOpponentGoal = useCallback(() => {
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

  // Generic helper used by injury + loan flows. Pops the player out of
  // their court position in the local overlay (so the picker sees a
  // vacant slot) and opens the Pick Replacement sheet. Bench targets
  // skip both: there's no slot to vacate.
  const vacateAndPromptReplacement = (playerId: string, positionId: string | null) => {
    if (!positionId) return;
    setLocalOverlay((prev) => {
      const base = prev ?? initialLineup ?? emptyGenericLineup(ageGroup.positions);
      const next: GenericLineup = {
        positions: { ...base.positions },
        bench: [...base.bench],
      };
      next.positions[positionId] = (next.positions[positionId] ?? []).filter(
        (id) => id !== playerId,
      );
      return next;
    });
    setReplacingTarget({ positionId, vacatingPlayerId: playerId });
  };

  // Mark injured: write the audit-trail event, flag the player client-side,
  // then auto-prompt the bench replacement sheet so the coach can plug
  // the gap in two taps. Substitution itself is local-overlay only until
  // the next quarter break makes it durable.
  // Mark/un-mark handlers below: they no longer optimistically mutate
  // local injuredIds / loanedIds state — the badges + greying are
  // derived from events, and Next.js Server Actions auto-refresh the
  // RSC payload after they complete, so the prop update lands in the
  // next render. That's a few hundred ms of latency before the INJ/
  // LENT badge appears, but the localOverlay vacate fires synchronously
  // so the slot empties immediately and the replacement picker opens
  // straight away — the user gets the affordance they care about.
  const handleMarkInjured = () => {
    if (!actionsTarget) return;
    const { playerId, positionId } = actionsTarget;
    // Close the actions modal FIRST so it can't accidentally trap a
    // subsequent long-press behind a stale state transition.
    closeActions();
    enqueueLiveAction("markInjury", [
      auth,
      game.id,
      {
        player_id: playerId,
        injured: true,
        quarter: Math.max(1, currentQuarter),
        elapsed_ms: clockMs,
      },
    ]);
    vacateAndPromptReplacement(playerId, positionId);
  };

  const handleUnInjury = () => {
    if (!actionsTarget) return;
    const { playerId } = actionsTarget;
    closeActions();
    enqueueLiveAction("markInjury", [
      auth,
      game.id,
      {
        player_id: playerId,
        injured: false,
        quarter: Math.max(1, currentQuarter),
        elapsed_ms: clockMs,
      },
    ]);
  };

  const handleMarkLoaned = () => {
    if (!actionsTarget) return;
    const { playerId, positionId } = actionsTarget;
    // Close the actions modal FIRST — same reason as injury: don't let
    // a still-rendering modal block the next long-press attempt.
    closeActions();
    enqueueLiveAction("markLoan", [
      auth,
      game.id,
      {
        player_id: playerId,
        loaned: true,
        quarter: Math.max(1, currentQuarter),
        elapsed_ms: clockMs,
      },
    ]);
    // Loan = same UX as injury. The lent player vacates their slot and
    // the coach picks a bench replacement to play out the rest of the
    // quarter; otherwise the team is stuck playing a player short until
    // the next break.
    vacateAndPromptReplacement(playerId, positionId);
  };

  const handleUnLoan = () => {
    if (!actionsTarget) return;
    const { playerId } = actionsTarget;
    closeActions();
    enqueueLiveAction("markLoan", [
      auth,
      game.id,
      {
        player_id: playerId,
        loaned: false,
        quarter: Math.max(1, currentQuarter),
        elapsed_ms: clockMs,
      },
    ]);
  };

  const handleLockForNextBreak = () => {
    if (!actionsTarget?.positionId) return;
    const { playerId, positionId } = actionsTarget;
    closeActions();
    setNextBreakLocks((prev) => ({ ...prev, [positionId]: playerId }));
  };

  const handleUnlock = () => {
    if (!actionsTarget?.positionId) return;
    const { positionId } = actionsTarget;
    closeActions();
    setNextBreakLocks((prev) => {
      const next = { ...prev };
      delete next[positionId];
      return next;
    });
  };

  // Pick-replacement: drop the picked bench player into the vacated
  // position in the local overlay AND record the substitution
  // timestamp so per-player time accounting can split credit
  // accurately. Substitution becomes durable when the next quarter
  // break confirms via period_break_swap.
  const handlePickReplacement = (replacementId: string) => {
    if (!replacingTarget) return;
    // The brand halo fires automatically on the new tile —
    // setMidQuarterSubs below grows the array, positionPulseKeys
    // useMemo re-derives, and the matching PositionToken gets a
    // fresh pulseKey on its next render. No extra trigger
    // needed here.
    const { positionId, vacatingPlayerId } = replacingTarget;
    setLocalOverlay((prev) => {
      const base = prev ?? initialLineup ?? emptyGenericLineup(ageGroup.positions);
      const next: GenericLineup = {
        positions: { ...base.positions },
        bench: base.bench.filter((id) => id !== replacementId),
      };
      next.positions[positionId] = [replacementId];
      return next;
    });
    setMidQuarterSubs((prev) => [
      ...prev,
      {
        positionId,
        outPlayerId: vacatingPlayerId,
        inPlayerId: replacementId,
        atMs: clockMs,
      },
    ]);
    setReplacingTarget(null);
    // Light haptic — mid-quarter sub is a registered tap moment,
    // same as a goal. Mirrors AFL's "swap-applied" haptic that
    // landed in the haptics-primitive PR (d5c9518).
    void hapticTap("light");
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

  // Build replacement candidates: active squad − on-court − injured − loaned.
  const replacementCandidates = useMemo<Player[]>(() => {
    if (!replacingTarget) return [];
    const onCourtIds = new Set<string>();
    for (const ids of Object.values(onCourt.positions)) {
      for (const id of ids) onCourtIds.add(id);
    }
    // The candidate pool is the same "who's actually here today" set
    // the bench strip uses: availableIds (server-confirmed) plus the
    // optimistic lateArrivedIds (covers the brief window between a
    // late-arrival tap and the action's auto-revalidation). Anyone
    // marked unavailable for the day shouldn't be offered — they
    // physically aren't at the game.
    const availableSet = new Set<string>(availableIds);
    lateArrivedIds.forEach((id) => availableSet.add(id));
    return squad.filter(
      (p) =>
        availableSet.has(p.id) &&
        !onCourtIds.has(p.id) &&
        !injuredIds.has(p.id) &&
        !loanedIds.has(p.id),
    );
  }, [replacingTarget, onCourt, squad, availableIds, lateArrivedIds, injuredIds, loanedIds]);

  // ─── Walkthrough state ──────────────────────────────────────
  // Mirrors AFL's first-visit walkthrough at
  // src/components/live/LiveGame.tsx:299. localStorage key is
  // sport-specific (`nb-walkthrough-seen`) so a coach who's seen
  // the AFL walkthrough still gets the netball one on their first
  // netball game — different mechanics, different copy.
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [walkthroughSkipWelcome, setWalkthroughSkipWelcome] = useState(false);
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
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("nb-walkthrough-seen")) return;
    // Caller can suppress auto-open. Used by the runner-token page
    // when it ALSO renders an availability section above this
    // component — without it the welcome modal opens at z-50 fixed
    // inset-0 and swallows clicks meant for the availability
    // buttons. Coaches on the team-auth live page still see the
    // walkthrough (default). The "?" button is the manual trigger.
    if (suppressAutoWalkthrough) return;
    setWalkthroughOpen(true);
  }, [suppressAutoWalkthrough]);
  function handleWalkthroughClose() {
    if (typeof window !== "undefined") {
      localStorage.setItem("nb-walkthrough-seen", "1");
    }
    setWalkthroughOpen(false);
    setWalkthroughSkipWelcome(false);
  }
  function handleOpenWalkthrough() {
    setWalkthroughSkipWelcome(true);
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
    <LiveTopBar exitHref={exitHref} game={game} onHelp={handleOpenWalkthrough} />
  );
  const walkthroughOverlay = walkthroughOpen ? (
    <WalkthroughModal
      steps={walkthroughSteps}
      skipWelcome={walkthroughSkipWelcome}
      onClose={handleWalkthroughClose}
    />
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
          ageGroup={ageGroup}
          squad={squad}
          availableIds={availableIds}
          initialLineup={initialDraft?.lineup ?? null}
          thisGameEvents={thisGameEvents}
          seasonEvents={seasonEvents}
          defaultQuarterSeconds={quarterLengthSeconds}
          // "Back to availability" breadcrumb — only meaningful for
          // the team-auth path (game detail page exists). Token-auth
          // (share runner) doesn't have a netball flow yet, so the
          // link is hidden in that case.
          backHref={
            auth.kind === "team"
              ? `/teams/${auth.teamId}/games/${game.id}`
              : undefined
          }
          onConfirm={async (lineup, quarterOverrideSeconds) =>
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
                await startNetballGame(
                  auth,
                  game.id,
                  lineup,
                  ageGroup.defaultOnFieldSize,
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
          confirmLabel="Ready for Q1"
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
            sticky "Finish game" CTA below. */}
        <NetballGameSummaryCard
          teamName={teamName}
          opponentName={game.opponent}
          teamScore={teamScore}
          opponentScore={opponentScore}
          playerGoals={playerGoals}
          playerStats={playerStats}
          squad={squad}
          trackScoring={trackScoring}
        />
        {/* Sticky-bottom "Finish game" CTA — locks to the viewport
            so the user has a big, unmissable exit. Team-auth coach
            goes to /dashboard. Token-auth parent-runner gets a
            "you can close this tab" success card instead — they
            don't have a /dashboard, sending them there hits the
            login wall (Steve 2026-05-13 usability test, Lisa B3).
            Mirrors the AFL LiveGame finalised flow. */}
        {auth.kind === "team" && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(26,30,26,0.04)] sm:px-7 sm:pt-4">
            <div className="mx-auto max-w-4xl">
              <SFButton href="/dashboard" variant="accent" size="lg" full>
                Finish game
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
              <p className="mt-0.5 text-xs text-ink-mute">
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
  if (quarterEnded && currentQuarter >= 4) {
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
  if (quarterEnded && currentQuarter < 4) {
    return (
      <div className="flex flex-col gap-4 pb-4">
        {topUtilityRow}
        {walkthroughOverlay}
        <NetballScoreBug
          teamName={teamName}
          opponentName={game.opponent}
          team={teamScore}
          opponent={opponentScore}
          quarterLabel={`Q${currentQuarter} BRK`}
          clockText="—"
          showScores={trackScoring}
          clockPulseKey={clockPulseKey}
        />
        <NetballQuarterBreak
          auth={auth}
          gameId={game.id}
          squad={squad}
          availableIds={availableIds}
          ageGroup={ageGroup}
          currentQuarter={currentQuarter}
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
          trackScoring={trackScoring}
          onStarted={() => {
            // Local overlay is durable now via the period_break_swap
            // event the component just wrote.
            setLocalOverlay(null);
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
            // (closeActions / setReplacingTarget(null) on the success
            // paths usually handle this; this is the safety net.)
            setActionsTarget(null);
            setReplacingTarget(null);
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
  if (quarterEnded && currentQuarter >= 4) {
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
          {isPending ? "Finalising…" : "Finalise game"}
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
      team={teamScore}
      opponent={opponentScore}
      quarterLabel={isPaused ? "PAUSE" : `Q${currentQuarter}`}
      clockText={formatClock(remainingMs)}
      isPending={isPending}
      // NETBALL-04: pass undefined when scoring isn't tracked so
      // NetballScoreBug's existing `{onOpponentGoal && (...)}` gate
      // hides the +G affordance (no opponent-goal button visible).
      onOpponentGoal={trackScoring ? handleOpponentGoal : undefined}
      onClockTap={handleClockTap}
      // Q-by-Q chip surfaces only when there's something to show.
      // trackScoring=false hides it entirely (would be empty).
      onShowQuarterScores={
        trackScoring ? () => setQuarterScoresOpen(true) : undefined
      }
      // Surface "End Q early" only when the coach paused at the
      // start of a quarter and forgot to resume — the chip
      // self-gates on `paused` inside NetballScoreBug, so passing
      // it here unconditionally is fine.
      onEndQuarterEarly={() => setShowManualEndConfirm(true)}
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
        playerGoals={playerGoals}
        positionPulseKeys={positionPulseKeys}
        wakeUpKey={courtWakeUpKey}
      />

      <NetballBenchStrip
        entries={offCourt}
        playerStats={playerStats}
        playerGoals={playerGoals}
        onTileLongPress={(pid) => handleTokenLongPress(null, pid)}
      />

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
      />

      <p className="text-center text-xs text-ink-mute">
        {trackScoring
          ? "Tap GS or GA to score (with confirm). Long-press any player for actions. The quarter ends automatically when the clock reaches zero."
          : "Long-press any player for actions. The quarter ends automatically when the clock reaches zero."}
      </p>

      {/* Action modal — opens on long-press of any token. */}
      {actionsTarget && actionsPlayer && (
        <NetballPlayerActions
          player={actionsPlayer}
          positionId={actionsTarget.positionId}
          isInjured={injuredIds.has(actionsTarget.playerId)}
          isLoaned={loanedIds.has(actionsTarget.playerId)}
          isLockedForNextBreak={
            actionsTarget.positionId
              ? nextBreakLocks[actionsTarget.positionId] === actionsTarget.playerId
              : false
          }
          onMarkInjured={handleMarkInjured}
          onUnInjury={handleUnInjury}
          onMarkLoaned={handleMarkLoaned}
          onUnLoan={handleUnLoan}
          onLockForNextBreak={handleLockForNextBreak}
          onUnlock={handleUnlock}
          onSwitch={() => {
            // Switch = mid-quarter sub: vacate this player's
            // position and surface the Pick Replacement sheet so the
            // GM can sub a bench player in. Field-only path —
            // NetballPlayerActions hides the Switch button when
            // positionId is null. Reuses the same vacateAndPrompt
            // flow that injury/loan use, minus the injury/loan
            // event itself.
            if (!actionsTarget?.positionId) return;
            const { playerId, positionId } = actionsTarget;
            closeActions();
            vacateAndPromptReplacement(playerId, positionId);
          }}
          onClose={closeActions}
        />
      )}

      {/* Replace sheet — opens after Mark Injured OR Lend to Opposition
          for a court player, AND when the coach taps an empty position
          token (vacatingPlayerId === null) to fill a slot left vacant
          earlier in the quarter. Shared UX so the coach picks a bench
          player to fill the vacant slot in two taps. */}
      {replacingTarget && (
        <PickReplacementSheet
          positionId={replacingTarget.positionId}
          vacatingPlayerName={
            replacingTarget.vacatingPlayerId
              ? squadById.get(replacingTarget.vacatingPlayerId)?.full_name ?? "Player"
              : null
          }
          candidates={replacementCandidates}
          onPick={handlePickReplacement}
          onCancel={() => setReplacingTarget(null)}
        />
      )}

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
        undoStrip={
          trackScoring && lastScore ? (
            <div
              className={`mx-4 mb-1 flex items-center justify-between rounded-sm px-3 py-1.5 transition-colors ${
                undoToastVisible ? "bg-ink text-warm" : "bg-surface-alt"
              }`}
              role="status"
              aria-live="polite"
            >
              <span
                className={`text-xs ${
                  undoToastVisible ? "text-warm/80" : "text-ink-dim"
                }`}
              >
                {undoToastVisible
                  ? `${
                      lastScore.kind === "team" ? teamName : game.opponent
                    } goal${lastScore.playerName ? ` — ${lastScore.playerName}` : ""}`
                  : "Undo last score"}
              </span>
              <button
                type="button"
                onClick={handleUndoLastScore}
                disabled={isPending}
                className={`font-mono text-xs font-bold uppercase tracking-micro transition-colors disabled:opacity-60 ${
                  undoToastVisible
                    ? "text-warn hover:text-warn/80"
                    : "text-brand-700 hover:text-brand-600"
                }`}
              >
                Undo
              </button>
            </div>
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
      <LongPressHint enabled />
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
  onOpponentGoal,
  isPending,
  onClockTap,
  onShowQuarterScores,
  onEndQuarterEarly,
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
  onEndQuarterEarly?: () => void;
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
  return (
    <div
      className={`grid grid-cols-[1fr_auto_1fr] items-start gap-2 px-4 py-3 ${
        flat ? "" : "rounded-md bg-surface shadow-card"
      }`}
    >
      {/* Left: home team */}
      <div className="min-w-0">
        <p className="truncate font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
          {teamName}
        </p>
        <p className="nums mt-0.5 flex items-baseline gap-1.5 font-mono leading-none text-ink">
          {/* Pre-Q1 the scoreboard renders "—" instead of zero so a
              freshly-mounted game doesn't look like it's already
              0-0 (visually identical to a finished 0-0 result).
              Once Q1 starts (showScores=true), PulsingNumber takes
              over and counts up + halos on each goal. P0-6 from
              MICRO-INTERACTIONS-PLAN.md. */}
          {showScores ? (
            <PulsingNumber
              value={team.goals}
              className="text-[36px] font-bold tracking-tightest"
            />
          ) : (
            <span className="text-[36px] font-bold tracking-tightest">—</span>
          )}
        </p>
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
            <span className="font-mono text-[10px] font-bold uppercase leading-none tracking-micro text-warm/70">
              {quarterLabel}
            </span>
            <span
              className="nums mt-0.5 font-mono text-[22px] font-bold leading-none tracking-tightest text-warm"
              suppressHydrationWarning
            >
              {clockText}
            </span>
          </>
        );
        const baseClass =
          "relative self-center flex flex-col items-center justify-center rounded-md bg-ink px-3 py-1.5 text-warm shadow-pop";
        const pill = !onClockTap ? (
          <div className={baseClass}>{inner}</div>
        ) : (
          <button
            type="button"
            onClick={onClockTap}
            aria-label={paused ? "Resume clock" : "Pause clock"}
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
          <div className="flex flex-col items-center gap-1 self-center">
            <SirenPulseHalo triggerKey={clockPulseKey} size="md" className="rounded-md">
              {pill}
            </SirenPulseHalo>
            {onShowQuarterScores && (
              <button
                type="button"
                onClick={onShowQuarterScores}
                className="rounded-full border border-hairline bg-surface px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-micro text-ink-dim transition-colors duration-fast ease-out-quart hover:border-ink-dim hover:bg-surface-alt hover:text-ink"
                aria-label="Show quarter-by-quarter scores"
              >
                Q-by-Q
              </button>
            )}
            {/* End-Q-early — paused-only "rescue" affordance.
                Mirrors AFL's GameHeader behaviour. Coach paused
                at the start of the quarter, forgot to resume,
                game played on; this is how they recover. */}
            {onEndQuarterEarly && paused && (
              <button
                type="button"
                onClick={onEndQuarterEarly}
                className="rounded-full border border-warn/40 bg-warn-soft px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-micro text-warn transition-colors duration-fast ease-out-quart hover:border-warn hover:bg-warn/15"
                aria-label="End the current quarter now"
              >
                End Q early
              </button>
            )}
          </div>
        );
      })()}

      {/* Right: opponent — mirror layout */}
      <div className="min-w-0 text-right">
        <p className="truncate font-mono text-[10px] font-bold uppercase tracking-micro text-ink-dim">
          {opponentName}
        </p>
        <p className="nums mt-0.5 flex items-baseline justify-end gap-1.5 font-mono leading-none text-ink">
          {showScores ? (
            <PulsingNumber
              value={opponent.goals}
              className="text-[36px] font-bold tracking-tightest"
            />
          ) : (
            <span className="text-[36px] font-bold tracking-tightest">—</span>
          )}
        </p>
        {onOpponentGoal && (
          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={onOpponentGoal}
              disabled={isPending}
              // active:bg-brand-200 mirrors the AFL GameHeader SCORE_CHIP
              // treatment (PR 2 of micro-interactions rollout, 2026-05-14)
              // — pointer-down flashes brand-coloured to confirm the tap
              // before the player picker mounts.
              className="rounded-md bg-surface-alt px-3 py-2 font-mono text-sm font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:bg-hairline hover:text-ink active:bg-brand-200 active:text-brand-700 disabled:pointer-events-none disabled:opacity-60"
              aria-label="Record opponent goal"
            >
              +G
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Read-only court rendering ───────────────────────────────
// Tokens stack vertically within each third (top → bottom reads
// GS, GA, WA, C, WD, GD, GK after item 3's WA/WD-to-centre move) and
// are subtly staggered left/right of centre for visual rhythm.
function CourtDisplay({
  lineup,
  ageGroup,
  squadById,
  disabled,
  onTokenTap,
  onTokenLongPress,
  scoringPositionIds,
  injuredIds,
  loanedIds,
  nextBreakLocks,
  playerStats,
  playerGoals,
  positionPulseKeys,
  wakeUpKey,
}: {
  lineup: GenericLineup;
  ageGroup: AgeGroupConfig;
  squadById: Map<string, Player>;
  disabled?: boolean;
  /** Called with the playerId currently in the tapped position. */
  onTokenTap?: (positionId: string, playerId: string | null) => void;
  /** Called with the playerId for a long-press (≥500ms hold). */
  onTokenLongPress?: (positionId: string, playerId: string | null) => void;
  /**
   * Position ids that signal "tap me to score" (GS + GA in netball). Tokens
   * not in this set are still rendered but have no goal-affordance. The
   * actual handler still fires on tap regardless — this only drives
   * styling — so non-scoring positions can open the long-press menu via
   * the same component without confusing coaches into thinking everyone
   * shoots.
   */
  scoringPositionIds?: Set<string>;
  /** Players flagged as injured this game — drives INJ badge + greyscale. */
  injuredIds?: Set<string>;
  /** Players lent to opposition this game — drives LENT badge + greyscale. */
  loanedIds?: Set<string>;
  /** Position → playerId locks for the next quarter break — drives 🔒 badge. */
  nextBreakLocks?: Record<string, string>;
  /** Per-player {attack, centre, defence} ms — drives the stacked bar + total under each name. */
  playerStats?: Map<string, PlayerThirdMs>;
  /** Per-player goals scored this game — drives the dark chip in each token's top-right corner. */
  playerGoals?: Record<string, number>;
  /**
   * Per-position pulse keys — when a value is present for a
   * positionId, the token at that position halos with the brand
   * pulse on its next render. Driven by the parent's
   * midQuarterSubs state so each mid-quarter sub fires exactly
   * one halo on the position that just changed.
   */
  positionPulseKeys?: Record<string, string>;
  /**
   * Bumped by the parent on the pre-game → Q1 transition. Drives
   * Court's `wakeUpKey` — one-shot brand halo at kickoff. Null
   * (default) on Q-end / FT / read-only renders so the celebration
   * fires exactly once. Mirrors AFL Field.wakeUpKey (P1.5-5).
   */
  wakeUpKey?: number | null;
}) {
  const byThird = (third: "attack-third" | "centre-third" | "defence-third") =>
    ageGroup.positions.filter((id) => primaryThirdFor(id) === third);

  const renderThird = (positionIds: string[]) => (
    <>
      {positionIds.map((positionId) => {
        const pid = lineup.positions[positionId]?.[0] ?? null;
        const name = pid ? squadById.get(pid)?.full_name ?? null : null;
        const stats = pid ? playerStats?.get(pid) : undefined;
        const totalMs = stats
          ? stats.attack + stats.centre + stats.defence
          : undefined;
        return (
          <div
            key={positionId}
            className={`relative z-10 flex w-full ${alignClass(positionId)}`}
          >
            <PositionToken
              positionId={positionId}
              playerName={name}
              disabled={disabled}
              canScore={scoringPositionIds?.has(positionId) ?? false}
              injured={injuredIds?.has(pid ?? "") ?? false}
              loaned={loanedIds?.has(pid ?? "") ?? false}
              locked={
                pid != null && nextBreakLocks?.[positionId] === pid
              }
              stats={stats}
              totalMs={totalMs}
              goalCount={pid ? playerGoals?.[pid] : undefined}
              onTap={
                onTokenTap ? () => onTokenTap(positionId, pid) : undefined
              }
              onLongPress={
                onTokenLongPress
                  ? () => onTokenLongPress(positionId, pid)
                  : undefined
              }
              pulseKey={positionPulseKeys?.[positionId]}
            />
          </div>
        );
      })}
    </>
  );

  return (
    <Court
      attackThird={renderThird(byThird("attack-third"))}
      centreThird={renderThird(byThird("centre-third"))}
      defenceThird={renderThird(byThird("defence-third"))}
      wakeUpKey={wakeUpKey ?? null}
    />
  );
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const ss = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

// ─── alignClass ─────────────────────────────────────────────
// Position-keyed horizontal alignment within each band. Spreads tokens
// across the full width of the court rather than stacking them in a
// central column.
//
// Pure alternating zigzag down the court — left/right/left/right/left
// /right/left for GS, GA, WA, C, WD, GD, GK respectively. C sits dead
// centre between WA and WD as the genuine pivot. The zigzag keeps
// every adjacent pair on OPPOSITE sides, so GA/WA sit across from each
// other (instead of stacking on the same wing) and the same for WD/GD,
// matching real-court geography where GA defends from the opposite
// side to WA's attacking lane.
//
// AFL doesn't have an analogous concept (zones are spatial bands, not
// named positions), so this is netball-specific and lives here rather
// than in the shared sports config.
function alignClass(positionId: string): string {
  switch (positionId) {
    case "gs":
      return "justify-start pl-4";
    case "ga":
      return "justify-end pr-4";
    case "wa":
      return "justify-start pl-4";
    case "c":
      return "justify-center";
    case "wd":
      return "justify-end pr-4";
    case "gd":
      return "justify-start pl-4";
    case "gk":
      return "justify-end pr-4";
    default:
      return "justify-center";
  }
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
