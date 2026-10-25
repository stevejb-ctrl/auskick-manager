"use client";

import { useEffect, type RefObject } from "react";

// ─── useStickyInset ──────────────────────────────────────────
// A sticky or fixed bar says how tall it is, as a CSS variable the page's
// scroll padding reads (globals.css), so a control that takes keyboard
// focus scrolls clear of the bar rather than under it (UX round 3, e4,
// WCAG 2.4.11: Tab put union's back line under the score bar, netball's
// GD and GK under the Start Q1 footer).
//
//   top    → --sticky-top-h    (the live top bar)
//   bottom → --sticky-bottom-h (the score bar, the lineup and break footers)

export function useStickyInset(ref: RefObject<HTMLElement>, edge: "top" | "bottom"): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const name = edge === "top" ? "--sticky-top-h" : "--sticky-bottom-h";
    const root = document.documentElement;
    const set = () => root.style.setProperty(name, `${el.offsetHeight}px`);
    set();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(set);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty(name);
    };
  }, [ref, edge]);
}
