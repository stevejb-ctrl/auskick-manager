"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  clockElapsedMs,
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
import { GameClock } from "@/components/live/GameClock";
import { SwapCard } from "@/components/live/SwapCard";
import { QuarterBreak } from "@/components/live/QuarterBreak";
import { ScoreBoard } from "@/components/live/ScoreBoard";
import { LateArrivalMenu } from "@/components/live/LateArrivalMenu";
import { InjuryMenu } from "@/components/live/InjuryMenu";
import { suggestSwaps, type GameState, type PlayerZoneMinutes, type ZoneCaps } from "@/lib/fairness";
import type { Player, Zone } from "@/lib/types";

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
}: LiveGameProps) {
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

  const [hydrated, setHydrated] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [subBaseMs, setSubBaseMs] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const prevSubStateRef = useRef<"idle" | "soft" | "due">("idle");

  const playersById = useMemo(
    () => new Map(squadPlayers.map((p) => [p.id, p])),
    [squadPlayers]
  );

  useEffect(() => {
    if (!initialState.lineup) return;
    init({
      lineup: initialState.lineup,
      currentQuarter: initialState.currentQuarter,
      quarterEnded: initialState.quarterEnded,
      finalised: initialState.finalised,
      teamScore: initialState.teamScore,
      opponentScore: initialState.opponentScore,
      basePlayedZoneMs: initialState.basePlayedZoneMs,
      stintStartMs: initialState.stintStartMs,
      stintZone: initialState.stintZone,
      injuredIds: initialState.injuredIds,
    });
    setHydrated(true);
  }, [init, initialState]);

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
        persistSwap("", selected.playerId, zone);
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
      const off = playerId;
      const on = selected.playerId;
      persistSwap(off, on, zone);
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
      const off = selected.playerId;
      const on = playerId;
      const zone = selected.zone;
      persistSwap(off, on, zone);
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
    clearSelection();
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

  const running = clockStartedAt !== null;
  const isPreGame = currentQuarter === 0;
  const isFinished = finalised || (currentQuarter >= 4 && quarterEnded);
  const isBetweenQuarters = quarterEnded && currentQuarter >= 1 && currentQuarter < 4;

  const nowMs = clockElapsedMs({ clockStartedAt, accumulatedMs });

  const zoneMsByPlayer: Record<string, { back: number; mid: number; fwd: number }> = {};
  for (const [pid, zm] of Object.entries(basePlayedZoneMs)) {
    zoneMsByPlayer[pid] = { ...zm };
  }
  for (const [pid, start] of Object.entries(stintStartMs)) {
    const z = stintZone[pid];
    if (!z) continue;
    zoneMsByPlayer[pid] ??= { back: 0, mid: 0, fwd: 0 };
    zoneMsByPlayer[pid][z] += Math.max(0, nowMs - start);
  }
  const totalMsByPlayer: Record<string, number> = {};
  for (const [pid, zm] of Object.entries(zoneMsByPlayer)) {
    totalMsByPlayer[pid] = zm.back + zm.mid + zm.fwd;
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
    }
    prevSubStateRef.current = subState;
  }, [subState]);

  if (!hydrated) return null;

  if (isBetweenQuarters) {
    return (
      <QuarterBreak
        auth={auth}
        gameId={gameId}
        players={squadPlayers}
        season={season}
        zoneCaps={zoneCaps}
        onStarted={() => beginNextQuarter()}
      />
    );
  }

  const canScore = trackScoring && !isPreGame && !isFinished && selected?.kind === "field";

  return (
    <div className="space-y-3">
      {trackScoring && (
        <ScoreBoard
          teamName={teamName}
          opponentName={opponentName}
          onOpponent={!isPreGame && !isFinished ? handleOpponent : undefined}
        />
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <GameClock />
        <div className="mt-2 flex justify-center gap-2">
          {isPreGame && (
            <Button size="sm" onClick={handleStartFirstQuarter} loading={isPending}>
              Start Q1
            </Button>
          )}
          {!isPreGame && !isFinished && !running && (
            <Button size="sm" onClick={handleResume}>
              Resume
            </Button>
          )}
          {running && (
            <Button size="sm" variant="secondary" onClick={handlePause}>
              Pause
            </Button>
          )}
          {!isPreGame && !isFinished && (
            <Button size="sm" variant="ghost" onClick={handleEndQuarter} loading={isPending}>
              End Q{currentQuarter}
            </Button>
          )}
          {isFinished && (
            <span className="text-sm font-semibold text-gray-500">Full time</span>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {(() => {
        const suggestions =
          isPreGame || isFinished
            ? []
            : suggestSwaps(lineup, totalMsByPlayer, swapCount, injuredIds);
        const swapOffs = new Map<string, number>();
        const swapOns = new Map<string, number>();
        if (!selected) {
          suggestions.forEach((s, i) => {
            if (s.off_player_id) swapOffs.set(s.off_player_id, i + 1);
            swapOns.set(s.on_player_id, i + 1);
          });
        }
        return (
          <>
            <Field
              playersById={playersById}
              onTapField={handleTapField}
              swapOffs={swapOffs}
              totalMsByPlayer={totalMsByPlayer}
              zoneMsByPlayer={zoneMsByPlayer}
              injuredIds={injuredIds}
              zoneCaps={zoneCaps}
            />
            <Bench
              playersById={playersById}
              onTapBench={handleTapBench}
              swapOns={swapOns}
              totalMsByPlayer={totalMsByPlayer}
              zoneMsByPlayer={zoneMsByPlayer}
              injuredIds={injuredIds}
            />
            {!isPreGame && !isFinished && (
              <SwapCard
                suggestions={suggestions}
                playersById={playersById}
                pending={isPending}
                subState={subState}
                msUntilDue={msUntilDue}
                onApply={() => {
                  for (const s of suggestions) {
                    persistSwap(s.off_player_id, s.on_player_id, s.zone);
                  }
                }}
              />
            )}
            {!isFinished && (
              <InjuryMenu
                players={squadPlayers.filter((p) => {
                  return (
                    lineup.back.includes(p.id) ||
                    lineup.mid.includes(p.id) ||
                    lineup.fwd.includes(p.id) ||
                    lineup.bench.includes(p.id)
                  );
                })}
                injuredIds={injuredIds}
                onToggle={handleInjuryToggle}
                pending={isPending}
              />
            )}
            {!isFinished && (
              <LateArrivalMenu
                candidates={squadPlayers.filter((p) => {
                  const inLineup =
                    lineup.back.includes(p.id) ||
                    lineup.mid.includes(p.id) ||
                    lineup.fwd.includes(p.id) ||
                    lineup.bench.includes(p.id);
                  return !inLineup;
                })}
                onAdd={handleLateArrival}
                pending={isPending}
              />
            )}
          </>
        );
      })()}

      {canScore && (
        <div className="flex gap-2 rounded-md border border-brand-200 bg-brand-50 p-2">
          <Button size="sm" onClick={() => handleScore("goal")} loading={isPending}>
            + Goal
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleScore("behind")}
            loading={isPending}
          >
            + Behind
          </Button>
          <Button size="sm" variant="ghost" onClick={() => clearSelection()}>
            Cancel
          </Button>
        </div>
      )}

      {selected && !canScore && (
        <p className="rounded-md bg-brand-50 px-3 py-2 text-xs text-brand-700">
          {selected.kind === "field"
            ? "Tap a bench player to swap them in, or tap the selected player again to cancel."
            : "Tap a field tile to swap this player in, or tap them again to cancel."}
        </p>
      )}
    </div>
  );
}
