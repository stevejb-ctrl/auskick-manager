"use client";

import { useEffect, useState } from "react";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";

// LocalStorage key — persists "user has discovered long-press" across
// games and sessions. Once set, the hint never appears again on this
// device. Versioned in the key name so a future redesign can flip
// this to `siren-longpress-seen-v2` to re-prompt without colliding
// with the old flag.
const STORAGE_KEY = "siren-longpress-seen-v1";

// Custom DOM event fired by PlayerTile when a long-press completes.
// LongPressHint listens for it to know it can dismiss itself + mark
// the storage flag. Window-level so the two components don't need
// any prop wiring.
const LONG_PRESS_EVENT = "siren:longpress";

// Auto-dismiss the hint after 12s even if the user doesn't long-
// press. Two reasons: (1) parents who watch one game and never lock
// anyone shouldn't see the chip every time they open the app, and
// (2) the chip occupies bottom-of-viewport real estate that
// competes with the sticky scorebug.
const AUTO_DISMISS_MS = 12_000;

/**
 * First-tap hint for the long-press affordance. P1.5-3 in
 * .planning/MICRO-INTERACTIONS-PLAN.md.
 *
 * Long-press to lock is a powerful but invisible affordance —
 * coaches discover it by accident or never. This component shows a
 * one-time hint chip the first time a coach opens a live game (or
 * any view that wires `onLongPress` on player tiles). The chip is
 * dismissed permanently the first time ANY long-press fires on the
 * page, OR via the Got it action, OR after 12 seconds.
 *
 * Mounted by LiveGame.tsx inside the in-game render. The
 * `enabled` prop lets the caller suppress the hint in contexts
 * where long-press doesn't do anything (pre-game, finalised).
 */
export function LongPressHint({ enabled = true }: { enabled?: boolean }) {
  // null until we've checked localStorage — prevents SSR/CSR
  // hydration mismatch (the server can't know the storage value).
  // After the first effect run we either flip to true (show) or
  // false (don't show); rendering returns null in either non-true
  // case so the DOM stays stable.
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled) {
      setShow(false);
      return;
    }
    if (typeof window === "undefined") return;
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY) === "true";
      setShow(!seen);
    } catch {
      // localStorage can throw in private-mode Safari + some
      // embedded WebViews. Treat as "user has seen it" — better
      // to silently suppress the hint than re-show it forever
      // because storage is broken.
      setShow(false);
    }
  }, [enabled]);

  // Listener for the long-press window event. Once any long-press
  // fires, the user has discovered the gesture — mark seen.
  useEffect(() => {
    if (!show) return;
    function dismiss() {
      try {
        window.localStorage.setItem(STORAGE_KEY, "true");
      } catch {
        // see above
      }
      setShow(false);
    }
    window.addEventListener(LONG_PRESS_EVENT, dismiss);
    const t = window.setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => {
      window.removeEventListener(LONG_PRESS_EVENT, dismiss);
      window.clearTimeout(t);
    };
  }, [show]);

  function handleGotIt() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // see above
    }
    setShow(false);
  }

  if (show !== true) return null;

  return (
    // Fixed bottom-of-viewport chip, centered horizontally. Sits
    // ABOVE the sticky scorebug (z-40 vs scorebug z-30) so it
    // doesn't disappear under the bottom bar. `pb-` accounts for
    // the iPhone home-bar safe area.
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(96px+env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto motion-safe:animate-slide-in-bottom">
        <SirenPulseHalo triggerKey="hint" size="sm" className="rounded-full">
          <div
            role="status"
            className="inline-flex items-center gap-2 rounded-full border border-ink-dim/20 bg-ink/95 px-3.5 py-2 text-xs font-medium text-warm shadow-modal"
          >
            <span aria-hidden="true" className="text-sm leading-none">
              👇
            </span>
            <span>Long-press a player to lock them on field</span>
            <button
              type="button"
              onClick={handleGotIt}
              className="ml-1 rounded-full bg-warm/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-micro text-warm transition-colors duration-fast ease-out-quart hover:bg-warm/20 active:bg-warm/30"
            >
              Got it
            </button>
          </div>
        </SirenPulseHalo>
      </div>
    </div>
  );
}

/**
 * Fire-and-forget dispatcher — call from PlayerTile when a
 * long-press completes. The LongPressHint listens for this and
 * uses it as a "user discovered the gesture" signal.
 */
export function dispatchLongPressEvent() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LONG_PRESS_EVENT));
}
