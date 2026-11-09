"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import {
  SHEET_SETTLE_FALLBACK_MS,
  closeShieldUntil,
  entranceEnded,
  sheetEntrance,
} from "@/components/ui/sheetTapGuard";

// The sheets' tap guard (sheetTapGuard.ts has the why), for Modal,
// ActionSheet and SlotFillSheet: every sheet on the live screen is one
// of the three, in every sport.

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The card has an entrance to wait for (none with reduced motion). */
function hasEntrance(el: HTMLElement): boolean {
  if (typeof el.getAnimations === "function") return el.getAnimations().length > 0;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// One shield for the whole page: a transparent layer over the screen,
// under any sheet still open (Modal and ActionSheet sit at z-50).
let shieldEl: HTMLDivElement | null = null;
let shieldUntil = 0;
let shieldTimer: number | undefined;

function armCloseShield() {
  if (typeof document === "undefined") return;
  const now = Date.now();
  shieldUntil = closeShieldUntil(shieldUntil, now);
  if (!shieldEl) {
    shieldEl = document.createElement("div");
    shieldEl.setAttribute("aria-hidden", "true");
    shieldEl.setAttribute("data-testid", "sheet-close-shield");
    shieldEl.style.cssText = "position:fixed;inset:0;z-index:49;background:transparent;";
    document.body.appendChild(shieldEl);
  }
  window.clearTimeout(shieldTimer);
  shieldTimer = window.setTimeout(() => {
    shieldEl?.remove();
    shieldEl = null;
    shieldUntil = 0;
  }, shieldUntil - now);
}

/**
 * Whether the sheet is still coming in (taps ignored). `cardRef` is the
 * card that runs the entrance; `mounted` is when it's in the page. On
 * close, the screen under it is shielded for a moment.
 */
export function useSheetTapGuard(cardRef: RefObject<HTMLElement | null>, mounted: boolean): boolean {
  const [entering, setEntering] = useState(true);
  useIsoLayoutEffect(() => {
    if (!mounted) return;
    const el = cardRef.current;
    let state = sheetEntrance(Date.now(), !!el && hasEntrance(el));
    if (!el || state.done) {
      setEntering(false);
      return;
    }
    const onEnd = (e: AnimationEvent) => {
      state = entranceEnded(state, e.target === el);
      if (state.done) setEntering(false);
    };
    el.addEventListener("animationend", onEnd);
    el.addEventListener("animationcancel", onEnd);
    // The event can go missing (a tab in the background): the longest
    // entrance has run by now.
    const timer = window.setTimeout(() => setEntering(false), SHEET_SETTLE_FALLBACK_MS);
    return () => {
      el.removeEventListener("animationend", onEnd);
      el.removeEventListener("animationcancel", onEnd);
      window.clearTimeout(timer);
    };
  }, [mounted]);
  // Layout, not passive: the shield goes up in the same task the sheet
  // comes down, so no tap slips between them.
  useIsoLayoutEffect(() => () => armCloseShield(), []);
  return entering;
}

/**
 * A clear layer over a sheet while it comes in: a tap on it does
 * nothing (and doesn't reach the backdrop, which may close the sheet).
 */
export function SheetEntranceShield({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span
      aria-hidden
      data-testid="sheet-entering"
      className="absolute inset-0 z-20"
      onClick={(e) => e.stopPropagation()}
    />
  );
}
