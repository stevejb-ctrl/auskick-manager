"use client";

// ─── SwapDoneToast ───────────────────────────────────────────
// The toast that confirms a substitution landed ("Leo → Ava", "Ava on"),
// in every sport's live screen. Lifted out of AFL's LiveGame (the
// reference) so soccer's family and basketball show the same one
// (UX audit 23 Oct 2026: their tap-tap subs had no toast).
//
// Wrapped in SirenPulseHalo so the brand pulse halos the toast on
// appearance. The caller mounts it per swap, so a constant triggerKey
// is enough — the halo's inner span re-mounts with the wrapper and the
// animation restarts each time.
//
// OVERLAY, not in flow (UI polish audit §7): rendered in-flow it pushed
// the whole field ~44px down on mount and snapped back 2.5s later —
// twice per sub, right as the coach's eye is on the two tiles that
// changed. The zero-height relative wrapper keeps the document where it
// is; the toast floats over the content below.
//
// After "Make all swaps" it carries an Undo for a few seconds (round 3
// edge testing, 24 Oct 2026: reversing a mistaken batch took four taps
// and two confirms). The caller decides what undo writes.

import { useEffect } from "react";
import { SirenPulseHalo } from "@/components/brand/SirenPulseHalo";
import { announce, swapSaid } from "@/lib/a11y/announce";

export function SwapDoneToast({
  text,
  onUndo,
  undoLabel = "Undo",
}: {
  text: string;
  /** Put the swaps back (the toast stays a few seconds longer with it). */
  onUndo?: () => void;
  undoLabel?: string;
}) {
  // Said in words ("Leo off, Ava on", not "Leo right arrow Ava") into the
  // page's one live region: a status mounted with its text inside is
  // often skipped (UX round 3, e4).
  useEffect(() => {
    announce(swapSaid(text));
  }, [text]);
  return (
    <div className="relative z-30 h-0">
      <div className="absolute inset-x-0 top-0">
        <SirenPulseHalo triggerKey="swap" size="sm" display="block" className="rounded-sm">
          {/* slide-in-bottom (220ms) so the toast rises from below
              instead of popping in. The SirenPulseHalo wraps it and
              fires its own one-shot halo on the same beat. Exit is a
              hard cut at 2.5s — coach is on to the next moment, no
              value in animating the disappearance. P1-6 in
              MICRO-INTERACTIONS-PLAN.md. */}
          <div
            data-testid="swap-toast"
            className="flex items-center gap-2 rounded-sm border border-brand-200 bg-brand-50 px-3 py-1.5 text-brand-800 shadow-pop motion-safe:animate-slide-in-bottom"
          >
            <span
              aria-hidden
              className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold leading-none text-warm"
            >
              ✓
            </span>
            <span className="text-xs font-semibold">{text}</span>
            {onUndo && (
              <button
                type="button"
                onClick={onUndo}
                className="ml-auto min-h-8 rounded-sm px-2 text-xs font-bold text-brand-700 underline decoration-brand-400 underline-offset-2 hover:bg-brand-100 motion-safe:active:scale-[0.97]"
              >
                {undoLabel}
              </button>
            )}
          </div>
        </SirenPulseHalo>
      </div>
    </div>
  );
}
