"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Guernsey } from "@/components/sf";
import type { Player } from "@/lib/types";

interface LateArrivalMenuProps {
  candidates: Player[]; // squad players not currently in the game
  onAdd: (playerId: string) => void;
  pending: boolean;
}

export function LateArrivalMenu({ candidates, onAdd, pending }: LateArrivalMenuProps) {
  const [open, setOpen] = useState(false);

  if (candidates.length === 0) return null;

  if (!open) {
    return (
      <div className="flex justify-center">
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          + Add late arrival
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-hairline bg-surface p-3 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Add late arrival</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
        >
          Close
        </button>
      </div>
      <ul className="space-y-1.5">
        {candidates.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                onAdd(p.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md border border-hairline px-2.5 py-2 text-left text-sm transition-colors duration-fast ease-out-quart hover:bg-surface-alt disabled:opacity-50"
            >
              {p.jersey_number != null && (
                <Guernsey num={p.jersey_number} size={28} />
              )}
              <span className="font-medium text-ink">{p.full_name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
