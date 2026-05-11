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
//   2. The queue worker drains in FIFO order, dispatching each op
//      to its registered handler with the op's UUID appended as
//      the final argument. That UUID becomes the idempotency_key
//      on the corresponding game_events row, so a replay after a
//      flaky network simply hits the unique constraint and the
//      server reports success-already-applied (slice 5a).
//   3. On success, the op is popped. On failure, attemptCount is
//      bumped, the error is recorded, and the worker stops at the
//      failed op — preserving order. The next drain trigger
//      (online event, manual call) retries from the same head.
//
// Persistence: the queue itself rides on the liveGameStorage
// adapter (Capacitor Preferences on native, localStorage on web)
// under "siren-write-queue-v1", so a force-quit mid-quarter still
// has the unflushed ops on relaunch.

export type ActionResult = { success: boolean; error?: string };

/**
 * Handler signature: receives the caller's positional args plus
 * the queue-generated idempotency key as the final argument.
 * Phase 5e will register footy + netball server actions here.
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
  /** True while a drain is in flight. Prevents re-entrancy. */
  draining: boolean;
  enqueue: (kind: string, args: unknown[]) => EnqueueResult;
  drain: () => Promise<void>;
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
// 5e will populate this with imports of the real server actions.
// Tests register their own mock handlers via registerActionHandler.

const handlers: Record<string, ActionHandler> = {};

export function registerActionHandler(
  kind: string,
  handler: ActionHandler,
): void {
  handlers[kind] = handler;
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
      draining: false,

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
        // Fire-and-forget drain attempt. If we're online and there
        // are no ops ahead, this op fires immediately. If we're
        // offline, drain bails and the op waits for the next
        // network-online event.
        void get().drain();
        return { id, flushed };
      },

      drain: async () => {
        if (get().draining) return;
        if (get().queue.length === 0) return;
        set({ draining: true });
        try {
          // Loop until the head op fails or the queue empties.
          // Each iteration re-reads `queue` so concurrent enqueues
          // are picked up in order.
          while (true) {
            const head = get().queue[0];
            if (!head) break;

            const handler = handlers[head.kind];
            if (!handler) {
              // No handler registered yet for this kind. This can
              // legitimately happen on app cold-start if the queue
              // has persisted ops and the network-online listener
              // races registerLiveActions's import side effect.
              // Pausing is safer than dropping — the next drain
              // trigger after handlers load will pick up where we
              // left off. (For genuinely-removed action kinds from
              // an older app version, the user can clearQueue()
              // manually.)
              console.warn(
                `[writeQueue] no handler for kind=${head.kind} — pausing drain at op id=${head.id}`,
              );
              break;
            }

            let result: ActionResult;
            try {
              // Idempotency key appended as the final argument so
              // handlers don't have to know the queue exists —
              // they just see one extra optional positional.
              result = await handler(...head.args, head.id);
            } catch (err) {
              result = {
                success: false,
                error: err instanceof Error ? err.message : String(err),
              };
            }

            if (result.success) {
              // Resolve the caller's flushed-promise (if any —
              // rehydrated ops from a previous session won't have
              // an entry here) BEFORE popping the queue, so a
              // .then() chain doesn't race a subsequent drain.
              const resolve = flushedResolvers.get(head.id);
              if (resolve) {
                flushedResolvers.delete(head.id);
                resolve();
              }
              set((s) => ({ queue: s.queue.slice(1) }));
              continue;
            }

            // Failure: bump attemptCount, record error, stop the
            // drain so we preserve order. Next drain trigger
            // (network-online, App resume, or manual) retries
            // from this same head.
            set((s) => {
              const [first, ...rest] = s.queue;
              if (!first) return s;
              return {
                queue: [
                  {
                    ...first,
                    attemptCount: first.attemptCount + 1,
                    lastError: result.error,
                  },
                  ...rest,
                ],
              };
            });
            break;
          }
        } finally {
          set({ draining: false });
        }
      },

      clearQueue: () => {
        // Drop any flushed-promise resolvers too, otherwise they'd
        // leak (their ops are gone, no one ever resolves them).
        // For ops we drop here, callers awaiting `flushed` will
        // hang forever — that's the same shape as "queue is
        // permanently broken", which is the only situation where
        // clearQueue is the right call.
        flushedResolvers.clear();
        set({ queue: [] });
      },
    }),
    {
      name: "siren-write-queue-v1",
      version: 1,
      storage: createJSONStorage(() => liveGameStorage),
      // `draining` is runtime-only; never persist it. If we did,
      // a force-quit mid-drain would leave draining=true on
      // relaunch and block all future drains.
      partialize: (state) => ({ queue: state.queue }),
    },
  ),
);

// ─── Network listener: drain on reconnect ─────────────────────
// Initialised once per page load. The native shell's listener is
// dynamic-imported so the @capacitor/network chunk only loads
// when isNative() is true.

let networkListenerInitialised = false;

async function initNetworkListener(): Promise<void> {
  if (networkListenerInitialised) return;
  networkListenerInitialised = true;

  if (isNative()) {
    const { Network } = await import("@capacitor/network");
    await Network.addListener("networkStatusChange", (status) => {
      if (status.connected) {
        void useWriteQueue.getState().drain();
      }
    });
  } else if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      void useWriteQueue.getState().drain();
    });
  }
}

// Auto-init in the browser. The SSR build path (window undefined)
// skips it; the queue still works on the client because
// initNetworkListener runs on the first render that touches this
// module client-side.
if (typeof window !== "undefined") {
  void initNetworkListener();
}
