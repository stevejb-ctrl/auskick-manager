"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { liveGameStorage } from "./persistStorage";
import { isNative } from "@/lib/platform";

// ─── Durable write queue for live-game server actions ─────────
//
// Slice 5 phase 5d. Wraps server-action calls so the live-game UI
// keeps working when the network drops mid-quarter.
//
// Flow:
//   1. Caller (phase 5e) does `enqueue("recordGoal", [auth, gameId,
//      input])`. Returns a UUID immediately. Local zustand store
//      is updated optimistically by the caller before this call.
//   2. The queue worker drains in per-kind lanes (perf phase 4b):
//      ops of DIFFERENT kinds run in parallel (so a slow
//      score-goal doesn't head-of-line-block a set-availability
//      flip), but within a single kind ops still run strictly in
//      order. The op's UUID is appended as the final argument to
//      the handler, becoming the idempotency_key on the resulting
//      game_events row — a replay after a flaky network simply
//      hits the unique constraint and the server reports
//      success-already-applied (slice 5a).
//   3. On success, the op is popped from the queue and its flushed
//      promise resolves. On failure, attemptCount is bumped, the
//      error is recorded, and the kind is paused — preserving
//      order within that lane. Other kinds keep flowing. The next
//      drain trigger after `resume()` (called on network-online,
//      handler register) retries from the same head.
//
// Persistence: the queue itself rides on the liveGameStorage
// adapter (Capacitor Preferences on native, localStorage on web)
// under "siren-write-queue-v1", so a force-quit mid-quarter still
// has the unflushed ops on relaunch. Lane state (inFlightKinds /
// pausedKinds) is runtime-only.

export type ActionResult = { success: boolean; error?: string };

/**
 * Handler signature: receives the caller's positional args plus
 * the queue-generated idempotency key as the final argument.
 */
export type ActionHandler = (
  ...args: unknown[]
) => Promise<ActionResult>;

interface QueueOp {
  /** UUID v4. Used as the idempotency_key on the resulting event row. */
  id: string;
  /** Registered handler key — e.g. "recordGoal", "recordSwap". */
  kind: string;
  /** Positional args passed to the handler (excluding idempotencyKey). */
  args: unknown[];
  /** Bumped on every failed drain attempt. */
  attemptCount: number;
  /** Wall-clock ms when the op was first appended. */
  queuedAt: number;
  /** Most recent error message, if any. */
  lastError?: string;
}

export interface EnqueueResult {
  /** UUID v4 — also written to game_events.idempotency_key. */
  id: string;
  /**
   * Resolves when the op successfully drains to the server.
   * Lets callers chain `router.refresh()` after the server has
   * the new state without breaking the queue's fire-and-forget
   * contract — fine for online users (resolves ~immediately) and
   * for offline users (resolves when the network returns and the
   * queue drains). Never rejects: transient failures keep
   * retrying, and the only "permanent" failure path is a missing
   * handler, which would have to be a programming error.
   */
  flushed: Promise<void>;
}

interface WriteQueueState {
  queue: QueueOp[];
  /** Kinds currently dispatching one op. Runtime-only. */
  inFlightKinds: string[];
  /** Kinds halted after a failure / missing handler. Cleared by resume(). */
  pausedKinds: string[];
  enqueue: (kind: string, args: unknown[]) => EnqueueResult;
  drain: () => Promise<void>;
  /** Clear pausedKinds so previously-failed lanes get retried. */
  resume: () => void;
  /** Clear the entire queue. Test affordance + a "give up" option for users. */
  clearQueue: () => void;
}

// In-memory map of op id → flushed-promise resolver. Lives
// outside the zustand store because Promise callbacks can't be
// serialized to disk. Only populated for ops enqueued during the
// current page session; rehydrated ops from a previous session
// have no caller waiting, so they drain without resolving anyone.
const flushedResolvers = new Map<string, () => void>();

// ─── Handler registry ─────────────────────────────────────────
// Keyed by the same `kind` the caller passes to enqueue(). Phase
// 5e populates this with imports of the real server actions.
// Tests register their own mock handlers via registerActionHandler.

const handlers: Record<string, ActionHandler> = {};

export function registerActionHandler(
  kind: string,
  handler: ActionHandler,
): void {
  handlers[kind] = handler;
  // Newly-registered handler ⇒ the cold-start race where ops
  // queued before the handler loaded should now proceed. Clear
  // any pause on this kind and kick a drain.
  const store = useWriteQueue.getState();
  if (store.pausedKinds.includes(kind)) {
    useWriteQueue.setState((s) => ({
      pausedKinds: s.pausedKinds.filter((k) => k !== kind),
    }));
    void store.drain();
  }
}

/** Test affordance: drop all registered handlers. */
export function clearActionHandlers(): void {
  for (const k of Object.keys(handlers)) delete handlers[k];
}

