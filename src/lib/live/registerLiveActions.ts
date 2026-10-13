"use client";

import {
  registerActionHandler,
  useWriteQueue,
  type ActionHandler,
  type EnqueueResult,
} from "./writeQueue";

import {
  startQuarter,
  endQuarter,
  addLateArrival,
  recordGoal,
  recordBehind,
  recordOpponentScore,
  markInjury,
  markLoan,
  recordLineupSet,
  recordSwap,
  recordFieldZoneSwap,
  recordPlayerLock,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/actions";

import {
  periodBreakSwap,
  startNetballQuarter,
  endNetballQuarter,
  recordNetballGoal,
  recordNetballOpponentGoal,
  undoNetballScore,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/netball-actions";

import {
  startLeagueQuarter,
  endLeagueQuarter,
  recordLeagueSwap,
  recordLeagueLineupSet,
  recordLeaguePositionChange,
  recordTry,
  recordOpponentTry,
  recordConversionAttempt,
  recordOpponentConversion,
  undoLeagueScore,
  assignLeagueVest,
  recordKickoff,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/league-actions";

// setAvailability is invoked from AvailabilityRow's optimistic-flip
// flow (perf phase 4a). Lives in the parent game-detail route, not
// the live segment, but the queue + idempotency story is identical
// to the live-game actions so it slots in here.
import { setAvailability } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";

// ─── Wire live-game server actions into the write queue ───────
//
// Importing this module (a) registers every event-inserting
// action with the write queue and (b) ensures the queue store has
// been instantiated (so its persist hydration + network listener
// kick off). Phase 5e.3 will import this from the live-game
// route segment so handlers are registered before any LiveGame
// component mounts.
//
// The `kind` strings here are persisted in IndexedDB / Preferences
// when ops queue up offline, so renaming a key is a breaking
// change for anyone with a stale persisted queue. Add new actions
// freely; removing an action means leaving its handler in place
// (or shipping a migration that clears the queue).
//
// Action signatures from the underlying server modules end with
// an optional idempotencyKey arg. The queue appends its own UUID
// as the last positional when it dispatches, which lines up with
// that slot. We type-erase to ActionHandler at the boundary.

const actions = {
  // ── Footy ───────────────────────────────────────────────────
  startQuarter,
  endQuarter,
  addLateArrival,
  recordGoal,
  recordBehind,
  recordOpponentScore,
  markInjury,
  markLoan,
  // Saved holds; netball uses it too (Keep in {position}).
  recordPlayerLock,
  recordLineupSet,
  recordSwap,
  recordFieldZoneSwap,

  // ── Netball ─────────────────────────────────────────────────
  periodBreakSwap,
  startNetballQuarter,
  endNetballQuarter,
  recordNetballGoal,
  recordNetballOpponentGoal,
  undoNetballScore,

  // ── Rugby League ────────────────────────────────────────────
  // Same offline-queue + idempotency contract as the other two
  // sports. Each handler's final positional argument is the
  // idempotency key the queue appends. Junior RL reuses the AFL
  // shared actions for late arrivals, injuries, and player loans
  // — `addLateArrival`, `markInjury`, `markLoan` above — since
  // those mechanics are sport-agnostic.
  startLeagueQuarter,
  endLeagueQuarter,
  recordLeagueSwap,
  recordLeagueLineupSet,
  recordLeaguePositionChange,
  recordTry,
  recordOpponentTry,
  recordConversionAttempt,
  recordOpponentConversion,
  undoLeagueScore,
  assignLeagueVest,
  recordKickoff,

  // ── Availability (pre-game RSVP) ────────────────────────────
  setAvailability,
};

const handlers = actions as unknown as Record<string, ActionHandler>;

export type LiveActionKind = keyof typeof actions;

// The queue appends its idempotency key as the LAST argument, so args
// must fill every slot before the key — optional ones included (pass
// undefined). Skipping one put the key in it: netball's and league's
// undos both lost their key to an optional parameter (Stagehand round
// 2). This makes that a type error.
//
// A handler with no optional trailing slot takes no key (it ignores the
// extra argument): args fill every parameter.
type KeySlot<P extends unknown[]> = P["length"] extends Required<P>["length"]
  ? P["length"]
  : Required<P> extends [...infer H, unknown]
    ? H["length"]
    : never;
export type LiveActionArgs<K extends LiveActionKind> = Parameters<(typeof actions)[K]> & {
  length: KeySlot<Parameters<(typeof actions)[K]>>;
};

// Register on module load. Idempotent: re-importing this file
// (e.g. via React Fast Refresh in dev) just re-overwrites the
// handler entries with the same functions.
for (const [kind, fn] of Object.entries(handlers)) {
  registerActionHandler(kind, fn);
}

// ─── Public enqueue API for live-game call sites ──────────────
//
// Wraps useWriteQueue.getState().enqueue(...) so call sites don't
// have to import the queue store directly, and gives us a single
// place to add cross-cutting concerns later (telemetry, dev-mode
// logging, etc.).
//
// The first positional after `kind` is whatever the action's
// signature expects; the queue appends its idempotency key as
// the final argument when it dispatches.
export function enqueueLiveAction<K extends LiveActionKind>(
  kind: K,
  args: LiveActionArgs<K>,
): EnqueueResult {
  return useWriteQueue.getState().enqueue(kind, args);
}

/** Returns the current queue length — useful for "syncing N pending" UIs. */
export function pendingWriteCount(): number {
  return useWriteQueue.getState().queue.length;
}

/** Manually trigger a drain. Most callers don't need this — enqueue
 *  triggers internally and the network listener handles reconnects.
 *  Exposed for the LiveGame mount path to flush whatever was queued
 *  while the user wasn't on the live screen.
 */
export function flushWriteQueue(): Promise<void> {
  return useWriteQueue.getState().drain();
}
