// A period's clock pause, saved on the phone so a reload keeps it.
//
// The live clock rebuilds from the period's quarter_start timestamp on
// a reload (computePeriodClockMs), but a pause lived only in React
// state, so reloading during a timeout counted the paused seconds as
// play (liveGameStore.ts's header calls this out for AFL). Basketball
// has two to four timeouts a game and stops the clock in the last
// minutes, so its live screen saves the pause here
// (.planning/BASKETBALL-PLAN.md, "Save pauses"). Any sport's live
// screen can use usePeriodPause in place of a useState pause.
//
// Saved per game, for the period in play only: a new period starts
// running (RUNNING_CLOCK), and a pause saved for another period is
// ignored.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StateStorage } from "zustand/middleware";
import { liveGameStorage } from "@/lib/live/persistStorage";
import { RUNNING_CLOCK, type PeriodPause } from "@/lib/live/periodClock";

export function periodPauseKey(gameId: string): string {
  return `siren:period-pause:${gameId}`;
}

/** The saved pause, when it's for `period`; else a running clock. */
export function parseStoredPause(raw: string | null | undefined, period: number): PeriodPause {
  if (!raw) return RUNNING_CLOCK;
  try {
    const v = JSON.parse(raw) as { period?: unknown; pausedAtMs?: unknown; accumulatedPauseMs?: unknown };
    if (v.period !== period) return RUNNING_CLOCK;
    const pausedAtMs = typeof v.pausedAtMs === "number" && Number.isFinite(v.pausedAtMs) ? v.pausedAtMs : null;
    const accumulatedPauseMs =
      typeof v.accumulatedPauseMs === "number" && v.accumulatedPauseMs > 0 ? v.accumulatedPauseMs : 0;
    return { pausedAtMs, accumulatedPauseMs };
  } catch {
    return RUNNING_CLOCK;
  }
}

export function serializePause(period: number, pause: PeriodPause): string {
  return JSON.stringify({ period, pausedAtMs: pause.pausedAtMs, accumulatedPauseMs: pause.accumulatedPauseMs });
}

export async function readPeriodPause(
  storage: Pick<StateStorage, "getItem">,
  gameId: string,
  period: number,
): Promise<PeriodPause> {
  try {
    return parseStoredPause(await storage.getItem(periodPauseKey(gameId)), period);
  } catch {
    return RUNNING_CLOCK;
  }
}

export async function writePeriodPause(
  storage: Pick<StateStorage, "setItem">,
  gameId: string,
  period: number,
  pause: PeriodPause,
): Promise<void> {
  try {
    await storage.setItem(periodPauseKey(gameId), serializePause(period, pause));
  } catch {
    // Storage blocked or full: the pause still works until a reload.
  }
}

/**
 * The period's pause, saved on the phone. Starts running, then picks up
 * a pause saved for this period (after a reload); every change is saved.
 * A new period starts running.
 */
export function usePeriodPause(
  gameId: string,
  period: number,
  storage: StateStorage = liveGameStorage,
): [PeriodPause, (update: (prev: PeriodPause) => PeriodPause) => void] {
  const [pause, setPauseState] = useState<PeriodPause>(RUNNING_CLOCK);
  const periodRef = useRef(period);
  periodRef.current = period;

  useEffect(() => {
    let live = true;
    setPauseState(RUNNING_CLOCK);
    void readPeriodPause(storage, gameId, period).then((saved) => {
      if (live && periodRef.current === period) setPauseState(saved);
    });
    return () => {
      live = false;
    };
  }, [gameId, period, storage]);

  const setPause = useCallback(
    (update: (prev: PeriodPause) => PeriodPause) => {
      setPauseState((prev) => {
        const next = update(prev);
        void writePeriodPause(storage, gameId, periodRef.current, next);
        return next;
      });
    },
    [gameId, storage],
  );

  return [pause, setPause];
}
