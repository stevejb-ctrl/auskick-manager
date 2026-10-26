"use client";

import { useSyncExternalStore } from "react";
import { isNative } from "@/lib/platform";

// ─── Single shared online/offline subscriber ──────────────────
//
// Multiple components can call useOnline() — they all share one
// underlying listener (Capacitor Network on native, the browser's
// online/offline events on web). Cheaper than each component
// running its own subscription, and lets us upgrade later (e.g.
// cap the "online" determination on a real fetch ping if Capacitor
// Network's view of connectivity disagrees with reality).
//
// SSR returns true because the server has no honest answer; the
// first client render reconciles to the real value via
// useSyncExternalStore.

let cachedOnline = true;
const subscribers = new Set<() => void>();
let nativeCleanup: (() => void) | null = null;
let listenerStarting = false;
// The browser said offline, but a write reached the server since. The
// flag lies that way too (usability pass, 26 Oct 2026: a browser said
// offline for a whole game while pages loaded, so 39 taps sat unsent,
// "Finish game" waited forever, and the banner said "You're offline").
// Believed until the browser next changes its mind.
let reachedWhileFlaggedOffline = false;

function notify(): void {
  subscribers.forEach((s) => s());
}

function browserSaysOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * No signal, as far as anyone knows: the browser says offline and no
 * write has reached the server since. What the write queue asks before
 * it sends.
 */
export function deviceOffline(): boolean {
  // Once the browser says online again, its next "offline" is news.
  if (!browserSaysOffline()) reachedWhileFlaggedOffline = false;
  return browserSaysOffline() && !reachedWhileFlaggedOffline;
}

/** A write just reached the server: whatever the browser says, we're online. */
export function noteServerReached(): void {
  if (!browserSaysOffline() || reachedWhileFlaggedOffline) return;
  reachedWhileFlaggedOffline = true;
  cachedOnline = true;
  notify();
}

async function startListener(): Promise<void> {
  if (nativeCleanup || listenerStarting) return;
  listenerStarting = true;

  try {
    if (isNative()) {
      // Dynamic import — keeps @capacitor/network out of the
      // web bundle for the (large) majority of users who never
      // touch the native shell.
      const { Network } = await import("@capacitor/network");
      const status = await Network.getStatus();
      cachedOnline = status.connected;
      notify();

      const handle = await Network.addListener(
        "networkStatusChange",
        (status) => {
          cachedOnline = status.connected;
          notify();
        },
      );
      nativeCleanup = () => {
        handle.remove();
      };
    } else if (typeof window !== "undefined") {
      cachedOnline = navigator.onLine || reachedWhileFlaggedOffline;
      const onChange = () => {
        reachedWhileFlaggedOffline = false;
        cachedOnline = navigator.onLine;
        notify();
      };
      window.addEventListener("online", onChange);
      window.addEventListener("offline", onChange);
      nativeCleanup = () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
      };
    }
  } finally {
    listenerStarting = false;
  }
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  // Fire-and-forget: the listener spins up async, but the
  // subscriber will be notified as soon as the first reading
  // lands. Until then they get the cached default (true).
  startListener();

  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0 && nativeCleanup) {
      nativeCleanup();
      nativeCleanup = null;
    }
  };
}

function getSnapshot(): boolean {
  return cachedOnline;
}

function getServerSnapshot(): boolean {
  // Server-side renders default to "online" — the server itself
  // is online by definition, and the first client-side render
  // will reconcile to the device's real state.
  return true;
}

/**
 * Subscribe to the device's connectivity state.
 *
 * Returns true when the device believes it has a network path
 * (Capacitor Network on iOS/Android, navigator.onLine on web).
 * Both signals can lie — a captive portal returns "online" on
 * the OS side but blocks real traffic — so callers shouldn't
 * use this to gate retry decisions on actual writes (the write
 * itself failing is the source of truth there). It's the right
 * signal for UI banners, gating offline-incompatible UX flows
 * ("Create game" needs internet), and triggering the write
 * queue's drain attempt in slice 5d.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
