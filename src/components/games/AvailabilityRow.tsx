"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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

// Per-status flash tint. The overlay span sits on top of the row's
// transparent background and fades from full opacity to zero over
// 400ms. Tones are deliberately soft — the pill colour change is
// the primary signal; the flash is supplementary confirmation that
// the write landed without forcing the eye away from the pill.
const flashStyles: Record<AvailabilityStatus, string> = {
  available:   "bg-ok/15",
  unavailable: "bg-ink-dim/10",
  unknown:     "bg-ink-dim/10",
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

  // Post-write flash. `flashKey` is bumped whenever `status`
  // changes — the absolutely-positioned overlay span is re-mounted
  // on every key change, so the `bg-flash` keyframe runs from
  // frame 0 each time. Watching `status` (NOT `isPending`) avoids
  // the race the plan called out: useTransition resolves on the
  // server-action return, but the pill's visual state changes via
  // revalidation. If the flash fired on isPending=false the pill
  // could still be on the old state when the flash starts.
  const [flashKey, setFlashKey] = useState(0);
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (prevStatusRef.current === status) return;
    prevStatusRef.current = status;
    setFlashKey((k) => k + 1);
  }, [status]);

  function handleToggle() {
    if (!canEdit || isPending) return;
    const next = nextStatus[status];
    startTransition(async () => {
      await setAvailability(auth, gameId, playerId, next);
    });
  }

  return (
    <li className="relative flex items-center justify-between gap-2 px-4 py-3">
      {/* Flash overlay — re-keyed by `flashKey` so each new
          availability state restarts the 400ms `bg-flash` keyframe.
          Sits behind the row content via z-index trick: the overlay
          is `pointer-events-none` and `inset-0` but rendered FIRST
          in DOM order, so siblings paint above it naturally. The
          overlay tint (10-15% alpha) is intentionally subtle — the
          status pill colour change is the primary signal; the
          flash is supplementary confirmation. P1-2 in
          MICRO-INTERACTIONS-PLAN.md. */}
      {flashKey > 0 && (
        <span
          key={flashKey}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 motion-safe:animate-bg-flash ${flashStyles[status]}`}
          data-flash="row"
        />
      )}
      <div className="relative flex min-w-0 items-center gap-3">
        {jerseyNumber != null && <Guernsey num={jerseyNumber} size={32} />}
        <span className="truncate text-sm font-medium text-ink">{playerName}</span>
      </div>
      {/* relative so the pill + toggle paint ABOVE the absolutely-
          positioned flash overlay. Without this both content
          columns sit BEHIND the flash and the row reads as
          "everything just got tinted green" instead of "the row
          flashed briefly". */}
      <div className="relative flex shrink-0 items-center gap-2">
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
