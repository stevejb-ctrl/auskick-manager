"use client";

// ─── useOptimisticEvents ─────────────────────────────────────
// For the live screens that replay the game's events (soccer's family,
// basketball, touch's family, rugby): every in-game write goes through
// `write`, which queues the server action and puts the event it will
// insert on screen at once (optimisticEvents.ts). The screen replays
// `events` (the server's, then
// the writes not yet back), so a goal, an undo or a sub shows the moment
// it's tapped, as AFL's store does, and never waits on the server
// (UX audit 23 Oct 2026, package C).
//
// When a write saves, a refresh brings its row and the screen's copy
// gives way. When it fails for good, its event comes off and onError
// says so.

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GameEvent } from "@/lib/types";
import {
  enqueueLiveAction,
  type LiveActionArgs,
  type LiveActionKind,
} from "@/lib/live/registerLiveActions";
import {
  mergeOptimisticEvents,
  optimisticCreatedAt,
  settlePendingEvents,
  toOptimisticEvent,
  type OptimisticEventInput,
  type PendingEvent,
} from "@/lib/live/optimisticEvents";

export interface OptimisticWrite {
  <K extends LiveActionKind>(kind: K, args: LiveActionArgs<K>, optimistic: OptimisticEventInput | null): void;
}

export function useOptimisticEvents(
  serverEvents: GameEvent[],
  opts: { gameId: string; onError: (message: string) => void },
): { events: GameEvent[]; write: OptimisticWrite; unsaved: number } {
  const router = useRouter();
  const [pending, setPending] = useState<PendingEvent[]>([]);

  // A refresh landed: drop the writes it brought back.
  useEffect(() => {
    setPending((list) => (list.length === 0 ? list : settlePendingEvents(list, serverEvents)));
  }, [serverEvents]);

  const events = useMemo(() => mergeOptimisticEvents(serverEvents, pending), [serverEvents, pending]);
  // Two writes in one tick: the second orders after the first.
  const latestRef = useRef(events);
  latestRef.current = events;
  const onErrorRef = useRef(opts.onError);
  onErrorRef.current = opts.onError;

  // One refresh for a burst of saves.
  const refreshTimer = useRef<number | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current !== null) return;
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      startTransition(() => router.refresh());
    }, 150);
  }, [router]);
  useEffect(
    () => () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    },
    [],
  );

  const gameId = opts.gameId;
  const write = useCallback<OptimisticWrite>(
    (kind, args, optimistic) => {
      const { id, flushed } = enqueueLiveAction(kind, args);
      if (optimistic) {
        const createdAt = optimisticCreatedAt(
          latestRef.current.map((e) => e.created_at),
          Date.now(),
        );
        const ev = toOptimisticEvent(optimistic, { opId: id, gameId, createdAt });
        latestRef.current = [...latestRef.current, ev];
        setPending((list) => [...list, ev]);
      }
      flushed
        .then(() => {
          setPending((list) => list.map((p) => (p.idempotency_key === id ? { ...p, flushed: true } : p)));
          scheduleRefresh();
        })
        .catch((e: unknown) => {
          setPending((list) => list.filter((p) => p.idempotency_key !== id));
          onErrorRef.current(e instanceof Error ? e.message : "That didn't save. Try again.");
          scheduleRefresh();
        });
    },
    [gameId, scheduleRefresh],
  );

  return { events, write, unsaved: pending.filter((p) => !p.flushed).length };
}