// ─── UUID generator ───────────────────────────────────────────
// Modern WebKit / V8 / Bun all have crypto.randomUUID. The fallback
// covers ancient WebViews; should never actually fire on Capacitor 8
// or Node 18+.

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const useWriteQueue = create<WriteQueueState>()(
  persist(
    (set, get) => ({
      queue: [],
      inFlightKinds: [],
      pausedKinds: [],

      enqueue: (kind, args) => {
        const id = uuid();
        const op: QueueOp = {
          id,
          kind,
          args,
          attemptCount: 0,
          queuedAt: Date.now(),
        };
        const flushed = new Promise<void>((resolve) => {
          flushedResolvers.set(id, resolve);
        });
        // Functional set so concurrent enqueues don't clobber each other.
        set((s) => ({ queue: [...s.queue, op] }));
        // Fire-and-forget drain attempt. If we're online and this
        // op's kind has no in-flight predecessor, drain dispatches
        // it immediately. If we're offline, drain bails and the op
        // waits for the next resume() trigger.
        void get().drain();
        return { id, flushed };
      },

      drain: async () => {
        // Per-kind lanes: in each pass, find every op whose kind
        // is neither in-flight nor paused, dispatch them in
        // parallel, await the batch, and re-evaluate. Same-kind
        // ops still drain serially because a kind can have at
        // most one in-flight op at a time.
        while (true) {
          const state = get();
          // Track which kinds we've already scheduled this pass so
          // we don't schedule two ops of the same kind at once
          // (would violate "1 lane per kind").
          const scheduledKinds = new Set<string>(state.inFlightKinds);
          const batch: QueueOp[] = [];
          for (const op of state.queue) {
            if (scheduledKinds.has(op.kind)) continue;
            if (state.pausedKinds.includes(op.kind)) continue;
            const handler = handlers[op.kind];
            if (!handler) {
              // Missing handler ⇒ pause this kind. Other kinds
              // unaffected. registerActionHandler clears the pause
              // when the handler shows up (cold-start race).
              console.warn(
                `[writeQueue] no handler for kind=${op.kind} — pausing lane at op id=${op.id}`,
              );
              set((s) => ({
                pausedKinds: s.pausedKinds.includes(op.kind)
                  ? s.pausedKinds
                  : [...s.pausedKinds, op.kind],
              }));
              scheduledKinds.add(op.kind); // skip subsequent same-kind ops this pass
              continue;
            }
            batch.push(op);
            scheduledKinds.add(op.kind);
          }
          if (batch.length === 0) break;

          // Mark all batched kinds in-flight atomically before
          // yielding to await — protects against a concurrent
          // drain() picking up the same op.
          set((s) => ({
            inFlightKinds: [...s.inFlightKinds, ...batch.map((o) => o.kind)],
          }));

          await Promise.all(batch.map((op) => dispatchOp(op)));
          // Loop re-evaluates: same-kind followups may now be
          // eligible, and pausedKinds may have grown.
        }
      },

      resume: () => {
        set({ pausedKinds: [] });
      },

      clearQueue: () => {
        // Drop any flushed-promise resolvers too, otherwise they'd
        // leak (their ops are gone, no one ever resolves them).
        flushedResolvers.clear();
        set({ queue: [], inFlightKinds: [], pausedKinds: [] });
      },
    }),
    {
      name: "siren-write-queue-v1",
      version: 1,
      storage: createJSONStorage(() => liveGameStorage),
      // Lane state (inFlightKinds / pausedKinds) is runtime-only —
      // persisting it would deadlock the queue across a force-quit
      // (kind stuck in-flight or paused with no live process to
      // unblock it). Only the durable queue itself rides on disk.
      partialize: (state) => ({ queue: state.queue }),
    },
  ),
);

// Helper used by drain(). Runs a handler, post-processes the
// queue + lane state, and returns when the dispatch is fully
// settled. The OUTER drain loop awaits Promise.all of these so it
// only re-evaluates eligible ops once the current batch finishes.
async function dispatchOp(op: QueueOp): Promise<void> {
  const handler = handlers[op.kind];
  let result: ActionResult;
  try {
    // Idempotency key appended as the final argument so handlers
    // don't have to know the queue exists — they just see one
    // extra optional positional.
    result = await handler(...op.args, op.id);
  } catch (err) {
    result = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Always remove from in-flight.
  useWriteQueue.setState((s) => {
    const idx = s.inFlightKinds.indexOf(op.kind);
    if (idx === -1) return s;
    const next = s.inFlightKinds.slice();
    next.splice(idx, 1);
    return { inFlightKinds: next };
  });

  if (result.success) {
    // Resolve the caller's flushed-promise (if any — rehydrated
    // ops from a previous session won't have an entry here) BEFORE
    // popping the queue, so a .then() chain doesn't race a
    // subsequent drain.
    const resolve = flushedResolvers.get(op.id);
    if (resolve) {
      flushedResolvers.delete(op.id);
      resolve();
    }
    useWriteQueue.setState((s) => ({
      queue: s.queue.filter((q) => q.id !== op.id),
    }));
  } else {
    // Failure: bump attemptCount, pause this kind. The op stays
    // at its position so when resume() clears the pause, drain
    // picks it up again from the same place.
    useWriteQueue.setState((s) => ({
      queue: s.queue.map((q) =>
        q.id === op.id
          ? {
              ...q,
              attemptCount: q.attemptCount + 1,
              lastError: result.error,
            }
          : q,
      ),
      pausedKinds: s.pausedKinds.includes(op.kind)
        ? s.pausedKinds
        : [...s.pausedKinds, op.kind],
    }));
  }
}

// ─── Network listener: drain on reconnect ─────────────────────
// Initialised once per page load. The native shell's listener is
// dynamic-imported so the @capacitor/network chunk only loads
// when isNative() is true.

let networkListenerInitialised = false;

async function initNetworkListener(): Promise<void> {
  if (networkListenerInitialised) return;
  networkListenerInitialised = true;

  const onOnline = () => {
    // Clear any previously-paused kinds so the next drain pass
    // retries them. resume() is a no-op if nothing is paused.
    useWriteQueue.getState().resume();
    void useWriteQueue.getState().drain();
  };

  if (isNative()) {
    const { Network } = await import("@capacitor/network");
    await Network.addListener("networkStatusChange", (status) => {
      if (status.connected) onOnline();
    });
  } else if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
  }
}

// Auto-init in the browser. The SSR build path (window undefined)
// skips it; the queue still works on the client because
// initNetworkListener runs on the first render that touches this
// module client-side.
if (typeof window !== "undefined") {
  void initNetworkListener();
}
