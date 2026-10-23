"use client";

import { Button } from "@/components/ui/Button";
import type { Player, Zone } from "@/lib/types";
import { ZONE_LABELS } from "@/lib/ageGroups";

import { Modal } from "@/components/ui/Modal";

// AFL's manual-sub confirm (the reference), shared with the sports whose
// hand subs can break a rule: touch and Oztag ask before a sub that
// breaks a mixed team's boys' cap. They pass the place in their own
// words and the rule it breaks; the buttons then read "Swap anyway" and
// "Pick someone else".
interface Props {
  off: string; // field player going to bench; "" = empty slot
  on: string; // bench player coming on
  /** AFL's zone. Sports whose spots aren't AFL zones pass spotName. */
  zone?: Zone;
  /** The spot in the sport's own words ("Defence", "Guards"). */
  spotName?: string;
  playersById: Map<string, Player>;
  /** The rule this sub breaks ("That puts 4 boys on: the mixed rule allows 3"). */
  ruleWarning?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SwapConfirmDialog({ off, on, zone, spotName, playersById, ruleWarning = null, onConfirm, onCancel }: Props) {
  const onName = playersById.get(on)?.full_name ?? "Player";
  const offName = off ? (playersById.get(off)?.full_name ?? "Player") : null;
  const zoneName = spotName ?? (zone ? ZONE_LABELS[zone] : "the field");

  const message = offName
    ? `Manually sub ${onName} (Bench) for ${offName} (${zoneName})?`
    : `Move ${onName} to ${zoneName}?`;

  return (
    <Modal label={message} onClose={onCancel}>
        <p className="text-center text-sm font-semibold text-ink">{message}</p>
        {ruleWarning && (
          <p className="mt-2 rounded-md bg-warn-soft px-3 py-2 text-center text-sm text-warn" data-testid="swap-rule-warning">
            {ruleWarning}.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={onConfirm}>
            {ruleWarning ? "Swap anyway" : "Confirm"}
          </Button>
          <Button className="flex-1" variant="secondary" onClick={onCancel}>
            {ruleWarning ? "Pick someone else" : "Cancel"}
          </Button>
        </div>
      </Modal>
  );
}
