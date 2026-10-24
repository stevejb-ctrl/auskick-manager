"use client";

// ─── The summary opens at the top ───────────────────────────────
// Finish game swaps the full-time review for the summary, and the page
// kept the review's scroll, so the final score and "Copy for group
// chat" sat above the fold (round-2 usability test, 24 Oct 2026: AFL
// scrollY 354, netball 150). The break already opens at the top
// (PeriodBreak); the summary now does too, in every sport. Only when
// the game finishes on this screen: a finished game opened later loads
// at the top anyway.

import { useEffect, useRef, type RefObject } from "react";

/** Scroll the page, and every scrolled ancestor of `from` (the /run demo's DeviceFrame scrolls itself), to the top. */
export function scrollPageToTop(from: HTMLElement | null): void {
  let el = from?.parentElement ?? null;
  while (el) {
    if (el.scrollTop > 0) el.scrollTop = 0;
    el = el.parentElement;
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}

export function useScrollToTopOnFinish(finalised: boolean, rootRef?: RefObject<HTMLElement | null>): void {
  const wasFinalised = useRef(finalised);
  useEffect(() => {
    if (finalised && !wasFinalised.current) scrollPageToTop(rootRef?.current ?? null);
    wasFinalised.current = finalised;
  }, [finalised, rootRef]);
}
