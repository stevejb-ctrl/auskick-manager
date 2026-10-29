"use client";

import {
  registerActionHandler,
  useWriteQueue,
  type ActionHandler,
  type EnqueueResult,
  type QueuedEvent,
} from "./writeQueue";

import {
  startQuarter,
  endQuarter,
  addLateArrival,
  recordGoal,
  recordBehind,
  recordOpponentScore,
  undoLastScore,
  markInjury,
  markLoan,
  recordLineupSet,
  recordSwap,
  recordFieldZoneSwap,
  recordPlayerLock,
  recordClockPause,
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
  recordLeagueGoal,
  undoLeagueScore,
  assignLeagueVest,
  recordKickoff,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/league-actions";

import {
  startSoccerHalf,
  endSoccerHalf,
  recordSoccerLineupSet,
  recordSoccerSwap,
  recordSoccerMove,
  recordSoccerGoal,
  recordSoccerOwnGoal,
  recordSoccerOpponentGoal,
  undoSoccerScore,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/soccer-actions";

import {
  startBasketballPeriod,
  endBasketballPeriod,
  recordBasketballLineupSet,
  recordBasketballSwap,
  recordBasketballMove,
  recordBasketballScore,
  undoBasketballScore,
  recordBasketballFoul,
  recordBasketballSitOut,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/basketball-actions";

import {
  startTouchPeriod,
  endTouchPeriod,
  recordTouchLineupSet,
  recordTouchSwap,
  recordTouchMove,
  recordTouchScore,
  undoTouchScore,
  recordTouchFieldSize,
} from "@/app/(app)/teams/[teamId]/games/[gameId]/live/touch-actions";

// setAvailability is invoked from AvailabilityRow's optimistic-flip
// flow (perf phase 4a). Lives in the parent game-detail route, not
// the live segment, but the queue + idempotency story is identical
// to the live-game actions so it slots in here.
import { setAvailability, setAvailabilityMany } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";

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
  undoLastScore,
  markInjury,
  markLoan,
  // Saved holds; netball uses it too (Keep in {position}).
  recordPlayerLock,
  recordLineupSet,
  recordSwap,
  recordFieldZoneSwap,
  // A clock pause or resume, every sport (lib/live/clockPause).
  recordClockPause,

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
  recordLeagueGoal,
  undoLeagueScore,
  assignLeagueVest,
  recordKickoff,

  // ── Football (soccer) ───────────────────────────────────────
  // Same contract again. Soccer shares the sideline actions above
  // (late arrivals, injuries, loans) and the saved holds: the
  // keeper's "Keep in goal" is a recordPlayerLock.
  startSoccerHalf,
  endSoccerHalf,
  recordSoccerLineupSet,
  recordSoccerSwap,
  recordSoccerMove,
  recordSoccerGoal,
  recordSoccerOwnGoal,
  recordSoccerOpponentGoal,
  undoSoccerScore,

  // ── Basketball ──────────────────────────────────────────────
  // Same contract again. Basketball shares the sideline actions above
  // (late arrivals, injuries — a foul-out is an injury with reason
  // "fouled_out" — loans) and the saved holds.
  startBasketballPeriod,
  endBasketballPeriod,
  recordBasketballLineupSet,
  recordBasketballSwap,
  recordBasketballMove,
  recordBasketballScore,
  undoBasketballScore,
  recordBasketballFoul,
  recordBasketballSitOut,

  // ── Touch and Oztag ─────────────────────────────────────────
  // Same contract again. The touch family shares the sideline actions
  // above (late arrivals, injuries, loans) and the saved holds; the
  // field's size on a mixed team short of girls is recordTouchFieldSize.
  startTouchPeriod,
  endTouchPeriod,
  recordTouchLineupSet,
  recordTouchSwap,
  recordTouchMove,
  recordTouchScore,
  undoTouchScore,
  recordTouchFieldSize,

  // ── Availability (pre-game RSVP) ────────────────────────────
  setAvailability,
  setAvailabilityMany,
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
//
// `optimistic`: the event the write stands for on screen, saved with the
// op so a screen reloaded before it saves still draws it.
export function enqueueLiveAction<K extends LiveActionKind>(
  kind: K,
  args: LiveActionArgs<K>,
  optimistic?: QueuedEvent,
): EnqueueResult {
  return useWriteQueue.getState().enqueue(kind, args, optimistic);
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
