"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface StartQuarterModalProps {
  quarter: number;
  loading?: boolean;
  onStart: () => void;
}

export function StartQuarterModal({ quarter, loading, onStart }: StartQuarterModalProps) {
  return (
    <Modal>
      <h2 className="text-center text-lg font-bold text-ink">
        Ready for Q{quarter}
      </h2>
      <p className="mt-1 text-center text-sm text-ink-dim">
        Tap when the hooter goes.
      </p>
      <div className="mt-4">
        <Button className="w-full" size="lg" onClick={onStart} loading={loading}>
          Start Q{quarter}
        </Button>
      </div>
    </Modal>
  );
}
