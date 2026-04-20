"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  clockElapsedMs,
  QUARTER_MS,
  useLiveGame,
} from "@/lib/stores/liveGameStore";
import {
  addLateArrival,
  endQuarter as endQuarterAction,
  markInjury,
  recordBehind,
  recordGoal,
  recordOpponentScore,
  recordSwap,
  startQuarter,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/live/Field";
import { Bench } from "@/components/live/Bench";
import { GameHeader } from "@/components/live/GameHeader";
import { NextSubBar } from "@/components/live/NextSubBar";
import { SwapCard } from "@/components/live/SwapCard";
import { SwapConfirmDialog } from "@/components/live/SwapConfirmDialog";
import { QuarterBreak } from "@/components/live/QuarterBreak";
import { WalkthroughModal, buildWalkthroughSteps } from "@/components/live/WalkthroughModal";
import { LateArrivalMenu } from "@/components/live/LateArrivalMenu";
import { InjuryMenu } from "@/components/live/InjuryMenu";
import { QuarterEndModal } from "@/components/live/QuarterEndModal";
import { LockModal } from "@/components/live/LockModal";
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
  zoneCaps: ZoneCaps;
  positionModel: PositionModel;
  exitHref?: string;
  /** Public URL of the team song audio file, if configured. */
  songUrl?: string | null;
  /** Seconds into the song to start playback from (default 0). */
  songStartSeconds?: number;
}

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
  zoneCaps,
  positionModel,
  exitHref,
  songUrl,
  songStartSeconds = 0,
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
  const addBenchPlayer = useLiveGame((s) => s.addBenchPlayer);
  const incTeam = useLiveGame((s) => s.incTeam);
  const incOpponent = useLiveGame((s) => s.incOpponent);
  const incPlayerScore = useLiveGame((s) => s.incPlayerScore);
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

  // Team song — play 15 s from the configured start point on each goal
  const songAudioRef = useRef<HTMLAudioElement | null>(null);
  const songTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const ytReadyRef = useRef(false);
  // Stable container that React owns; the YT API manages a child element inside it
  // so React never tries to reconcile the iframe the API creates.
  const ytContainerRef = useRef<HTMLDivElement | null>(null);

  // Load the YouTube IFrame API once if the song URL is a YouTube link.
  // NOTE: depends on `hydrated` because the container div only enters the DOM after
  // the hydration guard clears. Without this dep the effect would fire when the
  // component still returns null, find ytContainerRef.current === null, bail out
  // early, and never re-run because songUrl/gameId don't change on the second render.
  useEffect(() => {
    if (!hydrated || !songUrl || !isYouTubeUrl(songUrl)) return;
    const videoId = youtubeVideoId(songUrl);
    if (!videoId || !ytContainerRef.current) return;

    // Create a plain div for the YT API to replace with an iframe.
    // Using document.createElement keeps this element outside React's vdom,
    // preventing the "insertBefore" crash when React reconciles the tree.
    const playerDiv = document.createElement("div");
    ytContainerRef.current.appendChild(playerDiv);

    function createPlayer() {
      ytPlayerRef.current = new window.YT.Player(playerDiv, {
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
      // Queue the callback; the script fires it once loaded.
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
        // YouTube IFrame path
        if (!ytReadyRef.current || !ytPlayerRef.current) return;
        ytPlayerRef.current.seekTo(songStartSeconds, true);
        ytPlayerRef.current.playVideo();
        songTimerRef.current = setTimeout(() => {
          ytPlayerRef.current?.pauseVideo();
          songTimerRef.current = null;
        }, 15_000);
      } else {
        // HTML5 Audio path (uploaded file)
        const audio = songAudioRef.current ?? new Audio(songUrl);
        songAudioRef.current = audio;
        audio.currentTime = songStartSeconds;
        audio.play().catch(() => {}); // silently ignore autoplay policy blocks
        songTimerRef.current = setTimeout(() => {
          audio.pause();
          songTimerRef.current = null;
        }, 15_000);
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
    if (activeGameId === gameId) {
      // Same game already loaded — in-memory store is authoritative.
      // Avoid overwriting with potentially stale server data (router cache).
      setHydrated(true);
      return;
    }
    // Reconstruct running clock for an active quarter from the quarter_start wall time.
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
      clockStartedAt,
      accumulatedMs,
    });
    setHydrated(true);
  }, [init, initialState, gameId, activeGameId]);

  function currentElapsedMs() {
    return clockElapsedMs({ clockStartedAt, accumulatedMs });
  }

  // Re-render every 500ms while the clock is running so the sub timer updates.
  useEffect(() => {
    if (clockStartedAt === null) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [clockStartedAt]);

  // When a new quarter begins, reset the sub timer base to now.
  useEffect(() => {
    if (currentQuarter >= 1 && !quarterEnded && !finalised) {
      setSubBaseMs(clockElapsedMs({ clockStartedAt, accumulatedMs }));
    } else {
      setSubBaseMs(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuarter, quarterEnded, finalised]);

  function handleTapField(playerId: string, zone: Zone) {
    // Empty slot was tapped.
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
      // swap bench player ON → current field tile (same zone enforced: zone = tapped tile's zone)
      clearSelection();
      setPendingSwap({ off: playerId, on: selected.playerId, zone });
      return;
    }
    // selected is a different field player — just re-select
    selectField(playerId, zone);
  }

  function handleTapBench(playerId: string) {
    if (!selected) {
      selectBench(playerId);
      return;
    }
    if (selected.kind === "bench" && selected.playerId === playerId) {
      clearSelection();
      return;
    }
    if (selected.kind === "field") {
      // swap off selected field player, on this bench player
      clearSelection();
      setPendingSwap({ off: selected.playerId, on: playerId, zone: selected.zone });
      return;
    }
    selectBench(playerId);
  }

  function handleScore(kind: "goal" | "behind") {
    if (!selected || selected.kind !== "field") return;
    const playerId = selected.playerId;
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = currentElapsedMs();
    incTeam(kind === "goal" ? "goals" : "behinds");
    incPlayerScore(playerId, kind === "goal" ? "goals" : "behinds");
    clearSelection();
    if (kind === "goal") playSong();
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
    const elapsed_ms = currentElapsedMs();
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

  function handleLateArrival(playerId: string) {
    setError(null);
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = currentElapsedMs();
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
    const elapsed_ms = currentElapsedMs();
    incOpponent(kind === "goal" ? "goals" : "behinds");
    startTransition(async () => {
      const result = await recordOpponentScore(auth, gameId, {
        kind,
        quarter,
        elapsed_ms,
      });
      if (!result.success) setError(result.error);
    });
  }

  function persistSwap(off: string, on: string, zone: Zone) {
    setError(null);
    const quarter = Math.max(1, currentQuarter);
    const elapsed_ms = currentElapsedMs();
    // Reset sub timer on every applied swap.
    setSubBaseMs(elapsed_ms);
    // Optimistic client update, then persist event.
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
        // NB: event failed; client state is now out of sync with server.
        // Simplest recovery: reload the page.
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
    const elapsed_ms = currentElapsedMs();
    endCurrentQuarter();
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
  // Cap player-counter display at the quarter boundary so tiles freeze rather than running into overtime.
  const displayNowMs = Math.min(nowMs, QUARTER_MS);

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
  const msUntilDue =
    subBaseMs !== null && !isPreGame && !isFinished
      ? subBaseMs + subIntervalMs - nowMs
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

  // Detect when the quarter clock hits the threshold; show modal once per quarter.
  useEffect(() => {
    if (quarterEnded || finalised || currentQuarter < 1) return;

    function maybeTrigger() {
      const elapsed = clockElapsedMs({ clockStartedAt, accumulatedMs });
      if (elapsed >= QUARTER_MS && quarterEndTriggeredRef.current !== currentQuarter) {
        quarterEndTriggeredRef.current = currentQuarter;
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

  // Dismiss the modal whenever the quarter is actually ended (manual or via modal).
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
    // Zone from current stint (on field) or last stint (on bench)
    const zone = stintZone[playerId] ?? lastStintZone[playerId] ?? null;
    setLockModal({ playerId, zone });
  }

  const suggestions =
    isPreGame || isFinished
      ? []
      : suggestSwaps(lineup, totalMsByPlayer, swapCount, injuredIds, activeZones, lockedIds, zoneMsByPlayer, zoneLockedPlayers);

  const canScore = trackScoring && !isPreGame && !isFinished && selected?.kind === "field";

  function handleClockTap() {
    if (isPreGame || isFinished) return;
    if (running) handlePause();
    else handleResume();
  }

  return (
    <div className="space-y-3">
      {/* Top utility row: walkthrough + exit */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleOpenWalkthrough}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-hairline font-mono text-[11px] font-bold text-ink-mute transition-colors duration-fast ease-out-quart hover:border-ink-dim hover:text-ink-dim"
          aria-label="Open walkthrough"
        >
          ?
        </button>
        {exitHref && (
          <Link href={exitHref} className="font-mono text-[11px] text-ink-mute hover:text-ink-dim">
            Exit ✕
          </Link>
        )}
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
      />

      {/* Primary game-state action (Start Q1 / End Q / Full time) */}
      {isPreGame && (
        <Button className="w-full" onClick={handleStartFirstQuarter} loading={isPending}>
          Start Q1
        </Button>
      )}
      {!isPreGame && !isFinished && (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={handleEndQuarter} loading={isPending}>
            End Q{currentQuarter}
          </Button>
        </div>
      )}
      {isFinished && (
        <p className="text-center font-mono text-[11px] font-bold uppercase tracking-micro text-ink-dim">
          Full time
        </p>
      )}

      {/* Next-sub progress + X Next Up counter */}
      {!isPreGame && !isFinished && (
        <NextSubBar
          msUntilDue={msUntilDue}
          subIntervalMs={subIntervalMs}
          suggestionCount={suggestions.length}
        />
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
        return (
          <>
            {/* Suggested-swaps card, collapsible, sits above the field */}
            {!isPreGame && !isFinished && (
              <SwapCard
                suggestions={suggestions}
                playersById={playersById}
                pending={isPending}
                subState={subState}
                forceOpen={subModalOpen}
                onApply={() => {
                  for (const s of suggestions) {
                    persistSwap(s.off_player_id, s.on_player_id, s.zone);
                  }
                  handleSubModalAcknowledge();
                }}
                onApplyOne={(s) => persistSwap(s.off_player_id, s.on_player_id, s.zone)}
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
            />
            <Bench
              playersById={playersById}
              onTapBench={handleTapBench}
              swapOns={swapOns}
              totalMsByPlayer={totalMsByPlayer}
              zoneMsByPlayer={zoneMsByPlayer}
              injuredIds={injuredIds}
              lockedIds={lockedIds}
              zoneLockedPlayers={zoneLockedPlayers}
              onLongPress={handleLongPress}
              playerScores={playerScores}
            />
            {!isFinished && (
              <InjuryMenu
                players={squadPlayers.filter((p) => {
                  if (lineup.bench.includes(p.id)) return true;
                  return ALL_ZONES.some((z) => lineup[z].includes(p.id));
                })}
                injuredIds={injuredIds}
                onToggle={handleInjuryToggle}
                pending={isPending}
              />
            )}
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
        return (
          <div className="sticky bottom-2 z-10 rounded-md border-2 border-brand-500 bg-surface p-3 shadow-modal">
            <p className="mb-2 text-center text-sm font-semibold text-ink">
              Record score for{" "}
              <span className="text-brand-700">
                {p ? `#${p.jersey_number} ${p.full_name}` : "player"}
              </span>
            </p>
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
              <Button size="sm" variant="ghost" onClick={() => clearSelection()}>
                Cancel
              </Button>
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
        return (
          <LockModal
            player={p}
            currentLock={currentLock}
            currentZone={lockModal.zone}
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
            onClose={() => setLockModal(null)}
          />
        );
      })()}

      {/* Hidden YouTube IFrame container — the API appends its own child here */}
      {songUrl && isYouTubeUrl(songUrl) && (
        <div
          ref={ytContainerRef}
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
          aria-hidden
        />
      )}
    </div>
  );
}
