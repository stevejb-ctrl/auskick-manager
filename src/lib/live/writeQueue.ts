"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { liveGameStorage } from "./persistStorage";
import { isNative } from "@/lib/platform";
import type { OptimisticEventInput } from "./optimisticEvents";
import { noteLiveResult } from "./liveSync";
import { deviceOffline, noteServerReached } from "./useOnline";

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
// has the unflushed ops on relaunch, and they send as soon as the
// store rehydrates. Lane state (inFlightKinds / pausedKinds) is
// runtime-only.
//
// A live write is never lost (round-3 edge testing, 24 Oct 2026, P0).
// The queue used to give up after five tries on a 1/2/4/8 s backoff
// without asking whether the phone had signal, so anything tapped more
// than ~15 s into an outage was thrown away, in tap order, and a server
// answering 500 for ~15 s lost a goal the same way. Now:
//   - with no signal (navigator.onLine false, or a request that never
//     got an answer) nothing is spent: the lane waits for the signal,
//     and retries on a capped backoff in case the phone never says so;
//   - a server error retries on a capped backoff, forever;
//   - a game write the server keeps refusing is kept, in order, and
//     marked `stuck` after MAX_OP_ATTEMPTS, so the coach sees "Couldn't
//     save · Retry" (OfflineBanner) and retries or discards it;
//   - only a rule refusal (`rejected`) drops an op at once.
// Writes off the game lane (a pre-game availability tap) still give up
// at the cap, so their optimistic flip can roll back.

/**
 * `rejected`: the server refused the write under a game rule (e.g. a
 * conversion with no try). Retrying can't help, so the op is dropped
 * straight away and its `flushed` rejects with the error, rather than
 * pausing the lane (which would stall every score behind it).
 */
export type ActionResult = { success: boolean; error?: string; rejected?: boolean; stale?: boolean };

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
  // Every sport: a clock pause or resume
  "recordClockPause",
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
  "recordSoccerOwnGoal",
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
  // Touch and Oztag
  "startTouchPeriod",
  "endTouchPeriod",
  "recordTouchLineupSet",
  "recordTouchSwap",
  "recordTouchMove",
  "recordTouchScore",
  "undoTouchScore",
  "recordTouchFieldSize",
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

/**
 * The game event a queued write will insert, as the screen showed it
 * (useOptimisticEvents). Saved with the op, so a screen reloaded before
 * the write saved still draws it (queuedOptimisticEvents).
 */
export interface QueuedEvent {
  gameId: string;
  /** The created_at the screen gave it. */
  createdAt: string;
  event: OptimisticEventInput;
}

export interface QueueOp {
  /** UUID v4. Used as the idempotency_key on the resulting event row. */
  id: string;
  /** Registered handler key — e.g. "recordGoal", "recordSwap". */
  kind: string;
  /** Positional args passed to the handler (excluding idempotencyKey). */
  args: unknown[];
  /** Bumped on every attempt the server answered (or errored) — not one lost for want of signal. */
  attemptCount: number;
  /** Wall-clock ms when the op was first appended. */
  queuedAt: number;
  /** Most recent error message, if any. */
  lastError?: string;
  /** A game write that failed MAX_OP_ATTEMPTS times: kept, waiting on the coach's Retry or Discard. */
  stuck?: boolean;
  /** The event it stands for on screen, if the caller drew one. */
  optimistic?: QueuedEvent;
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
   * queue drains). Rejects (with the error) when the server refuses
   * it under a rule, when the coach discards it, or when an op off
   * the game lane gives up after `MAX_OP_ATTEMPTS` — lets the caller
   * roll back any optimistic UI flip.
   */
  flushed: Promise<void>;
}

/**
 * After this many failed attempts a game write is marked `stuck` (shown
 * with Retry and Discard) and an op off the game lane is dropped. An
 * attempt lost for want of signal doesn't count.
 *
 * History: the queue once retried forever with nothing shown, which
 * left "permanent" failures spinning the optimistic UI (Steve
 * 2026-05-19: availability toggle stuck in loading). Then it dropped
 * at the cap, which lost live writes to a 15 s outage (round 3).
 */
export const MAX_OP_ATTEMPTS = 5;

interface WriteQueueState {
  queue: QueueOp[];
  /** Kinds currently dispatching one op. Runtime-only. */
  inFlightKinds: string[];
  /** Kinds halted after a failure / missing handler. Cleared by resume(). */
  pausedKinds: string[];
  enqueue: (kind: string, args: unknown[], optimistic?: QueuedEvent) => EnqueueResult;
  /** `probe`: send even though the phone says it's offline (scheduleOfflineProbe). */
  drain: (opts?: { probe?: boolean }) => Promise<void>;
  /** Clear pausedKinds so previously-failed lanes get retried. */
  resume: () => void;
  /** The coach's Retry: try the stuck writes (and the rest behind them) again now. */
  retryStuck: () => void;
  /** The coach's Discard: drop one write; its caller hears why, and the lane goes on. */
  discard: (id: string) => void;
  /** Clear the entire queue. Test affordance + a "give up" option for users. */
  clearQueue: () => void;
}

