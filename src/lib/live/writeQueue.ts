"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { liveGameStorage } from "./persistStorage";
import { isNative } from "@/lib/platform";
import { track } from "@/lib/analytics/client";

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

/**
 * `rejected`: the server refused the write under a game rule (e.g. a
 * conversion with no try). Retrying can't help, so the op is dropped
 * straight away and its `flushed` rejects with the error, rather than
 * pausing the lane (which would stall every score behind it).
 */
export type ActionResult = { success: boolean; error?: string; rejected?: boolean };

/**
 * Every live-game action shares one lane, so a game's events land in the
 * order the coach acted. Separate lanes let a replacement swap overtake
 * its injury, a swap land after the hooter, or an undo beat its score,
 * and the replay then showed a different game (Stagehand round 2;
 * sideline-combos walks). Anything else (pre-game availability) keeps
 * its own lane.
 */
const GAME_LANE = new Set([
  // AFL (several shared by netball and league)
  "startQuarter",
  "endQuarter",
  "addLateArrival",
  "recordGoal",
  "recordBehind",
  "recordOpponentScore",
  "undoLastScore",
  "markInjury",
  "markLoan",
  "recordPlayerLock",
  "recordLineupSet",
  "recordSwap",
  "recordFieldZoneSwap",
  // Netball
  "periodBreakSwap",
  "startNetballQuarter",
  "endNetballQuarter",
  "recordNetballGoal",
  "recordNetballOpponentGoal",
  "undoNetballScore",
  // Rugby league
  "startLeagueQuarter",
  "endLeagueQuarter",
  "recordLeagueSwap",
  "recordLeagueLineupSet",
  "recordLeaguePositionChange",
  "recordTry",
  "recordOpponentTry",
  "recordConversionAttempt",
  "recordOpponentConversion",
  "recordLeagueGoal",
  "undoLeagueScore",
  "assignLeagueVest",
  "recordKickoff",
  // Football (soccer)
  "startSoccerHalf",
  "endSoccerHalf",
  "recordSoccerLineupSet",
  "recordSoccerSwap",
  "recordSoccerMove",
  "recordSoccerGoal",
  "recordSoccerOpponentGoal",
  "undoSoccerScore",
  // Basketball
  "startBasketballPeriod",
  "endBasketballPeriod",
  "recordBasketballLineupSet",
  "recordBasketballSwap",
  "recordBasketballMove",
  "recordBasketballScore",
  "undoBasketballScore",
  "recordBasketballFoul",
  "recordBasketballSitOut",
]);
// The bulk availability write shares the per-row lane, so a row tap and
// "Mark all in" land in the order the coach made them.
const SHARED_LANE: Record<string, string> = { setAvailabilityMany: "setAvailability" };
export function laneOf(kind: string): string {
  return GAME_LANE.has(kind) ? "game" : SHARED_LANE[kind] ?? kind;
}

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
   * queue drains). Rejects (with the last error message) when the
   * queue gives up on an op after `MAX_OP_ATTEMPTS` failures —
   * lets the caller roll back any optimistic UI flip.
   */
  flushed: Promise<void>;
}

/**
 * Stop retrying a failing op after this many attempts. Earlier
 * draft retried forever, which left "permanent" failures (auth
 * rejected, validation error) spinning the optimistic UI
 * indefinitely. Steve 2026-05-19: availability toggle stuck in
 * loading state when the server returned `{success: false}`.
 *
 * Transient network failures usually resolve in 1-2 retries, so
 * 5 attempts gives enough headroom for a flaky reconnect without
 * letting a genuine permanent error spin forever.
 */
export const MAX_OP_ATTEMPTS = 5;

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

