"use client";

// ─── Sub-due beep ─────────────────────────────────────────────
// The chirp that goes with the "Sub due" banner, in every sport. It was
// AFL-only code in LiveGame; league and union's sub-due alert was silent
// (16 Oct 2026, when sub due became a banner — easier to miss than the
// modal was).
//
// Module-level singleton AudioContext. Modern browsers (mobile Safari
// especially) create AudioContexts in "suspended" state and silently
// no-op until a user gesture resume()s them. A FRESH context per beep
// never plays, because the beep runs from a useEffect (sub-state
// transition) with no user gesture in the call stack — Steve reported
// 2026-05-09: the sub-due sound used to play but no longer did. So keep
// one context for the page's lifetime and unlock it on the first
// pointerdown anywhere (useSubDueAudioUnlock).

import { useEffect } from "react";

let audioCtx: AudioContext | null = null;

function getOrCreateAudioCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  if (typeof window === "undefined") return null;
  const Ctx =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  return audioCtx;
}

/** A short 880 Hz chirp. */
export function playSubDueBeep(): void {
  const ctx = getOrCreateAudioCtx();
  if (!ctx) return;
  try {
    // Re-attempt resume in case the context drifted back to
    // suspended (some browsers do this on tab-blur / inactivity).
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.45);
  } catch {
    // ignore — some browsers block before user interaction
  }
}

/**
 * Unlock the beep's AudioContext on the first pointerdown anywhere on
 * the page (browsers only honour resume() inside a user gesture).
 * Call once from each live screen; cleaned up on unmount so a stale
 * listener doesn't survive navigation.
 */
export function useSubDueAudioUnlock(): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    function unlock() {
      const ctx = getOrCreateAudioCtx();
      if (ctx && ctx.state === "suspended") {
        void ctx.resume().catch(() => {});
      }
    }
    document.addEventListener("pointerdown", unlock, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
    };
  }, []);
}
