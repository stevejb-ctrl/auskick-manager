"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enqueueLiveAction } from "@/lib/live/registerLiveActions";
import { PulseDot } from "@/components/ui/PulseDot";
import type { LiveAuth } from "@/lib/types";

interface MarkAllInButtonProps {
  auth: LiveAuth;
  gameId: string;
  /** Ids of squad players NOT currently marked available. */
  notInIds: string[];
}

/**
 * Bulk "everyone's here" action for the pre-game availability step.
 * The common Saturday case is the whole squad showing up — marking 13
 * kids in was 13 individual taps (UX review #1/#11, Steve 2026-07-08).
 * One tap enqueues a setAvailability write per not-yet-in player via
 * the same write queue the row toggles use (idempotent, offline-safe),
 * then refreshes so the RSC re-renders with everyone In. The coach
 * then just taps Out on the one or two absentees.
 *
 * Hidden when everyone is already In — nothing to do.
 */
export function MarkAllInButton({ auth, gameId, notInIds }: MarkAllInButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (notInIds.length === 0) return null;

  function handleMarkAll() {
    if (pending) return;
    setPending(true);
    const flushes = notInIds.map(
      (playerId) =>
        enqueueLiveAction("setAvailability", [auth, gameId, playerId, "available"])
          .flushed,
    );
    Promise.allSettled(flushes).then(() => {
      // Refresh regardless — the write queue retries transient
      // failures forever, so by the time these settle the rows are
      // either confirmed or queued; the RSC re-render shows the
      // server truth.
      router.refresh();
      setPending(false);
    });
  }

  return (
    <button
      type="button"
      onClick={handleMarkAll}
      disabled={pending}
      className={`inline-flex items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100 ${
        pending ? "opacity-60" : ""
      }`}
    >
      {pending && <PulseDot size="sm" />}
      {pending ? "Marking…" : `Mark all ${notInIds.length} in`}
    </button>
  );
}
