"use client";

import { useState } from "react";
import { SFButton } from "@/components/sf";
import { SlotFillSheet } from "@/components/ui/SlotFillSheet";
import type { Player } from "@/lib/types";

interface LateArrivalMenuProps {
  candidates: Player[]; // squad players not currently in the game
  onAdd: (playerId: string) => void;
  pending: boolean;
}

/**
 * "+ Add late arrival" affordance — a single button that opens a
 * SlotFillSheet (modal) listing squad members not currently in the
 * lineup. Replaces the previous inline-card pattern (Steve
 * 2026-05-13) so the button can share a row with other admin
 * actions (e.g. ResetGameButton) without the inline card disrupting
 * the row layout when opened. The picker mirrors the scorer + swap
 * pickers used elsewhere for consistency.
 */
export function LateArrivalMenu({ candidates, onAdd, pending }: LateArrivalMenuProps) {
  const [open, setOpen] = useState(false);

  if (candidates.length === 0) return null;

  return (
    <>
      {/* w-full sm:w-auto so Add late arrival dominates the
          admin row on mobile and stays intrinsic on tablet+.
          Steve 2026-05-15: add-late-arrival is the more common
          scenario on the row — the destructive Restart game
          shouldn't visually outweigh it. */}
      <SFButton
        size="md"
        variant="ghost"
        onClick={() => setOpen(true)}
        disabled={pending}
        className="w-full sm:w-auto"
      >
        + Add late arrival
      </SFButton>

      {open && (
        <SlotFillSheet
          slotLabel="late arrival"
          titleVerb="Add"
          subtitle="Pick a squad member who's just turned up. They'll be added to the bench and the suggester will work them into the next rotation."
          emptyMessage="No squad members left to add — everyone is already in the game."
          candidates={candidates.map((p) => ({
            id: p.id,
            name: p.full_name,
            jerseyNumber: p.jersey_number,
          }))}
          onPick={(playerId) => {
            onAdd(playerId);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}
