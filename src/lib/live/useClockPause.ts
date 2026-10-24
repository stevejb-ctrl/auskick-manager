"use client";

// ─── The period's pause, from the game's events ─────────────────
// For the live screens that replay their events (netball, rugby,
// soccer's family, basketball, touch's family): the pause is the
// period's latest clock_pause (lib/live/clockPause), so a reload or a
// second phone shows the same paused clock. A tap writes the event
// through useOptimisticEvents, so the clock stops the moment it's
// tapped, and a pause still in the write queue from before a reload is
// in `events` too (useOptimisticEvents draws the queue's).

import { useMemo } from "react";
import type { GameEvent } from "@/lib/types";
import type { PeriodPause } from "@/lib/live/periodClock";
import { periodPauseFromEvents } from "@/lib/live/clockPause";

/** The period's pause for computePeriodClockMs, from `events`. */
export function useEventPeriodPause(
  events: readonly GameEvent[],
  period: number,
  startedAtMs: number | null,
  clockMultiplier: number,
): PeriodPause {
  return useMemo(
    () => periodPauseFromEvents(events, period, startedAtMs, clockMultiplier),
    [events, period, startedAtMs, clockMultiplier],
  );
}
