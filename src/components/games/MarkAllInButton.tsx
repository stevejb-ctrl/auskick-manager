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
 * One tap enqueues a single setAvailabilityMany write for every
 * not-yet-in player, on the same write-queue lane the row toggles use
 * (idempotent, offline-safe),
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
    // One write for everyone (it was one per kid, one after another:
    // 12 round trips, over 10 s on a slow line).
    const { flushed } = enqueueLiveAction("setAvailabilityMany", [auth, gameId, notInIds, "available"]);
    flushed
      .catch(() => {
        // Dropped after its retries; the refresh shows the server truth.
      })
      .finally(() => {
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
      } motion-safe:active:scale-[0.97]`}
    >
      {pending && <PulseDot size="sm" />}
      {pending ? "Marking…" : `Mark all ${notInIds.length} in`}
    </button>
  );
}
