"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
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
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Add late arrival</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-gray-500 hover:text-gray-700"
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
              className="flex w-full items-center gap-2 rounded-md border border-gray-200 px-2.5 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 tabular-nums">
                {p.jersey_number}
              </span>
              <span className="font-medium text-gray-800">{p.full_name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
