"use client";

import { Button } from "@/components/ui/Button";
import type { Player, Zone } from "@/lib/types";
import { ZONE_LABELS } from "@/lib/ageGroups";

interface Props {
  off: string; // field player going to bench; "" = empty slot
  on: string; // bench player coming on
  zone: Zone;
  playersById: Map<string, Player>;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SwapConfirmDialog({ off, on, zone, playersById, onConfirm, onCancel }: Props) {
  const onName = playersById.get(on)?.full_name ?? "Player";
  const offName = off ? (playersById.get(off)?.full_name ?? "Player") : null;
  const zoneName = ZONE_LABELS[zone];

  const message = offName
    ? `Manually sub ${onName} (Bench) for ${offName} (${zoneName})?`
    : `Move ${onName} to ${zoneName}?`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-lg border border-hairline bg-surface p-5 shadow-modal">
        <p className="text-center text-sm font-semibold text-ink">{message}</p>
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={onConfirm}>
            Confirm
          </Button>
          <Button className="flex-1" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
