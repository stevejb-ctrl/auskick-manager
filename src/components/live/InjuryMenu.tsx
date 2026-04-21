"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Player } from "@/lib/types";

interface InjuryMenuProps {
  players: Player[]; // players currently in the game (field + bench)
  injuredIds: string[];
  onToggle: (playerId: string, injured: boolean) => void;
  pending: boolean;
}

export function InjuryMenu({ players, injuredIds, onToggle, pending }: InjuryMenuProps) {
  const [open, setOpen] = useState(false);
  const injured = new Set(injuredIds);

  if (players.length === 0) return null;

  if (!open) {
    return (
      <div className="flex justify-center">
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          {injuredIds.length > 0
            ? `Injuries (${injuredIds.length})`
            : "Report injury"}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-hairline bg-surface p-3 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Injuries</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
        >
          Close
        </button>
      </div>
      <p className="mb-2 text-xs text-ink-dim">
        Injured players stay on the bench and are skipped by the sub rotation.
      </p>
      <ul className="space-y-1.5">
        {players.map((p) => {
          const isInjured = injured.has(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => onToggle(p.id, !isInjured)}
                className={`flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-left text-sm transition-colors duration-fast ease-out-quart disabled:opacity-50 ${
                  isInjured
                    ? "border-danger/30 bg-danger/10 hover:bg-danger/20"
                    : "border-hairline hover:bg-surface-alt"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 tabular-nums">
                    {p.jersey_number}
                  </span>
                  <span className="font-medium text-ink">{p.full_name}</span>
                </span>
                <span
                  className={`text-xs font-semibold ${
                    isInjured ? "text-danger" : "text-ink-mute"
                  }`}
                >
                  {isInjured ? "Injured — tap to clear" : "Mark injured"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
