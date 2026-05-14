"use client";

import { useEffect, useRef, useState } from "react";
import { useOnline } from "@/lib/live/useOnline";
import { useWriteQueue } from "@/lib/live/writeQueue";

// Pure state-machine step for the reconcile detector. Extracted so
// unit tests can drive it directly without standing up React +
// fake timers. Inputs:
//   - `nowDirty`     — derived from (offline OR queueLength > 0)
//   - `prevWasDirty` — has the device been dirty since the last
//                      reconcile fire?
// Returns the next state plus a `fireReconcile` boolean — true
// only on the transition that warrants a halo (clean state held
// for ≥2s after at least one dirty observation). Two-tick model:
// the caller schedules the actual fire after the debounce window.
//
// The 2s sustained-clean threshold is enforced by the caller; this
// reducer just describes which deltas drive which transitions.
export interface ReconcileState {
  wasDirty: boolean;
  debouncePending: boolean;
}
export interface ReconcileDelta {
  next: ReconcileState;
  /** "start" → caller should kick off the 2s debounce timer.    */
  /** "cancel" → caller should clear any in-flight debounce.    */
  /** "noop"  → no timer action required.                       */
  timerAction: "start" | "cancel" | "noop";
}

export function reconcileStep(
  state: ReconcileState,
  nowDirty: boolean,
): ReconcileDelta {
  if (nowDirty) {
    // Any dirty observation cancels an in-flight debounce and
    // sets the wasDirty flag (so the eventual clean state will
    // qualify for reconcile).
    return {
      next: { wasDirty: true, debouncePending: false },
      timerAction: state.debouncePending ? "cancel" : "noop",
    };
  }
  // Clean state.
  if (state.wasDirty && !state.debouncePending) {
    // First clean observation after a dirty streak → start
    // the sustained-clean timer.
    return {
      next: { wasDirty: true, debouncePending: true },
      timerAction: "start",
    };
  }
  // Already clean (or already debouncing). No transition.
  return { next: state, timerAction: "noop" };
}

// Called when the debounce timer fires — reduces to the resting
// state. Caller bumps the reconcileCount alongside this.
export function reconcileFire(state: ReconcileState): ReconcileState {
  return { wasDirty: false, debouncePending: false };
}

// ─── useReconciledOnline ──────────────────────────────────────
// Returns a counter that increments exactly once after the device
// transitions from "dirty" (offline OR has pending writes) back to
// "clean and sustained" (online AND queue empty for ≥2s).
//
// Why this exists: the OfflineBanner is a fear signal — coaches who
// see it want positive confirmation when their queued work actually
// landed. Today the recovery is silent: the banner disappears and
// the queue drains in the background with no acknowledgement. This
// hook produces the trigger for a one-shot brand halo around the
// app-shell wordmark, so a glance up confirms "your stuff is safe".
//
// The 2s debounce avoids flapping on flaky connections — a single
// brief offline blip while the queue is already empty wouldn't fire
// a reconcile, and a connection that wobbles online/offline rapidly
// won't pulse repeatedly.
//
// Return value:
//   null  — never been dirty (or the initial render). No halo.
//   1, 2… — bumps once per reconcile event. Consumer wires this as
//           a `triggerKey` to SirenPulseHalo, which fires the halo
//           on each new value.
export function useReconciledOnline(): number | null {
  const online = useOnline();
  const queueLength = useWriteQueue((s) => s.queue.length);

  const [reconcileCount, setReconcileCount] = useState<number | null>(null);
  const stateRef = useRef<ReconcileState>({
    wasDirty: false,
    debouncePending: false,
  });
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const nowDirty = !online || queueLength > 0;
    const delta = reconcileStep(stateRef.current, nowDirty);
    stateRef.current = delta.next;

    if (delta.timerAction === "cancel") {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    } else if (delta.timerAction === "start") {
      // 2s sustained-clean window before we fire the halo — see
      // the reducer's docstring above for why.
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        stateRef.current = reconcileFire(stateRef.current);
        setReconcileCount((c) => (c === null ? 1 : c + 1));
      }, 2000);
    }
  }, [online, queueLength]);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  return reconcileCount;
}
