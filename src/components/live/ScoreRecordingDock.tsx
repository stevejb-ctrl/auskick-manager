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
  /**
   * Opens the full player action sheet (switch, injured, lend…) — the
   * same sheet long-press opens, so every action is reachable with a
   * plain tap (UX plan H5). Rendered as the dock's last row.
   */
  onPlayerActions?: () => void;
  /**
   * Under the heading: that a second tap swaps. Parents tapped a kid to
   * swap them, met "Record a goal" and nearly scored (Stagehand round
   * 8, #11). Where tap-to-swap works; netball's mid-quarter has none.
   */
  swapHint?: string;
}

/**
 * The dock's one line about swapping (design review, Oct 2026): it said
 * "swap" three ways ("Or tap a teammate…", "Or tap a bench player to swap
 * X off", and the heading named only scoring). Every sport passes this.
 */
export const DOCK_SWAP_HINT = "Tap anyone, on the field or the bench, to swap them.";

export function ScoreRecordingDock({
  heading,
  actions,
  onCancel,
  cancelLabel = "Cancel",
  onPlayerActions,
  swapHint,
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
            // A 44 px target round the small word, without growing the
            // row (it was 50×17; UX round 3, e4).
            className="-my-3 -mr-2 inline-flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center px-2 font-mono text-[11px] font-bold uppercase tracking-micro text-ink-dim hover:text-ink"
          >
            {cancelLabel}
          </button>
        </div>
        {swapHint && (
          <p data-testid="dock-swap-hint" className="-mt-1 mb-2 text-xs text-ink-dim">
            {swapHint}
          </p>
        )}
        {actions}
        {/* The label keeps the system's name ("Player actions" is
            also the sheet's title and what the help pages teach)
            but now carries a scent of what's inside — it was the
            only vague wording on the dock (UI polish audit §5). Every
            sport's dock shows it, so it names only actions every sport's
            sheet has (rugby has no lock; ten-sport UX audit). */}
        {onPlayerActions && (
          <button
            type="button"
            onClick={onPlayerActions}
            className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-sm border border-hairline bg-surface-alt text-sm font-semibold text-ink transition-colors duration-fast ease-out-quart hover:bg-hairline"
          >
            Player actions
            <span className="font-normal text-ink-dim">· switch, injury, lend</span>
          </button>
        )}
      </div>
    </div>
  );
}
