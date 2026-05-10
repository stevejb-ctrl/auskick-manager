"use client";

import { useEffect } from "react";
import { registerDeviceForPush } from "@/lib/notifications/registerDevice";
// Side-effect import: registers every event-inserting live-game
// action with the write queue so a persisted offline op (slice 5d)
// can drain the moment its handler is asked for. (app)/layout mounts
// this bridge for every authenticated route, which means handlers
// load before the user can navigate to /teams/.../live — the only
// place an enqueue actually originates today, and the only place a
// drain on a stale persisted queue would otherwise stall.
import "@/lib/live/registerLiveActions";
import { flushWriteQueue } from "@/lib/live/registerLiveActions";

// ─── Native push-notifications bridge ─────────────────────────
//
// Mounted inside (app)/layout.tsx so it only activates after the
// server has confirmed the user is authenticated. Web users hit
// the layout too but registerDeviceForPush() short-circuits on
// isNative() — no permission prompt, no listener cost.
//
// Lifecycle:
//   - Mount: request permission (first time only) → register →
//     upsert the FCM/APNs token into device_tokens.
//   - Unmount: tear down the registration listeners. Without this
//     a sign-out + sign-in would stack a second pair of listeners
//     and the next FCM token rotation would double-upsert.
//
// Sign-out doesn't currently delete the token from device_tokens.
// RLS prevents anyone else from reading it, so leaving the row
// stale is safe but slightly wasteful — the migration's 60-day
// last_seen_at prune will reap them. Worth revisiting if device-
// switching becomes common.
export function NativeNotificationsBridge() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    registerDeviceForPush().then((fn) => {
      if (cancelled) {
        // Component unmounted before registration completed —
        // run cleanup now so the listeners we registered don't
        // outlive the bridge.
        fn();
        return;
      }
      cleanup = fn;
    });

    // Drain any persisted writes on first authenticated mount.
    // The write queue's network listener only fires on online
    // events; if the user was already online when the app opened
    // we'd otherwise sit on stale ops until they tapped something
    // new. flushWriteQueue is fire-and-forget and a no-op if the
    // queue is empty.
    void flushWriteQueue();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}
