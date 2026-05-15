"use client";

// ─── ScoreRecordingDock ──────────────────────────────────────
// Shared floating "record score for X" card surfaced at the
// bottom of the live-game viewport when the coach has tap-selected
// a player and is about to commit a score. Used by both AFL
// `LiveGame.tsx` and netball `NetballLiveGame.tsx`.
//
// Behaviour preserved from the two duplicated inline blocks:
//   - Outer wrapper is `pointer-events-none` so taps that miss the
//     card itself still fall through to the field / court behind.
//   - Inner card is `pointer-events-auto` + brand-500 border +
//     shadow-modal so it reads as a temporary actionable card,
//     not part of the field surface.
//   - z-40 sits ABOVE the sticky-bottom scorebug (z-30) and BELOW
//     true modals (z-50, z-[60]).
//   - Safe-area-aware bottom padding so the card clears the iPhone
//     home indicator without coaches having to thumb-stretch.
//
// Sport differences passed in via props:
//   - `heading` — "Record score for John D" (AFL composes
//     `#{jersey_number} {full_name}`) vs "Record goal for John
//     Doe" (netball, name only). Caller builds the full string.
//   - `actions` — AFL renders two side-by-side buttons (+ Goal,
//     + Behind); netball renders a single full-width + Goal. The
//     dock just slots whatever the caller passes.
//   - `onCancel` — closes the dock. Caller decides what state to
//     clear (AFL clears selection, netball clears pendingGoal).
//
// Steve 2026-05-15: Phase 5c of the LiveGameShell extraction. Two
// 40-line floating-card blocks in two files collapse to one
// source of truth.

import type { ReactNode } from "react";

interface ScoreRecordingDockProps {
  /**
   * Pre-rendered heading content. Typically a short phrase like
   * "Record score for #7 John D" — the caller formats player
   * identity (jersey vs name-only) so the dock stays
   * sport-agnostic.
   */
  heading: ReactNode;
  /** Action buttons rendered inside the card's bottom row. */
  actions: ReactNode;
  /** Tapped on the Cancel chip — caller decides what state to clear. */
  onCancel: () => void;
  /** Optional Cancel label override (default "Cancel"). */
  cancelLabel?: string;
}

export function ScoreRecordingDock({
  heading,
  actions,
  onCancel,
  cancelLabel = "Cancel",
}: ScoreRecordingDockProps) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-2 pt-2"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
    >
      <div className="pointer-events-auto mx-auto max-w-xl rounded-md border-2 border-brand-500 bg-surface p-3 shadow-modal">
        <div className="mb-2 flex items-center gap-2">
          <p className="flex-1 truncate text-sm font-semibold text-ink">
            {heading}
          </p>
          <button
            type="button"
            onClick={onCancel}
            className="flex-shrink-0 font-mono text-[11px] font-bold uppercase tracking-micro text-ink-mute hover:text-ink-dim"
          >
            {cancelLabel}
          </button>
        </div>
        {actions}
      </div>
    </div>
  );
}
