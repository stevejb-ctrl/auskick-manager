"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
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
  // Optimistic-flip state (perf phase 4a). Before this rework, the
  // handler awaited setAvailability inside startTransition — the
  // pill stayed on the OLD status, with the spinner spinning, for
  // 500-1500ms while the server confirmed. Now we flip the local
  // state synchronously on tap and queue the write via the
  // write-queue (which gives us idempotency + offline resilience
  // for free). On any error path we roll back to the server-known
  // status. The `optimistic` state is null when we trust the
  // server's `status` prop; populated when an in-flight write is
  // pending. `isPending` derives from optimistic !== null so the
  // existing spinner + opacity affordances still work.
  const router = useRouter();
  const [optimistic, setOptimistic] = useState<AvailabilityStatus | null>(null);
  const isPending = optimistic !== null;

  // When the server-known `status` prop catches up to (or past) the
  // optimistic guess, clear the optimistic state so we go back to
  // mirroring the server.
  useEffect(() => {
    if (optimistic !== null && status === optimistic) {
      setOptimistic(null);
    }
  }, [status, optimistic]);

  const shownStatus: AvailabilityStatus = optimistic ?? status;

  // Post-write flash. `flashKey` is bumped whenever the SHOWN
  // status changes — the absolutely-positioned overlay span is
  // re-mounted on every key change, so the `bg-flash` keyframe
  // runs from frame 0 each time. With optimistic flips, the shown
  // status changes on tap (not on server return), so the flash
  // now confirms the tap landed locally — which is exactly what
  // the user is looking for.
  const [flashKey, setFlashKey] = useState(0);
  const prevStatusRef = useRef(shownStatus);
  useEffect(() => {
    if (prevStatusRef.current === shownStatus) return;
    prevStatusRef.current = shownStatus;
    setFlashKey((k) => k + 1);
  }, [shownStatus]);

  function handleToggle() {
    if (!canEdit || isPending) return;
    const next = nextStatus[shownStatus];
    // Snapshot the server-known status for rollback. Don't snapshot
    // `shownStatus` — if a previous optimistic flip is still
    // pending, we want to fall back to the real server value.
    const rollback = status;
    setOptimistic(next);
    const { flushed } = enqueueLiveAction("setAvailability", [
      auth,
      gameId,
      playerId,
      next,
    ]);
    flushed
      .then(() => {
        // Server-confirmed write. Refresh so the RSC re-renders
        // with the new `status` prop; the useEffect above will
        // then clear the optimistic state.
        router.refresh();
      })
      .catch(() => {
        // Rollback. The write queue never rejects on transient
        // failures (it retries forever) — this only fires on a
        // genuine handler crash, which is a programming error.
        setOptimistic(rollback);
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
          className={`pointer-events-none absolute inset-0 motion-safe:animate-bg-flash ${flashStyles[shownStatus]}`}
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
            Reads `shownStatus` so the optimistic flip is visible
            immediately on tap; falls back to the server-known
            `status` otherwise. */}
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusPillStyles[shownStatus]}`}
        >
          {statusPillLabels[shownStatus]}
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
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-xs font-semibold transition-opacity ${actionStyles[shownStatus]} ${
              isPending ? "opacity-60" : ""
            }`}
          >
            {isPending && <PulseDot size="sm" />}
            {actionLabels[shownStatus]}
          </button>
        )}
      </div>
    </li>
  );
}