// In-memory map of op id → flushed-promise resolver / rejecter.
// Lives outside the zustand store because Promise callbacks can't
// be serialized to disk. Only populated for ops enqueued during
// the current page session; rehydrated ops from a previous session
// have no caller waiting, so they drain (or get dropped at the
// attempt cap) without resolving anyone.
const flushedResolvers = new Map<string, () => void>();
const flushedRejecters = new Map<string, (err: Error) => void>();

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
  if (store.pausedKinds.includes(laneOf(kind))) {
    useWriteQueue.setState((s) => ({
      pausedKinds: s.pausedKinds.filter((k) => k !== laneOf(kind)),
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
        const flushed = new Promise<void>((resolve, reject) => {
          flushedResolvers.set(id, resolve);
          flushedRejecters.set(id, reject);
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
            if (scheduledKinds.has(laneOf(op.kind))) continue;
            if (state.pausedKinds.includes(laneOf(op.kind))) continue;
            const handler = handlers[op.kind];
            if (!handler) {
              // Missing handler ⇒ pause this kind. Other kinds
              // unaffected. registerActionHandler clears the pause
              // when the handler shows up (cold-start race).
              console.warn(
                `[writeQueue] no handler for kind=${op.kind} — pausing lane at op id=${op.id}`,
              );
              set((s) => ({
                pausedKinds: s.pausedKinds.includes(laneOf(op.kind))
                  ? s.pausedKinds
                  : [...s.pausedKinds, laneOf(op.kind)],
              }));
              scheduledKinds.add(laneOf(op.kind)); // skip subsequent same-lane ops this pass
              continue;
            }
            batch.push(op);
            scheduledKinds.add(laneOf(op.kind));
          }
          if (batch.length === 0) break;

          // Mark all batched kinds in-flight atomically before
          // yielding to await — protects against a concurrent
          // drain() picking up the same op.
          set((s) => ({
            inFlightKinds: [...s.inFlightKinds, ...batch.map((o) => laneOf(o.kind))],
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
        retryTimers.forEach((t) => clearTimeout(t));
        retryTimers.clear();
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

// ─── Backoff retry for a paused lane ──────────────────────────
// 1s, 2s, 4s, … (capped at 30s) after each failed attempt; the op is
// dropped at MAX_OP_ATTEMPTS as before. One timer per lane.
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
function scheduleLaneRetry(lane: string, attempt: number): void {
  if (retryTimers.has(lane)) return;
  const delay = Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1));
  retryTimers.set(
    lane,
    setTimeout(() => {
      retryTimers.delete(lane);
      useWriteQueue.setState((s) => ({ pausedKinds: s.pausedKinds.filter((k) => k !== lane) }));
      void useWriteQueue.getState().drain();
    }, delay),
  );
}

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
    const raw = (await handler(...op.args, op.id)) as ActionResult | undefined;
    // Defensive: some Next.js server-action paths (notably ones
    // that fire `revalidatePath` + later interact with router
    // refresh) have been observed to surface a `Promise<undefined>`
    // back through the action stub instead of the action's actual
    // return value. Without this guard, the next line crashes the
    // entire drain loop with "Cannot read properties of undefined
    // (reading 'success')", which then bricks every other queued
    // write until the page reloads. Steve 2026-05-18 (availability
    // toggle).
    result = raw && typeof raw === "object" && "success" in raw
      ? raw
      : {
          success: false,
          error:
            "Action handler returned an unexpected response — the write will retry.",
        };
  } catch (err) {
    result = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Always remove from in-flight.
  useWriteQueue.setState((s) => {
    const idx = s.inFlightKinds.indexOf(laneOf(op.kind));
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
      flushedRejecters.delete(op.id);
      resolve();
    }
    useWriteQueue.setState((s) => ({
      queue: s.queue.filter((q) => q.id !== op.id),
    }));
  } else {
    const nextAttempt = op.attemptCount + 1;
    if (result.rejected || nextAttempt >= MAX_OP_ATTEMPTS) {
      // Refused under a rule, or hit the cap — give up on this op so the caller can roll
      // back any optimistic UI. Without this, a permanent failure
      // (auth rejected, validation error) leaves the optimistic
      // flip spinning forever. Reject BEFORE popping the queue so
      // the .catch() can read consistent state.
      const reject = flushedRejecters.get(op.id);
      if (reject) {
        flushedResolvers.delete(op.id);
        flushedRejecters.delete(op.id);
        reject(
          new Error(
            result.error
              ?? `Op ${op.kind} failed after ${MAX_OP_ATTEMPTS} attempts.`,
          ),
        );
      }
      useWriteQueue.setState((s) => ({
        queue: s.queue.filter((q) => q.id !== op.id),
        // Don't keep the kind paused — other ops of the same kind
        // should still get a chance. The next op's success will
        // clear any lingering state.
        pausedKinds: s.pausedKinds.filter((k) => k !== laneOf(op.kind)),
      }));
    } else {
      // Transient failure: bump attemptCount, pause this kind. The
      // op stays at its position so when resume() clears the
      // pause, drain picks it up again from the same place. The lane
      // also retries itself after a backoff: with one game lane, a
      // single hiccup used to hold every later sideline action until
      // the phone went offline and back, or reloaded.
      scheduleLaneRetry(laneOf(op.kind), nextAttempt);
      useWriteQueue.setState((s) => ({
        queue: s.queue.map((q) =>
          q.id === op.id
            ? {
                ...q,
                attemptCount: nextAttempt,
                lastError: result.error,
              }
            : q,
        ),
        pausedKinds: s.pausedKinds.includes(laneOf(op.kind))
          ? s.pausedKinds
          : [...s.pausedKinds, laneOf(op.kind)],
      }));
    }
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
    // What the device saved up while offline, for analytics
    // (offline_queue_flushed): how many writes and how long the oldest
    // waited. Counts only, never what the writes were.
    const backlog = useWriteQueue.getState().queue;
    const oldestQueuedAt = backlog.reduce((min, op) => Math.min(min, op.queuedAt), Date.now());
    // Clear any previously-paused kinds so the next drain pass
    // retries them. resume() is a no-op if nothing is paused.
    useWriteQueue.getState().resume();
    void useWriteQueue
      .getState()
      .drain()
      .then(() => {
        if (backlog.length === 0 || useWriteQueue.getState().queue.length > 0) return;
        track("offline_queue_flushed", {
          queued_count: backlog.length,
          offline_seconds: Math.max(0, Math.round((Date.now() - oldestQueuedAt) / 1000)),
        });
      });
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
