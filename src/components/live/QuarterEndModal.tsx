"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface QuarterEndModalProps {
  quarter: number;
  loading?: boolean;
  onConfirm: () => void;
}

export function QuarterEndModal({ quarter, loading, onConfirm }: QuarterEndModalProps) {
  const isLastQuarter = quarter >= 4;
  return (
    <Modal>
      <h2 className="text-center text-lg font-bold text-ink">
        Quarter {quarter} complete
      </h2>
      <p className="mt-1 text-center text-sm text-ink-dim">
        {isLastQuarter ? "That's the final whistle!" : `Ready for Q${quarter + 1}?`}
      </p>
      <div className="mt-4">
        <Button className="w-full" size="lg" onClick={onConfirm} loading={loading}>
          {isLastQuarter ? "End game" : `Select team for Q${quarter + 1}`}
        </Button>
      </div>
    </Modal>
  );
}
