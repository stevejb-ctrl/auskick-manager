"use client";

import { useTransition } from "react";
import { setAvailability } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import { Guernsey } from "@/components/sf";
import type { AvailabilityStatus, LiveAuth } from "@/lib/types";

interface AvailabilityRowProps {
  auth: LiveAuth;
  gameId: string;
  playerId: string;
  playerName: string;
  jerseyNumber: number | null;
  status: AvailabilityStatus;
  canEdit: boolean;
}

// Two-state availability: anything that isn't explicitly "available" is shown
// as "unavailable" (including the legacy "unknown" rows). Toggle flips between
// the two.
const nextStatus: Record<AvailabilityStatus, AvailabilityStatus> = {
  unknown: "available",
  unavailable: "available",
  available: "unavailable",
};

const statusStyles: Record<AvailabilityStatus, string> = {
  available: "bg-ok/10 text-ok border-ok/30",
  unavailable: "bg-surface-alt text-ink-mute border-hairline",
  unknown: "bg-surface-alt text-ink-mute border-hairline",
};

const statusLabels: Record<AvailabilityStatus, string> = {
  available: "Available",
  unavailable: "Unavailable",
  unknown: "Unavailable",
};

export function AvailabilityRow({
  auth,
  gameId,
  playerId,
  playerName,
  jerseyNumber,
  status,
  canEdit,
}: AvailabilityRowProps) {
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    if (!canEdit || isPending) return;
    const next = nextStatus[status];
    startTransition(async () => {
      await setAvailability(auth, gameId, playerId, next);
    });
  }

  return (
    <li className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        {jerseyNumber != null && <Guernsey num={jerseyNumber} size={32} />}
        <span className="text-sm font-medium text-ink">{playerName}</span>
      </div>
      {canEdit ? (
        <button
          type="button"
          onClick={handleToggle}
          disabled={isPending}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition-opacity ${statusStyles[status]} ${
            isPending ? "opacity-60" : "hover:opacity-80"
          }`}
        >
          {statusLabels[status]}
        </button>
      ) : (
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[status]}`}
        >
          {statusLabels[status]}
        </span>
      )}
    </li>
  );
}
