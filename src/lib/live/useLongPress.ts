// ─── useLongPress ─────────────────────────────────────────────────
// Shared 500ms long-press gesture, extracted from PlayerTile so every
// long-pressable surface (in-game tiles AND the quarter-break tiles)
// feels identical — same 300ms arming pre-cue, same haptic, same
// click-suppression. Reuse-before-fork (CLAUDE.md): one gesture, not
// two hand-rolled copies.
//
// Usage:
//   const lp = useLongPress({ onLongPress: () => openSheet(id) });
//   <button {...lp.handlers} onClick={() => { if (lp.consumedLongPress()) return; onTap(); }}
//           className={lp.arming ? "ring-2 ring-brand-300" : ""}>

"use client";

import { useRef, useState } from "react";
import { hapticTap } from "@/lib/haptics";
import { dispatchLongPressEvent } from "@/components/live/LongPressHint";

interface UseLongPressOptions {
  /** Fired when the press is held past `durationMs`. Omit to disable. */
  onLongPress?: () => void;
  /** Hold time before the long-press fires. Default 500ms (PlayerTile parity). */
  durationMs?: number;
  /** Hold time before the arming pre-cue turns on. Default 300ms. */
  armMs?: number;
}

interface PointerHandlers {
  onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
}

export interface UseLongPressResult {
  /** Spread onto the pressable element. Empty object when disabled. */
  handlers: PointerHandlers;
  /** True between `armMs` and the fire — drives the pre-cue ring. */
  arming: boolean;
  /**
   * Call FIRST inside the element's `onClick`. Returns true (and resets)
   * when the click is the tail of a long-press that already fired, so
   * the caller can suppress the tap action.
   */
  consumedLongPress: () => boolean;
}

export function useLongPress({
  onLongPress,
  durationMs = 500,
  armMs = 300,
}: UseLongPressOptions): UseLongPressResult {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [arming, setArming] = useState(false);
  const didLongPressRef = useRef(false);

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (!onLongPress) return;
    didLongPressRef.current = false;
    // Pointer capture keeps the up/cancel landing on this element even
    // if the finger drifts a few px. Guarded — jsdom / older WebViews
    // can throw on setPointerCapture.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    // 300ms pre-cue: shows the user the press is registering (without
    // it the 500ms total reads as unresponsive — Stagehand finding).
    armingTimerRef.current = setTimeout(() => {
      armingTimerRef.current = null;
      setArming(true);
    }, armMs);
    longPressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      longPressTimerRef.current = null;
      setArming(false);
      // Tactile "picked up" confirmation, fired BEFORE the callback so
      // the buzz lands ahead of any sheet/modal the callback opens.
      void hapticTap("light");
      // Tells LongPressHint the gesture was discovered so its hint chip
      // self-dismisses.
      dispatchLongPressEvent();
      onLongPress();
    }, durationMs);
  }

  function cancel() {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (armingTimerRef.current !== null) {
      clearTimeout(armingTimerRef.current);
      armingTimerRef.current = null;
    }
    setArming(false);
  }

  function consumedLongPress(): boolean {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return true;
    }
    return false;
  }

  const handlers: PointerHandlers = onLongPress
    ? { onPointerDown, onPointerUp: cancel, onPointerCancel: cancel }
    : {};

  return { handlers, arming, consumedLongPress };
}
