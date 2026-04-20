"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface SubDueModalProps {
  onAcknowledge: () => void;
}

export function SubDueModal({ onAcknowledge }: SubDueModalProps) {
  return (
    <Modal>
      <h2 className="text-center text-lg font-bold text-ink">Sub due!</h2>
      <p className="mt-1 text-center text-sm text-ink-dim">
        Time to rotate a player off the field.
      </p>
      <div className="mt-4">
        <Button className="w-full" size="lg" onClick={onAcknowledge}>
          Got it
        </Button>
      </div>
    </Modal>
  );
}