/** The phone says it has no signal, and no write has got through since. */
function isOffline(): boolean {
  return deviceOffline();
}

/**
 * A request that never got an answer: no signal, or the connection
 * dropped. Chrome says "Failed to fetch", Safari "Load failed", Firefox
 * "NetworkError when attempting to fetch resource.". A server that
 * answered with an error isn't one.
 */
export function isNetworkFailure(err: unknown): boolean {
  if (isOffline()) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /failed to fetch|load failed|networkerror|network request failed|internet|err_network|err_connection/i.test(message);
}

/**
 * A live write queued now won't reach the server at once: the phone says
 * it's offline, or a game write is already waiting on a failure.
 */
export function liveWritesWaiting(): boolean {
  return (
    isOffline() ||
    useWriteQueue.getState().queue.some((op) => laneOf(op.kind) === "game" && (op.attemptCount > 0 || !!op.lastError))
  );
}

// Told about every write that saves (onQueueSaved), including ones a
// reload left in the queue with no caller waiting: a screen refreshes
// to show them.
/** `hadCaller`: this page queued it (and its caller heard); false for one a reload left. */
export type QueueSavedListener = (op: QueueOp, info: { hadCaller: boolean }) => void;
const savedListeners = new Set<QueueSavedListener>();

export function onQueueSaved(listener: QueueSavedListener): () => void {
  savedListeners.add(listener);
  return () => {
    savedListeners.delete(listener);
  };
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

export function uuid(): string {
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

      enqueue: (kind, args, optimistic) => {
        const id = uuid();
        const op: QueueOp = {
          id,
          kind,
          args,
          attemptCount: 0,
          queuedAt: Date.now(),
          ...(optimistic ? { optimistic } : {}),
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

      drain: async (opts) => {
        let probe = opts?.probe === true;
        // Per-kind lanes: in each pass, find every op whose kind
        // is neither in-flight nor paused, dispatch them in
        // parallel, await the batch, and re-evaluate. Same-kind
        // ops still drain serially because a kind can have at
        // most one in-flight op at a time.
        while (true) {
          // No signal: send nothing, so no attempt is spent on a request
          // that can't arrive. The 'online' listener drains again, and a
          // probe tries anyway now and then, in case the phone is wrong.
          if (isOffline() && !probe) {
            if (get().queue.length > 0) scheduleOfflineProbe();
            break;
          }
          // One pass sends regardless; after that the phone's word (or the
          // probe's success, noteServerReached) decides.
          probe = false;
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

      retryStuck: () => {
        retryTimers.forEach((t) => clearTimeout(t));
        retryTimers.clear();
        set((s) => ({
          queue: s.queue.map((q) => (q.stuck ? { ...q, stuck: false, attemptCount: 0 } : q)),
          pausedKinds: [],
        }));
        void get().drain();
      },

      discard: (id) => {
        const op = get().queue.find((q) => q.id === id);
        if (!op) return;
        rejectFlushed(op, op.lastError ? `Not saved: ${op.lastError}` : "Not saved.");
        const lane = laneOf(op.kind);
        const timer = retryTimers.get(lane);
        if (timer) clearTimeout(timer);
        retryTimers.delete(lane);
        set((s) => ({
          queue: s.queue.filter((q) => q.id !== id),
          pausedKinds: s.pausedKinds.filter((k) => k !== lane),
        }));
        void get().drain();
      },

      clearQueue: () => {
        // Drop any flushed-promise resolvers too, otherwise they'd
        // leak (their ops are gone, no one ever resolves them).
        flushedResolvers.clear();
        flushedRejecters.clear();
        retryTimers.forEach((t) => clearTimeout(t));
        retryTimers.clear();
        networkStreaks.clear();
        clearOfflineProbe();
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
      // What a reload left on the phone sends at once. It used to wait
      // for the next tap or the next 'online' event (round 3: a try
      // queued before a reload sat at attempt 4 until then).
      onRehydrateStorage: () => (state) => {
        if (!state || state.queue.length === 0) return;
        state.resume();
        void state.drain();
      },
    },
  ),
);

function rejectFlushed(op: QueueOp, message: string): void {
  const reject = flushedRejecters.get(op.id);
  if (!reject) return;
  flushedResolvers.delete(op.id);
  flushedRejecters.delete(op.id);
  reject(new Error(message));
}

/** Signal's back: send everything (the 'online' listener, and native's). */
export function notifyOnline(): void {
  retryTimers.forEach((t) => clearTimeout(t));
  retryTimers.clear();
  networkStreaks.clear();
  clearOfflineProbe();
  useWriteQueue.getState().resume();
  void useWriteQueue.getState().drain();
}

// ─── Backoff retry for a paused lane ──────────────────────────
// 1s, 2s, 4s, … capped at 30s, after each failed attempt (a server
// error's attempt count, or how many lost requests in a row). One
// timer per lane.
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Requests in a row that got no answer, per lane: the backoff for a
// phone that says it's online but isn't (a captive wifi, a dead zone).
const networkStreaks = new Map<string, number>();
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

// ─── A probe while the phone says it's offline ────────────────
// The browser's offline flag can be wrong: one said offline for a whole
// game while pages loaded (usability pass, 26 Oct 2026), and the queue,
// believing it, sent nothing. So while it says offline and writes wait,
// one pass every OFFLINE_PROBE_MS sends anyway. With truly no signal the
// request fails at once and spends no attempt; when it gets through,
// noteServerReached tells everyone we're online after all.
export const OFFLINE_PROBE_MS = 20_000;
let offlineProbe: ReturnType<typeof setTimeout> | null = null;
function scheduleOfflineProbe(): void {
  if (offlineProbe) return;
  offlineProbe = setTimeout(() => {
    offlineProbe = null;
    useWriteQueue.setState({ pausedKinds: [] });
    void useWriteQueue.getState().drain({ probe: true });
  }, OFFLINE_PROBE_MS);
}
function clearOfflineProbe(): void {
  if (offlineProbe) clearTimeout(offlineProbe);
  offlineProbe = null;
}

// Helper used by drain(). Runs a handler, post-processes the
// queue + lane state, and returns when the dispatch is fully
// settled. The OUTER drain loop awaits Promise.all of these so it
// only re-evaluates eligible ops once the current batch finishes.
async function dispatchOp(op: QueueOp): Promise<void> {
  const handler = handlers[op.kind];
  let result: ActionResult;
  // The request never got an answer (no signal): spends no attempt.
  let unanswered = false;
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
    unanswered = isNetworkFailure(err);
    result = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const lane = laneOf(op.kind);

  // Always remove from in-flight.
  useWriteQueue.setState((s) => {
    const idx = s.inFlightKinds.indexOf(laneOf(op.kind));
    if (idx === -1) return s;
    const next = s.inFlightKinds.slice();
    next.splice(idx, 1);
    return { inFlightKinds: next };
  });

  if (result.success) {
    networkStreaks.delete(lane);
    // The server answered: if the phone said offline, it was wrong.
    noteServerReached();
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
    savedListeners.forEach((listener) => listener(op, { hadCaller: !!resolve }));
    return;
  }

  const pauseLane = (patch: Partial<QueueOp>) =>
    useWriteQueue.setState((s) => ({
      queue: s.queue.map((q) => (q.id === op.id ? { ...q, ...patch } : q)),
      pausedKinds: s.pausedKinds.includes(lane) ? s.pausedKinds : [...s.pausedKinds, lane],
    }));

  if (unanswered) {
    // No signal: the op keeps its place and its attempts. The lane
    // waits for 'online' (notifyOnline), and tries again on a capped
    // backoff in case the phone never says it's back.
    const streak = (networkStreaks.get(lane) ?? 0) + 1;
    networkStreaks.set(lane, streak);
    scheduleLaneRetry(lane, streak);
    pauseLane({ lastError: result.error });
    return;
  }

  const nextAttempt = op.attemptCount + 1;
  if (result.rejected || (lane !== "game" && nextAttempt >= MAX_OP_ATTEMPTS)) {
    // Refused under a rule (retrying can't help), or an op off the game
    // lane at the cap: give up on it so the caller can roll back its
    // optimistic UI. Reject BEFORE popping the queue so the .catch()
    // can read consistent state.
    // Refused because another phone moved the game on: say so.
    noteLiveResult(result);
    rejectFlushed(op, result.error ?? `Op ${op.kind} failed after ${MAX_OP_ATTEMPTS} attempts.`);
    useWriteQueue.setState((s) => ({
      queue: s.queue.filter((q) => q.id !== op.id),
      // Don't keep the kind paused — other ops of the same kind
      // should still get a chance.
      pausedKinds: s.pausedKinds.filter((k) => k !== lane),
    }));
    return;
  }

  // A server error, or an answer that wasn't a yes: bump attemptCount and
  // pause the lane. The op stays at its position, so the order holds.
  // The lane retries itself on a capped backoff (with one game lane, a
  // single hiccup used to hold every later sideline action until the
  // phone went offline and back, or reloaded). Past the cap a game write
  // is `stuck`: still kept, still retried, and shown with Retry and
  // Discard.
  scheduleLaneRetry(lane, nextAttempt);
  pauseLane({
    attemptCount: nextAttempt,
    lastError: result.error,
    ...(nextAttempt >= MAX_OP_ATTEMPTS ? { stuck: true } : {}),
  });
}

// ─── Network listener: drain on reconnect ─────────────────────
// Initialised once per page load. The native shell's listener is
// dynamic-imported so the @capacitor/network chunk only loads
// when isNative() is true.

let networkListenerInitialised = false;

async function initNetworkListener(): Promise<void> {
  if (networkListenerInitialised) return;
  networkListenerInitialised = true;

  // Clear any previously-paused kinds so the next drain pass retries
  // them, at once.
  const onOnline = notifyOnline;

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
