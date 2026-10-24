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
//
// The event rides with its queued write (writeQueue's `optimistic`), so
// a reload before it saved still draws it from the queue, and the
// refresh when it does save comes too, though no caller is left to wait
// on it. Without that, taps made with no signal vanished from a reloaded
// screen while the queue still held them, and a coach tapped them again
// (round 3, 24 Oct 2026).

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GameEvent } from "@/lib/types";
import {
  enqueueLiveAction,
  type LiveActionArgs,
  type LiveActionKind,
} from "@/lib/live/registerLiveActions";
import { onQueueSaved, useWriteQueue } from "@/lib/live/writeQueue";
import {
  mergeOptimisticEvents,
  optimisticCreatedAt,
  queuedOptimisticEvents,
  settlePendingEvents,
  toOptimisticEvent,
  type OptimisticEventInput,
  type PendingEvent,
} from "@/lib/live/optimisticEvents";

/** Queues a write and shows its event; returns the write's op id (its idempotency key). */
export interface OptimisticWrite {
  <K extends LiveActionKind>(kind: K, args: LiveActionArgs<K>, optimistic: OptimisticEventInput | null): string;
}

export function useOptimisticEvents(
  serverEvents: GameEvent[],
  opts: { gameId: string; onError: (message: string) => void },
): {
  events: GameEvent[];
  write: OptimisticWrite;
  unsaved: number;
  /**
   * The write queue a reload left on the phone is in `events`. Until
   * then the screen shows only the server's game, which may lack a
   * period end still queued: a hooter that fired before this ended the
   * period a second time (round 3, 24 Oct 2026).
   */
  queueReady: boolean;
} {
  const router = useRouter();
  const [pending, setPending] = useState<PendingEvent[]>([]);
  const gameId = opts.gameId;

  // A refresh landed: drop the writes it brought back.
  useEffect(() => {
    setPending((list) => (list.length === 0 ? list : settlePendingEvents(list, serverEvents)));
  }, [serverEvents]);

  // Writes a reload left in the queue, drawn from it (once the page is
  // on the phone: the server's render has no queue, so the first render
  // matches it).
  const [queueReady, setQueueReady] = useState(false);
  useEffect(() => {
    if (useWriteQueue.persist.hasHydrated()) setQueueReady(true);
    return useWriteQueue.persist.onFinishHydration(() => setQueueReady(true));
  }, []);
  const queue = useWriteQueue((s) => s.queue);
  const fromQueue = useMemo(
    () => (queueReady ? queuedOptimisticEvents(queue, gameId) : []),
    [queueReady, queue, gameId],
  );

  // The ones this page didn't write (its own are in `pending`).
  const leftByReload = useMemo(() => {
    const mine = new Set(pending.map((p) => p.idempotency_key));
    return fromQueue.filter((e) => !mine.has(e.idempotency_key));
  }, [pending, fromQueue]);
  // The queue's own come first: one lane, so nothing still queued from
  // before the reload is newer than this page's writes.
  const events = useMemo(
    () => mergeOptimisticEvents(serverEvents, leftByReload.length === 0 ? pending : [...leftByReload, ...pending]),
    [serverEvents, pending, leftByReload],
  );
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

  // A write a reload left in the queue saved: keep its event drawn until
  // the refresh brings the server's row, and refresh (no caller is
  // waiting on it to).
  useEffect(
    () =>
      onQueueSaved((op, { hadCaller }) => {
        if (hadCaller || op.args[1] !== gameId) return;
        const saved = op.optimistic;
        if (saved && saved.gameId === gameId) {
          const ev = toOptimisticEvent(saved.event, { opId: op.id, gameId, createdAt: saved.createdAt });
          setPending((list) =>
            list.some((p) => p.idempotency_key === op.id) ? list : [...list, { ...ev, flushed: true }],
          );
        }
        scheduleRefresh();
      }),
    [gameId, scheduleRefresh],
  );

  const write = useCallback<OptimisticWrite>(
    (kind, args, optimistic) => {
      const createdAt = optimisticCreatedAt(
        latestRef.current.map((e) => e.created_at),
        Date.now(),
      );
      const { id, flushed } = enqueueLiveAction(
        kind,
        args,
        optimistic ? { gameId, createdAt, event: optimistic } : undefined,
      );
      if (optimistic) {
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
      return id;
    },
    [gameId, scheduleRefresh],
  );

  return { events, write, unsaved: pending.filter((p) => !p.flushed).length + leftByReload.length, queueReady };
}
