"use client";

import { useTransition } from "react";
import { setAvailability } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import type { AvailabilityStatus, LiveAuth } from "@/lib/types";

interface AvailabilityRowProps {
  auth: LiveAuth;
  gameId: string;
  playerId: string;
  playerName: string;
  jerseyNumber: number;
  status: AvailabilityStatus;
  canEdit: boolean;
}

const nextStatus: Record<AvailabilityStatus, AvailabilityStatus> = {
  unknown: "available",
  available: "unavailable",
  unavailable: "unknown",
};

const statusStyles: Record<AvailabilityStatus, string> = {
  available: "bg-green-100 text-green-700 border-green-200",
  unavailable: "bg-red-100 text-red-700 border-red-200",
  unknown: "bg-gray-100 text-gray-600 border-gray-200",
};

const statusLabels: Record<AvailabilityStatus, string> = {
  available: "Available",
  unavailable: "Unavailable",
  unknown: "Unknown",
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
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 tabular-nums">
          {jerseyNumber}
        </span>
        <span className="text-sm font-medium text-gray-800">{playerName}</span>
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
