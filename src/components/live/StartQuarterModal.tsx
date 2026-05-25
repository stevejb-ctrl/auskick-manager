"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface StartQuarterModalProps {
  quarter: number;
  loading?: boolean;
  onStart: () => void;
  /**
   * Optional Back/Cancel — dismisses the modal so the GM can adjust
   * the lineup before kickoff. Now (Steve 2026-05-13) actually
   * cancels: the modal is hosted by LineupPicker (Q1) or
   * QuarterBreak (Q-break), and the destructive writes
   * (lineup_set, quarter_start, period_break_swap) only fire on
   * `onStart`. Dismissing returns the GM to the editable picker
   * with zero server state changed.
   */
  onCancel?: () => void;
  /**
   * Period word — "quarter" (default, AFL/netball) or "half"
   * (RL U10–U12). First letter uppercased becomes the abbreviation
   * used in the heading + button ("Q" or "H"). Matches the same
   * prop on `ManualEndQuarterConfirm` so both modals stay in sync.
   */
  periodLabel?: "quarter" | "half" | "period";
}

export function StartQuarterModal({
  quarter,
  loading,
  onStart,
  onCancel,
  periodLabel = "quarter",
}: StartQuarterModalProps) {
  const abbr = periodLabel.charAt(0).toUpperCase();
  return (
    <Modal>
      <h2 className="text-center text-lg font-bold text-ink">
        Ready for {abbr}{quarter}
      </h2>
      <p className="mt-1 text-center text-sm text-ink-dim">
        Tap when the hooter goes.
      </p>
      <div className="mt-4 space-y-2">
        <Button className="w-full" size="lg" onClick={onStart} loading={loading}>
          Start {abbr}{quarter}
        </Button>
        {onCancel && (
          <Button
            className="w-full"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={loading}
          >
            Back to lineup
          </Button>
        )}
      </div>
    </Modal>
  );
}
