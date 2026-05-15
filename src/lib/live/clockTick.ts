"use client";

import { useSyncExternalStore } from "react";

// ─── useClockTick — opt-in 500ms re-render signal ─────────────
//
// Live-game UI needs a steady cadence to refresh displayed
// time (player-on-field minutes, the running quarter clock).
// Pre-perf-phase-7, that came from a setInterval(setTick) hook
// inside LiveGame's render scope, which re-rendered the ENTIRE
// LiveGame tree every 500ms — 2,880 full-tree renders per
// 24-minute quarter.
//
// useSyncExternalStore lets us flip the polarity: a single shared
// interval drives a module-local counter, and only components
// that explicitly call `useClockTick()` re-render on each tick.
// LiveGame's big tree no longer ticks; only its time-displaying
// descendants do — once they migrate over.
//
// Module-local state means:
//   - One interval per page load, regardless of how many
//     subscribers come and go.
//   - The interval auto-pauses when no subscribers remain
//     (subscribe returns an unsubscribe that decrements the
//     refcount; the interval clears at zero).
//   - SSR-safe via the third arg of useSyncExternalStore (server
//     snapshot returns 0 deterministically).

const DEFAULT_INTERVAL_MS = 500;

let counter = 0;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let subscriberCount = 0;
const listeners = new Set<() => void>();

function startInterval(intervalMs: number): void {
  if (intervalHandle !== null) return;
  if (typeof window === "undefined") return;
  intervalHandle = setInterval(() => {
    counter++;
    listeners.forEach((l) => l());
  }, intervalMs);
}

function stopInterval(): void {
  if (intervalHandle === null) return;
  clearInterval(intervalHandle);
  intervalHandle = null;
}

function subscribe(cb: () => void, intervalMs: number): () => void {
  listeners.add(cb);
  subscriberCount++;
  if (subscriberCount === 1) startInterval(intervalMs);
  return () => {
    listeners.delete(cb);
    subscriberCount--;
    if (subscriberCount === 0) stopInterval();
  };
}

function getSnapshot(): number {
  return counter;
}

// SSR / hydration safe: always return the same value on the
// server. The first client render reads the live `counter`,
// which may not be zero by the time hydration runs, but the
// returned value isn't user-visible — it's just a cache-buster
// for downstream date-now reads.
function getServerSnapshot(): number {
  return 0;
}

/**
 * Subscribe to a steady tick. Returns a monotonically-increasing
 * counter that React uses as a re-render trigger; the value
 * itself is not meaningful to consumers — they call `Date.now()`
 * or read derived state in the same render.
 *
 * Usage:
 * ```tsx
 * function ClockChip({ startedAt }: { startedAt: number }) {
 *   useClockTick();
 *   const elapsedMs = Date.now() - startedAt;
 *   return <span>{formatMinSec(elapsedMs)}</span>;
 * }
 * ```
 *
 * The intervalMs argument applies only on the FIRST subscriber
 * — subsequent calls join the existing interval. In practice all
 * live-game callers use the 500ms default.
 */
export function useClockTick(intervalMs: number = DEFAULT_INTERVAL_MS): number {
  return useSyncExternalStore(
    (cb) => subscribe(cb, intervalMs),
    getSnapshot,
    getServerSnapshot,
  );
}
