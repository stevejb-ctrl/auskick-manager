"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { OfflineBanner } from "@/components/live/OfflineBanner";
import { useStickyInset } from "@/components/ui/useStickyInset";

// ─── LiveShell ───────────────────────────────────────────────
// Live v3's one screen for running a game (AFL first; the other sports
// move onto it in later phases). A column exactly the screen's height,
// pinned over the page, so the page itself never scrolls:
//
//   top bar        ‹ Exit · vs Hawks · ⋯           (LiveTopBar onMenu)
//   banners        offline, sub due
//   header         20  ● Q2 07:40  13              (GameHeader part="header")
//   undo line      Goal — Mia · Q2        Undo     (UndoStrip plain)
//   info line      the next sub                    (Phase 6's InfoLine)
//   field          flex: the only part that scrolls
//   bench
//   bar            + GOAL / + BEHIND / them, or Start Q1, or the kid's dock
//   toast          over the bar                    (SwapDoneToast look="ink")
//
// Safe areas: the top bar pads under the notch, the bar over the home
// indicator, and the column clears the side insets of a phone held
// sideways. At large text only the field scrolls; the header, bench and
// bar stay where they are. On a short screen (a phone held sideways)
// there isn't room for that, so the whole column scrolls with the top
// bar and the bar stuck to its edges, as the old screen did.
//
// Being fixed, it steps out of the page's own padding (LiveAwareMain's
// px-4 pb-4) and, in the demo's phone frame, fills the frame (the frame's
// transform makes it the containing block).

// Whether a shell is on screen: LiveAwareMain leaves the offline banner
// to the shell then, which shows it under its top bar (it would sit
// hidden behind the shell otherwise).
let shells = 0;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function useLiveShellMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => shells > 0,
    () => false,
  );
}

interface LiveShellProps {
  top: ReactNode;
  /** Under the top bar: notices that need the coach (sub due, a failed save). */
  banners?: ReactNode;
  header: ReactNode;
  undo?: ReactNode;
  info?: ReactNode;
  field: ReactNode;
  bench?: ReactNode;
  bar: ReactNode;
  /** Floats over the bar (a swap's toast, with its Undo). */
  toast?: ReactNode;
}

export function LiveShell({ top, banners, header, undo, info, field, bench, bar, toast }: LiveShellProps) {
  useEffect(() => {
    shells += 1;
    emit();
    return () => {
      shells -= 1;
      emit();
    };
  }, []);

  // The bench and bar say how tall they are together: the long-press
  // hint floats above them, over the field's foot (--live-score-bar-h),
  // and the field leaves room under its last row to scroll clear of the
  // hint (--live-hint-h, LongPressHint's own). Focus scrolls clear too.
  const footRef = useRef<HTMLDivElement>(null);
  useStickyInset(footRef, "bottom");
  useEffect(() => {
    const el = footRef.current;
    if (!el) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--live-score-bar-h", `${el.offsetHeight}px`);
    set();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(set);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--live-score-bar-h");
    };
  }, []);

  return (
    <div
      data-testid="live-shell"
      className="fixed inset-0 z-10 mx-auto flex w-full max-w-md flex-col overflow-y-auto overscroll-none bg-warm text-ink"
      style={{ paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}
    >
      {top}
      <div className="flex shrink-0 flex-col gap-[6px] px-[8px] empty:hidden">
        <OfflineBanner />
        {banners}
      </div>
      <div className="shrink-0 pt-[2px]">{header}</div>
      {undo && <div className="shrink-0">{undo}</div>}
      {/* The field: the one part that scrolls. It keeps a strip of room
          at large text, where the rest is tallest. The info line rides at
          its top, stuck there; at large text it scrolls away with the
          field, so the header, bench and bar keep their places. */}
      <div
        data-testid="live-field"
        className="flex min-h-[112px] flex-1 flex-col overflow-y-auto overscroll-contain px-[8px] short:min-h-0 short:flex-none short:overflow-visible"
        style={{ paddingBottom: "var(--live-hint-h, 0px)" }}
      >
        {info && (
          <div className="sticky top-0 z-[5] max-h-[40dvh] flex-none overflow-y-auto bg-warm pb-[4px] pt-[2px] bigtext:static bigtext:max-h-none short:static short:max-h-none">
            {info}
          </div>
        )}
        {/* The field fills what's left (its lines share the height), and
            grows past it at large text, where this part scrolls. */}
        <div className={`flex flex-[1_0_auto] flex-col ${info ? "pt-[2px]" : "pt-[6px]"}`}>{field}</div>
      </div>
      {/* The foot: the bench, then the bar, stuck to the bottom. On a
          short screen only the bar sticks, and the bench scrolls with the
          field. */}
      <div ref={footRef} className="sticky bottom-0 z-20 shrink-0 bg-warm short:contents">
        {bench && <div className="px-[8px] pt-[6px]">{bench}</div>}
        <div
          id="live-scores"
          tabIndex={-1}
          role="region"
          aria-label="Scores"
          className="relative px-[12px] pt-[8px] outline-none short:sticky short:bottom-0 short:z-20 short:bg-warm"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          {toast}
          {bar}
        </div>
      </div>
    </div>
  );
}
