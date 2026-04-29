"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  clockElapsedMs,
  useLiveGame,
} from "@/lib/stores/liveGameStore";
import {
  addLateArrival,
  endQuarter as endQuarterAction,
  markInjury,
  markLoan,
  recordBehind,
  recordGoal,
  recordOpponentScore,
  recordFieldZoneSwap,
  recordSwap,
  startQuarter,
  undoLastScore,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/live/Field";
import { Bench } from "@/components/live/Bench";
import { GameHeader } from "@/components/live/GameHeader";
import { SwapCard } from "@/components/live/SwapCard";
import { SwapConfirmDialog } from "@/components/live/SwapConfirmDialog";
import { QuarterBreak } from "@/components/live/QuarterBreak";
import { WalkthroughModal, buildWalkthroughSteps } from "@/components/live/WalkthroughModal";
import { LateArrivalMenu } from "@/components/live/LateArrivalMenu";
import { QuarterEndModal } from "@/components/live/QuarterEndModal";
import { StartQuarterModal } from "@/components/live/StartQuarterModal";
import { SubDueModal } from "@/components/live/SubDueModal";
import { LockModal } from "@/components/live/LockModal";
import {
  InjuryReplacementModal,
  type InjuryReplacementCandidate,
} from "@/components/live/InjuryReplacementModal";
import { GameSummaryCard } from "@/components/live/GameSummaryCard";
import {
  ALL_ZONES,
  emptyZoneMs,
  suggestSwaps,
  type GameState,
  type PlayerZoneMinutes,
  type ZoneCaps,
  type ZoneMinutes,
} from "@/lib/fairness";
import type { Player, PositionModel, Zone } from "@/lib/types";
import { positionsFor } from "@/lib/ageGroups";
import { isYouTubeUrl, youtubeVideoId } from "@/lib/songUrl";

// Minimal inline types for the YouTube IFrame API — no @types/youtube needed.
interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
}
declare global {
  interface Window {
    YT: { Player: new (el: string | HTMLElement, opts: object) => YTPlayer };
    onYouTubeIframeAPIReady: () => void;
  }
}

function playBeep() {
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.45);
    osc.onended = () => ctx.close();
  } catch {
    // ignore — some browsers block before user interaction
  }
}

interface LiveGameProps {
  auth: import("@/lib/types").LiveAuth;
  gameId: string;
  teamName: string;
  opponentName: string;
  trackScoring: boolean;
  subIntervalSeconds: number;
  squadPlayers: Player[];
  initialState: GameState;
  season: PlayerZoneMinutes;
  /**
   * Minutes each player has been lent to the opposition across the season
   * (completed games only). Shown in the long-press loan menu so the coach
   * can spread the favour evenly.
   */
  seasonLoanMinutes: Record<string, number>;
  zoneCaps: ZoneCaps;
  positionModel: PositionModel;
  exitHref?: string;
  /** Public URL of the team song audio file, if configured. */
  songUrl?: string | null;
  /** Seconds into the song to start playback from (default 0). */
  songStartSeconds?: number;
  /** How many seconds to play the song for after each goal (default 15). */
  songDurationSeconds?: number;
  /** Speed multiplier for demo games — scales stored elapsed_ms and sub/quarter timing (default 1). */
  clockMultiplier?: number;
  /** Effective quarter duration in milliseconds for this game/team/age-group.
   * Computed by parent via getEffectiveQuarterSeconds(team, ageGroup, game) * 1000.
   * D-26 / D-27: replaces hardcoded QUARTER_MS at the countdown cap and hooter trigger. */
  quarterMs: number;
}

type LastScore = {
  kind: "goal" | "behind";
  forTeam: "us" | "opponent";
  playerId: string | null;
  playerName: string | null;
  quarter: number;
};

