"use client";

// ─── The period's pause, from the game's events ─────────────────
// For the live screens that replay their events (netball, rugby,
// soccer's family, basketball, touch's family): the pause is the
// period's latest clock_pause (lib/live/clockPause), so a reload or a
// second phone shows the same paused clock. A tap writes the event
// through useOptimisticEvents, so the clock stops the moment it's
// tapped. Pauses still in the write queue from before a reload count
// too, once the page is on the phone (the server's render has no
// queue, so the first render matches it).

import { useEffect, useMemo, useState } from "react";
import type { GameEvent } from "@/lib/types";
import type { PeriodPause } from "@/lib/live/periodClock";
import { periodPauseFromEvents, withQueuedClockPauses } from "@/lib/live/clockPause";
import { useWriteQueue } from "@/lib/live/writeQueue";

/** `events` with this game's pauses still in the write queue. */
export function useWithQueuedClockPauses(events: readonly GameEvent[], gameId: string): readonly GameEvent[] {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const queue = useWriteQueue((s) => s.queue);
  return useMemo(
    () => (mounted ? withQueuedClockPauses(events, queue, gameId) : events),
    [mounted, events, queue, gameId],
  );
}

/** The period's pause for computePeriodClockMs, from `events`. */
export function useEventPeriodPause(
  events: readonly GameEvent[],
  gameId: string,
  period: number,
  startedAtMs: number | null,
  clockMultiplier: number,
): PeriodPause {
  const withQueued = useWithQueuedClockPauses(events, gameId);
  return useMemo(
    () => periodPauseFromEvents(withQueued, period, startedAtMs, clockMultiplier),
    [withQueued, period, startedAtMs, clockMultiplier],
  );
}
