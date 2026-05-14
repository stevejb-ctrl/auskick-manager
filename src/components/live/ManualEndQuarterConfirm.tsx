"use client";

// ─── ManualEndQuarterConfirm ─────────────────────────────────
// Shared "End Q{n} now?" destructive confirmation modal used by
// both AFL `LiveGame.tsx` and netball `NetballLiveGame.tsx`.
//
// The coach taps "End Q early" from the scorebug when the game
// played on but the clock didn't (the canonical recovery flow for
// "paused at the start, forgot to resume"). Confirming credits all
// on-field/court players the full quarter time, regardless of how
// much of it the wall clock actually saw. That's destructive — the
// modal exists to make the coach pause for a beat before
// committing.
//
// Sport-specific bits via props:
//   - `playersLabel` flips "on-field" (AFL) vs "on-court" (netball)
//     in the explainer paragraph.
//   - `quarter` interpolates into the heading + confirm button so
//     the coach sees which Q they're ending.
//
// Backdrop tap dismisses (non-destructive). Confirm runs the
// caller's `onConfirm` then closes via `onCancel` (caller-owned —
// keeps the state machine in the parent).
//
// Steve 2026-05-15: Phase 5a of the shell-extraction. Two
// 32-line modal trees in two files collapse to one source of
// truth.

import { Button } from "@/components/ui/Button";

interface ManualEndQuarterConfirmProps {
  /** Quarter number being ended, interpolated into the heading + button. */
  quarter: number;
  /** Tapped on the destructive "End Q{n}" button. */
  onConfirm: () => void;
  /** Tapped on Cancel or the backdrop — closes the modal without side effects. */
  onCancel: () => void;
  /**
   * The word for "currently playing" — AFL uses "on-field" (the
   * default), netball uses "on-court". Affects only the explainer
   * paragraph copy.
   */
  playersLabel?: string;
}

export function ManualEndQuarterConfirm({
  quarter,
  onConfirm,
  onCancel,
  playersLabel = "On-field",
}: ManualEndQuarterConfirmProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink/40"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm rounded-lg border border-hairline bg-surface p-5 shadow-modal">
        <p className="text-center text-sm font-semibold text-ink">
          End Q{quarter} now?
        </p>
        <p className="mt-2 text-center text-xs text-ink-mute">
          {playersLabel} players will be credited the full quarter
          time, even though the clock is paused. Use this when the
          game played on but the clock didn&rsquo;t.
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            className="flex-1"
            variant="danger"
            onClick={onConfirm}
          >
            End Q{quarter}
          </Button>
          <Button
            className="flex-1"
            variant="secondary"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
