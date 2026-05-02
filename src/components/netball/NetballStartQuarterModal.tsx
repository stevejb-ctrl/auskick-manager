"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

// Netball variant of the AFL StartQuarterModal. Same shape, sport-
// flavoured copy ("umpires call play" instead of "the hooter goes")
// since the netball UI elsewhere consistently refers to the umpire's
// whistle. Mirrors the gating behaviour: render this when the lineup
// is locked but the quarter_start event hasn't been written yet, so
// the GM can wait for the umpire's whistle before kicking off the
// clock — instead of the clock auto-starting on the lineup tap.

interface NetballStartQuarterModalProps {
  quarter: number;
  loading?: boolean;
  onStart: () => void;
  onCancel?: () => void;
}

export function NetballStartQuarterModal({
  quarter,
  loading,
  onStart,
  onCancel,
}: NetballStartQuarterModalProps) {
  return (
    <Modal>
      <h2 className="text-center text-lg font-bold text-ink">
        Ready for Q{quarter}
      </h2>
      <p className="mt-1 text-center text-sm text-ink-dim">
        Tap when the umpires call play.
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
