"use client";

import { useTransition } from "react";
import { setAvailability } from "@/app/(app)/teams/[teamId]/games/[gameId]/actions";
import { Guernsey } from "@/components/sf";
import { PulseDot } from "@/components/ui/PulseDot";
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

// Visual state of the row's status pill (left side). Independent of
// the button label, which describes the ACTION not the current state.
const statusPillStyles: Record<AvailabilityStatus, string> = {
  available: "bg-ok/10 text-ok border-ok/30",
  unavailable: "bg-surface-alt text-ink-mute border-hairline",
  unknown: "bg-surface-alt text-ink-mute border-hairline",
};
const statusPillLabels: Record<AvailabilityStatus, string> = {
  available: "Available",
  unavailable: "Unavailable",
  unknown: "Unavailable",
};

// Action-verb labels for the toggle button. Stagehand 2026-05-09
// repeatedly showed agents (and a kid persona) tapping a button
// labelled "Unavailable" thinking that ACTION would mark the player
// unavailable — when the label was actually showing the CURRENT
// state, and tapping flipped it to "available". Switch to action
// verbs so the button says what tapping it DOES.
const actionLabels: Record<AvailabilityStatus, string> = {
  available: "Mark unavailable",
  unavailable: "Mark available",
  unknown: "Mark available",
};
const actionStyles: Record<AvailabilityStatus, string> = {
  // From Available → tap to make Unavailable: muted button
  available: "border-hairline bg-surface text-ink-dim hover:bg-surface-alt",
  // From Unavailable/unknown → tap to make Available: brand-coloured CTA
  unavailable: "border-brand-500/30 bg-brand-50 text-brand-700 hover:bg-brand-100",
  unknown: "border-brand-500/30 bg-brand-50 text-brand-700 hover:bg-brand-100",
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
    <li className="flex items-center justify-between gap-2 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {jerseyNumber != null && <Guernsey num={jerseyNumber} size={32} />}
        <span className="truncate text-sm font-medium text-ink">{playerName}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* Status pill — pure indicator, NOT a button. Shows the
            current availability state with the appropriate colour.
            Separating state from action means the toggle button
            below can describe what tapping it does, not the
            current state. */}
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusPillStyles[status]}`}
        >
          {statusPillLabels[status]}
        </span>
        {canEdit && (
          // Tap target bumped from py-1 (~28px) to py-2.5 (~40px) so
          // parents on phones have a fingertip-friendly target
          // without losing the pill silhouette (Steve 2026-05-13
          // audit). Stays custom-styled (not SFButton) because the
          // colour-coded available/unavailable/unknown variants
          // communicate state alongside action — a value the
          // generic ghost variant would drop.
          <button
            type="button"
            onClick={handleToggle}
            disabled={isPending}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-xs font-semibold transition-opacity ${actionStyles[status]} ${
              isPending ? "opacity-60" : ""
            }`}
          >
            {isPending && <PulseDot size="sm" />}
            {actionLabels[status]}
          </button>
        )}
      </div>
    </li>
  );
}
