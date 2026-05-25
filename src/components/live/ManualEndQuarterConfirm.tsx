"use client";

// ─── ManualEndQuarterConfirm ─────────────────────────────────
// Shared "End {period} now?" destructive confirmation modal used
// by all three sports. AFL + netball use the default "quarter"
// label ("End Q3"); junior rugby league at U10+ runs halves
// instead, so we read a `periodLabel` prop and render "End H2"
// for those games.
//
// The coach taps "End {Q|H} early" from the scorebug when the
// game played on but the clock didn't (the canonical recovery
// flow for "paused at the start, forgot to resume"). Confirming
// credits all on-field/court players the full period time,
// regardless of how much of it the wall clock actually saw.
// That's destructive — the modal exists to make the coach pause
// for a beat before committing.
//
// Sport-specific bits via props:
//   - `playersLabel` flips "on-field" (AFL / RL) vs "on-court"
//     (netball) in the explainer paragraph.
//   - `periodLabel` flips "quarter" / "half". First letter
//     uppercased becomes the abbreviation in the heading + button
//     ("Q" or "H"). Defaults to "quarter" so existing AFL +
//     netball callers don't need to change.
//   - `quarter` interpolates into the heading + confirm button so
//     the coach sees which period they're ending.
//
// Backdrop tap dismisses (non-destructive). Confirm runs the
// caller's `onConfirm` then closes via `onCancel` (caller-owned —
// keeps the state machine in the parent).

import { Button } from "@/components/ui/Button";

interface ManualEndQuarterConfirmProps {
  /** Period number being ended, interpolated into the heading + button. */
  quarter: number;
  /** Tapped on the destructive "End {abbr}{n}" button. */
  onConfirm: () => void;
  /** Tapped on Cancel or the backdrop — closes the modal without side effects. */
  onCancel: () => void;
  /**
   * The word for "currently playing" — AFL / RL uses "on-field"
   * (the default), netball uses "on-court". Affects only the
   * explainer paragraph copy.
   */
  playersLabel?: string;
  /**
   * Period word — "quarter" (default) or "half". RL U10+ runs
   * halves; the modal uses the first uppercase letter as the
   * abbreviation in the title + button ("Q" / "H"). AFL + netball
   * leave this at the default.
   */
  periodLabel?: "quarter" | "half" | "period";
}

export function ManualEndQuarterConfirm({
  quarter,
  onConfirm,
  onCancel,
  playersLabel = "On-field",
  periodLabel = "quarter",
}: ManualEndQuarterConfirmProps) {
  const abbr = periodLabel.charAt(0).toUpperCase();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink/40"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm rounded-lg border border-hairline bg-surface p-5 shadow-modal">
        <p className="text-center text-sm font-semibold text-ink">
          End {abbr}{quarter} now?
        </p>
        <p className="mt-2 text-center text-xs text-ink-mute">
          {playersLabel} players will be credited the full {periodLabel}{" "}
          time, even though the clock is paused. Use this when the game
          played on but the clock didn&rsquo;t.
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            className="flex-1"
            variant="danger"
            onClick={onConfirm}
          >
            End {abbr}{quarter}
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