export function LiveGame({
  auth,
  gameId,
  teamName,
  opponentName,
  trackScoring,
  subIntervalSeconds,
  squadPlayers,
  initialState,
  season,
  seasonLoanMinutes,
  zoneCaps,
  positionModel,
  exitHref,
  songUrl,
  songStartSeconds = 0,
  songDurationSeconds = 15,
  clockMultiplier = 1,
  quarterMs,
}: LiveGameProps) {
  const activeZones = useMemo(() => positionsFor(positionModel), [positionModel]);
  const init = useLiveGame((s) => s.init);
  const lineup = useLiveGame((s) => s.lineup);
  const selected = useLiveGame((s) => s.selected);
  const clockStartedAt = useLiveGame((s) => s.clockStartedAt);
  const accumulatedMs = useLiveGame((s) => s.accumulatedMs);
  const currentQuarter = useLiveGame((s) => s.currentQuarter);
  const quarterEnded = useLiveGame((s) => s.quarterEnded);
  const finalised = useLiveGame((s) => s.finalised);
  const selectField = useLiveGame((s) => s.selectField);
  const selectBench = useLiveGame((s) => s.selectBench);
  const clearSelection = useLiveGame((s) => s.clearSelection);
  const applySwap = useLiveGame((s) => s.applySwap);
  const applyInjurySwap = useLiveGame((s) => s.applyInjurySwap);
  const applyFieldZoneSwap = useLiveGame((s) => s.applyFieldZoneSwap);
  const addBenchPlayer = useLiveGame((s) => s.addBenchPlayer);
  const incTeam = useLiveGame((s) => s.incTeam);
  const incOpponent = useLiveGame((s) => s.incOpponent);
  const incPlayerScore = useLiveGame((s) => s.incPlayerScore);
  const undoTeamScore = useLiveGame((s) => s.undoTeamScore);
  const undoOpponentScore = useLiveGame((s) => s.undoOpponentScore);
  const undoPlayerScore = useLiveGame((s) => s.undoPlayerScore);
  const playerScores = useLiveGame((s) => s.playerScores);
  const startClock = useLiveGame((s) => s.startClock);
  const pauseClock = useLiveGame((s) => s.pauseClock);
  const beginNextQuarter = useLiveGame((s) => s.beginNextQuarter);
  const endCurrentQuarter = useLiveGame((s) => s.endCurrentQuarter);
  const basePlayedZoneMs = useLiveGame((s) => s.basePlayedZoneMs);
  const stintStartMs = useLiveGame((s) => s.stintStartMs);
  const stintZone = useLiveGame((s) => s.stintZone);
  const swapCount = useLiveGame((s) => s.swapCount);
  const injuredIds = useLiveGame((s) => s.injuredIds);
  const setInjured = useLiveGame((s) => s.setInjured);
  const loanedIds = useLiveGame((s) => s.loanedIds);
  const loanStartMs = useLiveGame((s) => s.loanStartMs);
  const basePlayedLoanMs = useLiveGame((s) => s.basePlayedLoanMs);
  const setLoaned = useLiveGame((s) => s.setLoaned);
  const lockedIds = useLiveGame((s) => s.lockedIds);
  const setLocked = useLiveGame((s) => s.setLocked);
  const zoneLockedPlayers = useLiveGame((s) => s.zoneLockedPlayers);
  const setZoneLocked = useLiveGame((s) => s.setZoneLocked);
  const lastStintZone = useLiveGame((s) => s.lastStintZone);

  const activeGameId = useLiveGame((s) => s.activeGameId);

  const walkthroughSteps = useMemo(() => buildWalkthroughSteps(trackScoring), [trackScoring]);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [walkthroughSkipWelcome, setWalkthroughSkipWelcome] = useState(false);

  const [hydrated, setHydrated] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [subBaseMs, setSubBaseMs] = useState<number | null>(null);
  const [pendingSwap, setPendingSwap] = useState<{ off: string; on: string; zone: Zone } | null>(null);
  const [, setTick] = useState(0);
  const prevSubStateRef = useRef<"idle" | "soft" | "due">("idle");
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [showQuarterEndModal, setShowQuarterEndModal] = useState(false);
  const quarterEndTriggeredRef = useRef<number | null>(null);
  const [lockModal, setLockModal] = useState<{ playerId: string; zone: Zone | null } | null>(null);
  // When set, the coach is choosing a replacement for an on-field player about
  // to be marked injured. Null means no picker open.
  const [injuryReplacementModal, setInjuryReplacementModal] = useState<{
    injuredId: string;
    zone: Zone;
  } | null>(null);

  // Undo-score state
  const [lastScore, setLastScore] = useState<LastScore | null>(null);
  const [undoToastVisible, setUndoToastVisible] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Swap-done toast — confirms that a substitution landed.
  const [swapToast, setSwapToast] = useState<string | null>(null);
  const swapToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Team song — play songDurationSeconds from the configured start point on each goal
  const songAudioRef = useRef<HTMLAudioElement | null>(null);
  const songTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const ytReadyRef = useRef(false);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hydrated || !songUrl || !isYouTubeUrl(songUrl)) return;
    const videoId = youtubeVideoId(songUrl);
    if (!videoId || !ytContainerRef.current) return;

    const playerDiv = document.createElement("div");
    ytContainerRef.current.appendChild(playerDiv);

    function createPlayer() {
      ytPlayerRef.current = new window.YT.Player(playerDiv, {
        // Force a 1×1 iframe — the YT API defaults to 640×360, which
        // otherwise bleeds past the viewport and inflates page scroll
        // area by ~125 px wide × 192 px tall.
        width: "1",
        height: "1",
        videoId,
        playerVars: { autoplay: 0, controls: 0, fs: 0, rel: 0, playsinline: 1 },
        events: {
          onReady: () => { ytReadyRef.current = true; },
        },
      });
    }

    if (window.YT?.Player) {
      createPlayer();
    } else {
      window.onYouTubeIframeAPIReady = createPlayer;
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
    }

    return () => {
      ytPlayerRef.current?.destroy();
      ytPlayerRef.current = null;
      ytReadyRef.current = false;
      playerDiv.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songUrl, gameId, hydrated]);

  function playSong() {
    if (!songUrl) return;
    try {
      if (songTimerRef.current !== null) {
        clearTimeout(songTimerRef.current);
        songTimerRef.current = null;
      }
      if (isYouTubeUrl(songUrl)) {
        if (!ytReadyRef.current || !ytPlayerRef.current) return;
        ytPlayerRef.current.seekTo(songStartSeconds, true);
        ytPlayerRef.current.playVideo();
        songTimerRef.current = setTimeout(() => {
          ytPlayerRef.current?.pauseVideo();
          songTimerRef.current = null;
        }, songDurationSeconds * 1000);
      } else {
        const audio = songAudioRef.current ?? new Audio(songUrl);
        songAudioRef.current = audio;
        audio.currentTime = songStartSeconds;
        audio.play().catch(() => {});
        songTimerRef.current = setTimeout(() => {
          audio.pause();
          songTimerRef.current = null;
        }, songDurationSeconds * 1000);
      }
    } catch {
      // ignore any audio API errors
    }
  }

  const playersById = useMemo(
    () => new Map(squadPlayers.map((p) => [p.id, p])),
    [squadPlayers]
  );

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("gm-walkthrough-seen")) {
      setWalkthroughOpen(true);
    }
  }, []);

  function handleWalkthroughClose() {
    localStorage.setItem("gm-walkthrough-seen", "1");
    setWalkthroughOpen(false);
    setWalkthroughSkipWelcome(false);
  }

  function handleOpenWalkthrough() {
    setWalkthroughSkipWelcome(true);
    setWalkthroughOpen(true);
  }

  useEffect(() => {
    if (!initialState.lineup) return;
    // Skip re-init when the store is already in sync with the server's view
    // of the game. After a `resetGame` deletes every event, the server's
    // currentQuarter regresses to 0 — but quarters can only ever advance
    // during normal play. So if the store thinks we're further along than
    // the server says, the game has been reset and we MUST re-init to
    // wipe accumulated zone minutes, scores, locks, and so on. Without
    // this check, restart-game just left the in-memory state from before
    // the reset visible on screen.
    const storeAheadOfServer = currentQuarter > initialState.currentQuarter;
    if (activeGameId === gameId && !storeAheadOfServer) {
      setHydrated(true);
      return;
    }
    let clockStartedAt: number | null = null;
    let accumulatedMs = 0;
    if (
      !initialState.quarterEnded &&
      !initialState.finalised &&
      initialState.currentQuarter >= 1 &&
      initialState.quarterStartedAt
    ) {
      accumulatedMs = Math.max(0, Date.now() - new Date(initialState.quarterStartedAt).getTime());
      clockStartedAt = Date.now();
    }
    init({
      activeGameId: gameId,
      lineup: initialState.lineup,
      currentQuarter: initialState.currentQuarter,
      quarterEnded: initialState.quarterEnded,
      finalised: initialState.finalised,
      teamScore: initialState.teamScore,
      opponentScore: initialState.opponentScore,
      playerScores: initialState.playerScores,
      basePlayedZoneMs: initialState.basePlayedZoneMs,
      stintStartMs: initialState.stintStartMs,
      stintZone: initialState.stintZone,
      injuredIds: initialState.injuredIds,
      loanedIds: initialState.loanedIds,
      loanStartMs: initialState.loanStartMs,
      basePlayedLoanMs: initialState.basePlayedLoanMs,
      clockStartedAt,
      accumulatedMs,
    });
    setHydrated(true);
  }, [init, initialState, gameId, activeGameId, currentQuarter]);

  function currentElapsedMs() {
    return clockElapsedMs({ clockStartedAt, accumulatedMs });
  }

  function scaledElapsedMs() {
    return currentElapsedMs() * clockMultiplier;
  }

  useEffect(() => {
    if (clockStartedAt === null) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [clockStartedAt]);

  useEffect(() => {
    if (currentQuarter >= 1 && !quarterEnded && !finalised) {
      setSubBaseMs(clockElapsedMs({ clockStartedAt, accumulatedMs }));
    } else {
      setSubBaseMs(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuarter, quarterEnded, finalised]);

  function handleTapField(playerId: string, zone: Zone) {
    if (isFinished) return;
    if (playerId === "") {
      if (selected?.kind === "bench") {
        clearSelection();
        setPendingSwap({ off: "", on: selected.playerId, zone });
      }
      return;
    }
    if (!selected) {
      selectField(playerId, zone);
      return;
    }
    if (selected.kind === "field" && selected.playerId === playerId) {
      clearSelection();
      return;
    }
    if (selected.kind === "bench") {
      clearSelection();
      setPendingSwap({ off: playerId, on: selected.playerId, zone });
      return;
    }
    // Two different field players in different zones — swap their zones directly.
    if (selected.zone !== zone) {
      const pidA = selected.playerId;
      const zoneA = selected.zone;
      const quarter = Math.max(1, currentQuarter);
      const elapsed_ms = scaledElapsedMs();
      applyFieldZoneSwap(pidA, zoneA, playerId, zone);
      showSwapToast(
        `${shortName(pidA)} ⇄ ${shortName(playerId)} — zones swapped`
      );
      startTransition(async () => {
        const result = await recordFieldZoneSwap(auth, gameId, {
          player_a_id: pidA,
          zone_a: zoneA,
          player_b_id: playerId,
          zone_b: zone,
          quarter,
          elapsed_ms,
        });
        if (!result.success) setError(result.error);
      });
      return;
    }
    selectField(playerId, zone);
  }

  function handleTapBench(playerId: string) {
    if (isFinished) return;
    if (!selected) {
      selectBench(playerId);
      return;
    }
    if (selected.kind === "bench" && selected.playerId === playerId) {
      clearSelection();
      return;
    }
    if (selected.kind === "field") {
      clearSelection();
      setPendingSwap({ off: selected.playerId, on: playerId, zone: selected.zone });
      return;
    }
    selectBench(playerId);
  }

  function startUndoToast(score: LastScore) {
    if (undoTimerRef.current !== null) clearTimeout(undoTimerRef.current);
    setLastScore(score);
    setUndoToastVisible(true);
    undoTimerRef.current = setTimeout(() => setUndoToastVisible(false), 8000);
  }

  function shortName(playerId: string): string {
    const p = playersById.get(playerId);
    if (!p) return "Player";
    const [first] = p.full_name.trim().split(/\s+/);
    return first ?? p.full_name;
  }

  function showSwapToast(text: string) {
    if (swapToastTimerRef.current !== null) clearTimeout(swapToastTimerRef.current);
    setSwapToast(text);
    swapToastTimerRef.current = setTimeout(() => setSwapToast(null), 2500);
    // Light haptic tap on mobile.
    if (typeof window !== "undefined" && window.matchMedia("(hover: none)").matches) {
      navigator.vibrate?.(40);
    }
  }

  function handleScore(kind: "goal" | "behind") {
    if (!selected || selected.kind !== "field") return;
    const playerId = selected.playerId;
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = scaledElapsedMs();
    const p = playersById.get(playerId);
    incTeam(kind === "goal" ? "goals" : "behinds");
    incPlayerScore(playerId, kind === "goal" ? "goals" : "behinds");
    clearSelection();
    if (kind === "goal") playSong();
    startUndoToast({
      kind,
      forTeam: "us",
      playerId,
      playerName: p ? p.full_name.trim().split(/\s+/)[0] : null,
      quarter,
    });
    startTransition(async () => {
      const fn = kind === "goal" ? recordGoal : recordBehind;
      const result = await fn(auth, gameId, {
        player_id: playerId,
        quarter,
        elapsed_ms,
      });
      if (!result.success) setError(result.error);
    });
  }

  function handleInjuryToggle(playerId: string, injured: boolean) {
    setError(null);
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = scaledElapsedMs();
    setInjured(playerId, injured);
    startTransition(async () => {
      const result = await markInjury(auth, gameId, {
        player_id: playerId,
        injured,
        quarter,
        elapsed_ms,
      });
      if (!result.success) setError(result.error);
    });
  }

  // Combined injury + bench-replacement swap. Used when the coach picks a
  // replacement in InjuryReplacementModal — fires the atomic store action
  // and persists both events to the server (injury + swap) in parallel.
  // Mirrors persistSwap's sub-timer reset so the next sub-due alert fires
  // a fresh interval after the forced rotation.
  function handleInjuryReplacement(
    injuredId: string,
    replacementId: string,
    zone: Zone
  ) {
    setError(null);
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = scaledElapsedMs();
    setSubBaseMs(currentElapsedMs());
    applyInjurySwap(injuredId, replacementId);
    startTransition(async () => {
      const [injuryResult, swapResult] = await Promise.all([
        markInjury(auth, gameId, {
          player_id: injuredId,
          injured: true,
          quarter,
          elapsed_ms,
        }),
        recordSwap(auth, gameId, {
          off_player_id: injuredId,
          on_player_id: replacementId,
          zone,
          quarter,
          elapsed_ms,
        }),
      ]);
      if (!injuryResult.success) setError(injuryResult.error);
      else if (!swapResult.success) setError(swapResult.error);
    });
  }

  function handleLoanToggle(playerId: string, loaned: boolean) {
    setError(null);
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = scaledElapsedMs();
    setLoaned(playerId, loaned);
    startTransition(async () => {
      const result = await markLoan(auth, gameId, {
        player_id: playerId,
        loaned,
        quarter,
        elapsed_ms,
      });
      if (!result.success) setError(result.error);
    });
  }

  function handleLateArrival(playerId: string) {
    setError(null);
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = scaledElapsedMs();
    addBenchPlayer(playerId);
    startTransition(async () => {
      const result = await addLateArrival(auth, gameId, {
        player_id: playerId,
        quarter,
        elapsed_ms,
      });
      if (!result.success) setError(result.error);
    });
  }

  function handleOpponent(kind: "goal" | "behind") {
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = scaledElapsedMs();
    incOpponent(kind === "goal" ? "goals" : "behinds");
    startUndoToast({ kind, forTeam: "opponent", playerId: null, playerName: null, quarter });
    startTransition(async () => {
      const result = await recordOpponentScore(auth, gameId, {
        kind,
        quarter,
        elapsed_ms,
      });
      if (!result.success) setError(result.error);
    });
  }

  function handleUndo() {
    if (!lastScore) return;
    const { kind, forTeam, playerId, quarter } = lastScore;

    if (forTeam === "us") {
      undoTeamScore(kind === "goal" ? "goals" : "behinds");
      if (playerId) undoPlayerScore(playerId, kind === "goal" ? "goals" : "behinds");
    } else {
      undoOpponentScore(kind === "goal" ? "goals" : "behinds");
    }

    setLastScore(null);
    setUndoToastVisible(false);
    if (undoTimerRef.current !== null) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    const serverKind: "goal" | "behind" | "opponent_goal" | "opponent_behind" =
      forTeam === "us"
        ? kind
        : kind === "goal" ? "opponent_goal" : "opponent_behind";

    startTransition(async () => {
      const result = await undoLastScore(auth, gameId, {
        kind: serverKind,
        quarter,
        playerId: playerId ?? null,
      });
      if (!result.success) setError(result.error);
    });
  }

  function persistSwap(off: string, on: string, zone: Zone) {
    setError(null);
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = scaledElapsedMs();
    setSubBaseMs(currentElapsedMs()); // raw — sub timer compares against raw nowMs
    applySwap(off, on, zone);
    startTransition(async () => {
      const result = await recordSwap(auth, gameId, {
        off_player_id: off,
        on_player_id: on,
        zone,
        quarter,
        elapsed_ms,
      });
      if (!result.success) {
        setError(result.error);
      }
    });
  }

  function handleStartFirstQuarter() {
    setError(null);
    startTransition(async () => {
      const result = await startQuarter(auth, gameId, 1);
      if (!result.success) {
        setError(result.error);
        return;
      }
      beginNextQuarter();
      // Keep the existing single-tap Q1 kickoff: the "Start Q1" button
      // both advances the quarter and starts the clock. The StartQuarterModal
      // only gates Q2–Q4, since those run through the QuarterBreak screen.
      startClock();
    });
  }

  function handlePause() {
    pauseClock();
  }

  function handleResume() {
    startClock();
  }

  function handleEndQuarter() {
    setError(null);
    const q = currentQuarter;
    const elapsed_ms = scaledElapsedMs();
    endCurrentQuarter(quarterMs);
    startTransition(async () => {
      const result = await endQuarterAction(auth, gameId, q, elapsed_ms);
      if (!result.success) setError(result.error);
    });
  }

  function handleQuarterEndConfirm() {
    setShowQuarterEndModal(false);
    handleEndQuarter();
  }

  const running = clockStartedAt !== null;
  const isPreGame = currentQuarter === 0;
  const isFinished = finalised || (currentQuarter >= 4 && quarterEnded);
  const isBetweenQuarters = quarterEnded && currentQuarter >= 1 && currentQuarter < 4;

  const nowMs = clockElapsedMs({ clockStartedAt, accumulatedMs });
  const displayNowMs = Math.min(nowMs, quarterMs);

  const zoneMsByPlayer: Record<string, ZoneMinutes> = {};
  for (const [pid, zm] of Object.entries(basePlayedZoneMs)) {
    zoneMsByPlayer[pid] = { ...zm };
  }
  for (const [pid, start] of Object.entries(stintStartMs)) {
    const z = stintZone[pid];
    if (!z) continue;
    zoneMsByPlayer[pid] ??= emptyZoneMs();
    zoneMsByPlayer[pid][z] += Math.max(0, displayNowMs - start);
  }
  const totalMsByPlayer: Record<string, number> = {};
  for (const [pid, zm] of Object.entries(zoneMsByPlayer)) {
    let t = 0;
    for (const z of ALL_ZONES) t += zm[z];
    totalMsByPlayer[pid] = t;
  }

  const subIntervalMs = subIntervalSeconds * 1000;
  // Divide sub interval by multiplier so subs fire at the right virtual-game cadence.
  const effectiveSubIntervalMs = subIntervalMs / clockMultiplier;
  const msUntilDue =
    subBaseMs !== null && !isPreGame && !isFinished
      ? subBaseMs + effectiveSubIntervalMs - nowMs
      : null;
  const subState: "idle" | "soft" | "due" =
    msUntilDue === null
      ? "idle"
      : msUntilDue <= 0
      ? "due"
      : msUntilDue <= 30000
      ? "soft"
      : "idle";

  useEffect(() => {
    if (subState === "due" && prevSubStateRef.current !== "due") {
      playBeep();
      setSubModalOpen(true);
      if (window.matchMedia("(hover: none)").matches) {
        navigator.vibrate?.([200, 100, 200]);
      }
    }
    if (subState !== "due") {
      setSubModalOpen(false);
    }
    prevSubStateRef.current = subState;
  }, [subState]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current !== null) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
      if (swapToastTimerRef.current !== null) {
        clearTimeout(swapToastTimerRef.current);
        swapToastTimerRef.current = null;
      }
      if (songTimerRef.current !== null) {
        clearTimeout(songTimerRef.current);
        songTimerRef.current = null;
      }
      songAudioRef.current?.pause();
      ytPlayerRef.current?.pauseVideo();
    };
  }, []);

  function handleSubModalAcknowledge() {
    setSubModalOpen(false);
  }

  useEffect(() => {
    if (quarterEnded || finalised || currentQuarter < 1) return;

    function maybeTrigger() {
      const elapsed = clockElapsedMs({ clockStartedAt, accumulatedMs });
      if (elapsed * clockMultiplier >= quarterMs && quarterEndTriggeredRef.current !== currentQuarter) {
        quarterEndTriggeredRef.current = currentQuarter;
        // Freeze the clock at the hooter so per-player stint times don't keep
        // accruing while the GM reads the modal.
        pauseClock();
        setShowQuarterEndModal(true);
        if (window.matchMedia("(hover: none)").matches) {
          navigator.vibrate?.([200, 100, 200]);
        }
      }
    }

    maybeTrigger();
    if (clockStartedAt === null) return;
    const id = setInterval(maybeTrigger, 500);
    return () => clearInterval(id);
  }, [clockStartedAt, accumulatedMs, quarterEnded, finalised, currentQuarter]);

  useEffect(() => {
    if (quarterEnded) setShowQuarterEndModal(false);
  }, [quarterEnded]);

  if (!hydrated) return null;

  if (isBetweenQuarters) {
    return (
      <QuarterBreak
        auth={auth}
        gameId={gameId}
        players={squadPlayers}
        season={season}
        zoneCaps={zoneCaps}
        positionModel={positionModel}
        onStarted={() => beginNextQuarter()}
      />
    );
  }

  function handleLongPress(playerId: string) {
    const zone = stintZone[playerId] ?? lastStintZone[playerId] ?? null;
    setLockModal({ playerId, zone });
  }

  const suggestions =
    isPreGame || isFinished
      ? []
      : suggestSwaps(
          lineup,
          totalMsByPlayer,
          swapCount,
          // Loaned players are unavailable for rotation, same as injured.
          [...injuredIds, ...loanedIds],
          activeZones,
          lockedIds,
          zoneMsByPlayer,
          zoneLockedPlayers
        );

  const canScore = trackScoring && !isPreGame && !isFinished && selected?.kind === "field";

  function handleClockTap() {
    if (isPreGame || isFinished) return;
    if (running) handlePause();
    else handleResume();
  }

  return (
    <div className="space-y-3">
      {/* Top utility row: exit on the left, help (?) on the right so it
          sits above the scorebug's right edge — the conventional location
          for a "help" affordance. */}
      <div className="flex items-center justify-between">
        {exitHref ? (
          <Link href={exitHref} className="font-mono text-[11px] text-ink-mute hover:text-ink-dim">
            ✕ Exit
          </Link>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={handleOpenWalkthrough}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-hairline font-mono text-[11px] font-bold text-ink-mute transition-colors duration-fast ease-out-quart hover:border-ink-dim hover:text-ink-dim"
          aria-label="Open walkthrough"
        >
          ?
        </button>
      </div>

      {/* Unified header — teams + scores + clock pill */}
      <GameHeader
        teamName={teamName}
        opponentName={opponentName}
        trackScoring={trackScoring}
        onOpponent={!isPreGame && !isFinished ? handleOpponent : undefined}
        onClockTap={handleClockTap}
        running={running}
        isPreGame={isPreGame}
        isFinished={isFinished}
        clockMultiplier={clockMultiplier}
        isPending={isPending}
      />

      {/* Swap-done toast — flashes briefly after a substitution lands */}
      {swapToast && !isPreGame && !isFinished && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-sm border border-brand-200 bg-brand-50 px-3 py-1.5 text-brand-800 shadow-card"
        >
          <span
            aria-hidden
            className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold leading-none text-warm"
          >
            ✓
          </span>
          <span className="text-xs font-semibold">{swapToast}</span>
        </div>
      )}

      {/* Undo last score — toast (8 s) then persistent chip */}
      {lastScore && !isPreGame && !isFinished && (
        <div
          className={`flex items-center justify-between rounded-sm px-3 py-1.5 transition-colors ${
            undoToastVisible ? "bg-ink text-warm" : "bg-surface-alt"
          }`}
        >
          <span className={`text-xs ${undoToastVisible ? "text-warm/80" : "text-ink-dim"}`}>
            {undoToastVisible
              ? `${lastScore.forTeam === "us" ? teamName : opponentName} ${lastScore.kind}${lastScore.playerName ? ` — ${lastScore.playerName}` : ""}`
              : "Undo last score"}
          </span>
          <button
            type="button"
            onClick={handleUndo}
            disabled={isPending}
            className={`font-mono text-xs font-bold uppercase tracking-micro transition-colors disabled:opacity-60 ${
              undoToastVisible ? "text-warn hover:text-warn/80" : "text-brand-700 hover:text-brand-600"
            }`}
          >
            Undo
          </button>
        </div>
      )}

      {/* Start Q1 */}
      {isPreGame && (
        <Button className="w-full" onClick={handleStartFirstQuarter} loading={isPending}>
          Start Q1
        </Button>
      )}
      {isFinished && (
        <p className="text-center font-mono text-[11px] font-bold uppercase tracking-micro text-ink-dim">
          Full time
        </p>
      )}

      {error && (
        <p className="rounded-sm bg-warn-soft px-3 py-2 text-sm text-warn" role="alert">
          {error}
        </p>
      )}

      {(() => {
        const swapOffs = new Map<string, number>();
        const swapOns = new Map<string, { pair: number; zone: Zone }>();
        if (!selected) {
          suggestions.forEach((s, i) => {
            if (s.off_player_id) swapOffs.set(s.off_player_id, i + 1);
            swapOns.set(s.on_player_id, { pair: i + 1, zone: s.zone });
          });
        }
        const totalPairs = suggestions.length;
        return (
          <>
            {!isPreGame && !isFinished && (
              <SwapCard
                suggestions={suggestions}
                playersById={playersById}
                pending={isPending}
                subState={subState}
                forceOpen={subModalOpen}
                msUntilDue={msUntilDue}
                subIntervalMs={subIntervalMs}
                onApply={() => {
                  for (const s of suggestions) {
                    persistSwap(s.off_player_id, s.on_player_id, s.zone);
                  }
                  if (suggestions.length === 1) {
                    const s = suggestions[0];
                    showSwapToast(
                      `${shortName(s.off_player_id)} → ${shortName(s.on_player_id)}`
                    );
                  } else if (suggestions.length > 1) {
                    showSwapToast(`${suggestions.length} subs made`);
                  }
                  handleSubModalAcknowledge();
                }}
                onApplyOne={(s) => {
                  persistSwap(s.off_player_id, s.on_player_id, s.zone);
                  showSwapToast(
                    `${shortName(s.off_player_id)} → ${shortName(s.on_player_id)}`
                  );
                }}
              />
            )}

            <Field
              playersById={playersById}
              onTapField={handleTapField}
              swapOffs={swapOffs}
              totalMsByPlayer={totalMsByPlayer}
              zoneMsByPlayer={zoneMsByPlayer}
              injuredIds={injuredIds}
              lockedIds={lockedIds}
              zoneLockedPlayers={zoneLockedPlayers}
              onLongPress={handleLongPress}
              zoneCaps={zoneCaps}
              positionModel={positionModel}
              playerScores={playerScores}
              totalPairs={totalPairs}
            />
            <Bench
              playersById={playersById}
              onTapBench={handleTapBench}
              swapOns={swapOns}
              totalMsByPlayer={totalMsByPlayer}
              zoneMsByPlayer={zoneMsByPlayer}
              injuredIds={injuredIds}
              loanedIds={loanedIds}
              lockedIds={lockedIds}
              zoneLockedPlayers={zoneLockedPlayers}
              onLongPress={handleLongPress}
              playerScores={playerScores}
              totalPairs={totalPairs}
            />
            {!isFinished && (
              <LateArrivalMenu
                candidates={squadPlayers.filter((p) => {
                  const inBench = lineup.bench.includes(p.id);
                  const inField = ALL_ZONES.some((z) => lineup[z].includes(p.id));
                  return !inBench && !inField;
                })}
                onAdd={handleLateArrival}
                pending={isPending}
              />
            )}
          </>
        );
      })()}

      {canScore && (() => {
        const pid = selected && selected.kind === "field" ? selected.playerId : null;
        const p = pid ? playersById.get(pid) : null;
        // Full-width fixed wrapper pins to the visual viewport regardless of
        // any ancestor with transform/filter; the inner card is
        // width-constrained and centered so it can't overflow horizontally.
        return (
          <div
            className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-2 pt-2"
            style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
          >
            <div className="pointer-events-auto mx-auto max-w-xl rounded-md border-2 border-brand-500 bg-surface p-3 shadow-modal">
              <div className="mb-2 flex items-center gap-2">
                <p className="flex-1 truncate text-sm font-semibold text-ink">
                  Record score for{" "}
                  <span className="text-brand-700">
                    {p ? `#${p.jersey_number} ${p.full_name}` : "player"}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => clearSelection()}
                  className="flex-shrink-0 font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute hover:text-ink-dim"
                >
                  Cancel
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleScore("goal")}
                  disabled={isPending}
                  className="flex-1 rounded-sm bg-brand-600 py-3 font-mono text-base font-bold uppercase tracking-micro text-white shadow-card transition-colors duration-fast ease-out-quart hover:bg-brand-500 disabled:opacity-60"
                >
                  + Goal
                </button>
                <button
                  type="button"
                  onClick={() => handleScore("behind")}
                  disabled={isPending}
                  className="flex-1 rounded-sm bg-warn py-3 font-mono text-base font-bold uppercase tracking-micro text-white shadow-card transition-colors duration-fast ease-out-quart hover:opacity-90 disabled:opacity-60"
                >
                  + Behind
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {selected && !canScore && (
        <p className="rounded-sm bg-brand-50 px-3 py-2 text-xs text-brand-800">
          {selected.kind === "field"
            ? "Tap a bench player to swap them in, or tap the selected player again to cancel."
            : "Tap a field tile to swap this player in, or tap them again to cancel."}
        </p>
      )}

      {pendingSwap && (
        <SwapConfirmDialog
          off={pendingSwap.off}
          on={pendingSwap.on}
          zone={pendingSwap.zone}
          playersById={playersById}
          onConfirm={() => {
            persistSwap(pendingSwap.off, pendingSwap.on, pendingSwap.zone);
            if (pendingSwap.off) {
              showSwapToast(
                `${shortName(pendingSwap.off)} → ${shortName(pendingSwap.on)}`
              );
            } else {
              showSwapToast(`${shortName(pendingSwap.on)} on`);
            }
            setPendingSwap(null);
          }}
          onCancel={() => setPendingSwap(null)}
        />
      )}

      {showQuarterEndModal && (
        <QuarterEndModal
          quarter={currentQuarter}
          loading={isPending}
          onConfirm={handleQuarterEndConfirm}
        />
      )}

      {/* Await-kickoff modal for Q2–Q4. QuarterBreak advances the quarter
          without auto-starting the clock; the manager taps Start when the
          hooter goes. Q1 keeps its single-tap "Start Q1" button above. */}
      {!isPreGame &&
        !isFinished &&
        !quarterEnded &&
        !running &&
        accumulatedMs === 0 &&
        currentQuarter >= 2 && (
          <StartQuarterModal
            quarter={currentQuarter}
            loading={isPending}
            onStart={() => startClock()}
          />
        )}

      {subModalOpen && (
        <SubDueModal onAcknowledge={handleSubModalAcknowledge} />
      )}

      {walkthroughOpen && (
        <WalkthroughModal
          steps={walkthroughSteps}
          skipWelcome={walkthroughSkipWelcome}
          onClose={handleWalkthroughClose}
        />
      )}

      {lockModal && (() => {
        const p = playersById.get(lockModal.playerId);
        if (!p) return null;
        const isFieldLocked = lockedIds.includes(lockModal.playerId);
        const isZoneLocked = !!zoneLockedPlayers[lockModal.playerId];
        const currentLock: "field" | "zone" | null = isFieldLocked ? "field" : isZoneLocked ? "zone" : null;
        const isInjured = injuredIds.includes(lockModal.playerId);
        const isLoaned = loanedIds.includes(lockModal.playerId);
        // Season total for this player includes (a) completed games from server,
        // (b) already-closed loan ms this game, (c) the currently-open loan stint.
        const pid = lockModal.playerId;
        const nowMs = currentElapsedMs();
        const liveGameMins =
          ((basePlayedLoanMs[pid] ?? 0) +
            (loanStartMs[pid] !== undefined ? Math.max(0, nowMs - loanStartMs[pid]) : 0)) /
          60000;
        const seasonLoanMins = (seasonLoanMinutes[pid] ?? 0) + liveGameMins;
        // Squad reference — mean across everyone with non-zero loan mins
        // (completed games only, so it stays stable during the current game).
        const squadValues = Object.values(seasonLoanMinutes).filter((v) => v > 0);
        const squadLoanMins =
          squadValues.length > 0
            ? squadValues.reduce((a, b) => a + b, 0) / squadValues.length
            : 0;
        return (
          <LockModal
            player={p}
            currentLock={currentLock}
            currentZone={lockModal.zone}
            isInjured={isInjured}
            isLoaned={isLoaned}
            seasonLoanMins={seasonLoanMins}
            squadLoanMins={squadLoanMins}
            onLockField={() => {
              setLocked(lockModal.playerId, true);
              setLockModal(null);
            }}
            onLockZone={() => {
              if (lockModal.zone) setZoneLocked(lockModal.playerId, lockModal.zone);
              setLockModal(null);
            }}
            onUnlock={() => {
              setLocked(lockModal.playerId, false);
              setZoneLocked(lockModal.playerId, null);
              setLockModal(null);
            }}
            onToggleInjury={() => {
              // When marking an ON-FIELD player injured, prompt for a bench
              // replacement so the zone doesn't go a player short. Fall
              // through to the direct path when (a) un-marking injury,
              // (b) the player is already on the bench (no zone to fill),
              // or (c) the bench has no eligible replacements.
              const goingToInjured = !isInjured;
              const onFieldZone = lockModal.zone;
              const hasEligibleBench = lineup.bench.some(
                (id) => !injuredIds.includes(id) && !loanedIds.includes(id)
              );
              if (goingToInjured && onFieldZone && hasEligibleBench) {
                setInjuryReplacementModal({
                  injuredId: lockModal.playerId,
                  zone: onFieldZone,
                });
                setLockModal(null);
                return;
              }
              handleInjuryToggle(lockModal.playerId, !isInjured);
              setLockModal(null);
            }}
            onToggleLoan={() => {
              handleLoanToggle(lockModal.playerId, !isLoaned);
              setLockModal(null);
            }}
            onClose={() => setLockModal(null)}
          />
        );
      })()}

      {injuryReplacementModal && (() => {
        const inj = playersById.get(injuryReplacementModal.injuredId);
        if (!inj) return null;
        // Build the candidate list at render time so it stays fresh if a
        // bench player is loaned/recovered while the picker is open.
        const candidates: InjuryReplacementCandidate[] = lineup.bench
          .filter((id) => !injuredIds.includes(id) && !loanedIds.includes(id))
          .map((id) => ({
            player: playersById.get(id),
            totalMs: totalMsByPlayer[id] ?? 0,
          }))
          .filter((c): c is InjuryReplacementCandidate => !!c.player)
          .sort((a, b) => a.totalMs - b.totalMs);
        return (
          <InjuryReplacementModal
            injuredPlayer={inj}
            zone={injuryReplacementModal.zone}
            candidates={candidates}
            onPickReplacement={(rid) => {
              handleInjuryReplacement(
                injuryReplacementModal.injuredId,
                rid,
                injuryReplacementModal.zone
              );
              setInjuryReplacementModal(null);
            }}
            onSkipReplacement={() => {
              handleInjuryToggle(injuryReplacementModal.injuredId, true);
              setInjuryReplacementModal(null);
            }}
            onCancel={() => setInjuryReplacementModal(null)}
          />
        );
      })()}

      {/* Full-time game summary */}
      {isFinished && (
        <GameSummaryCard
          teamName={teamName}
          opponentName={opponentName}
          trackScoring={trackScoring}
          playersById={playersById}
          playerCount={squadPlayers.length}
        />
      )}

      {songUrl && isYouTubeUrl(songUrl) && (
        <div
          ref={ytContainerRef}
          style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }}
          aria-hidden
        />
      )}
    </div>
  );
}
