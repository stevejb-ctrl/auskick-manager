"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface QuarterEndModalProps {
  quarter: number;
  loading?: boolean;
  onConfirm: () => void;
  /**
   * Tap "+ Goal" / "+ Behind on the siren" — opens the score-
   * attribution picker for the just-ended quarter. Real AFL
   * scenario: a goal lands at the moment the hooter sounds and
   * the auto-end modal pops up before the +G chip on the scorebug
   * has a chance to fire. Hidden when trackScoring is off.
   */
  onLateScore?: (kind: "goal" | "behind") => void;
}

export function QuarterEndModal({
  quarter,
  loading,
  onConfirm,
  onLateScore,
}: QuarterEndModalProps) {
  const isLastQuarter = quarter >= 4;
  return (
    <Modal>
      <h2 className="text-center text-lg font-bold text-ink">
        Quarter {quarter} complete
      </h2>
      <p className="mt-1 text-center text-sm text-ink-dim">
        {isLastQuarter ? "That's the final whistle!" : `Ready for Q${quarter + 1}?`}
      </p>
      {onLateScore && (
        <div className="mt-3 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => onLateScore("goal")}
            disabled={loading}
            className="rounded-full border border-hairline bg-surface-alt px-3 py-1 font-mono text-xs font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:border-brand-500/40 hover:text-brand-700 disabled:opacity-60"
          >
            + Goal on the siren
          </button>
          <button
            type="button"
            onClick={() => onLateScore("behind")}
            disabled={loading}
            className="rounded-full border border-hairline bg-surface-alt px-3 py-1 font-mono text-xs font-semibold text-ink-dim transition-colors duration-fast ease-out-quart hover:border-brand-500/40 hover:text-brand-700 disabled:opacity-60"
          >
            + Behind
          </button>
        </div>
      )}
      <div className="mt-4">
        <Button className="w-full" size="lg" onClick={onConfirm} loading={loading}>
          {isLastQuarter ? "End game" : `Select team for Q${quarter + 1}`}
        </Button>
      </div>
    </Modal>
  );
}
