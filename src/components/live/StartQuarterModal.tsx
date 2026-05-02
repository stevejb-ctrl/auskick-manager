"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface StartQuarterModalProps {
  quarter: number;
  loading?: boolean;
  onStart: () => void;
  /**
   * Optional Back/Cancel — dismisses the modal so the GM can adjust
   * the lineup before kickoff. The page surfaces a "Start Q{n}"
   * button afterwards to re-show the modal when they're ready.
   * Without this prop, the modal acts as a one-way commit (legacy
   * behaviour).
   */
  onCancel?: () => void;
}

export function StartQuarterModal({
  quarter,
  loading,
  onStart,
  onCancel,
}: StartQuarterModalProps) {
  return (
    <Modal>
      <h2 className="text-center text-lg font-bold text-ink">
        Ready for Q{quarter}
      </h2>
      <p className="mt-1 text-center text-sm text-ink-dim">
        Tap when the hooter goes.
      </p>
      <div className="mt-4 space-y-2">
        <Button className="w-full" size="lg" onClick={onStart} loading={loading}>
          Start Q{quarter}
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
