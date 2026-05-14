"use client";

// ─── LineupPickerBreadcrumb ──────────────────────────────────
// Shared "Back to availability" breadcrumb + no-show signpost
// rendered above pre-game lineup pickers (AFL + netball).
//
// Two-part affordance:
//   1. Chevron-left Link back to the availability page so coaches
//      can fix a roster after starting to build the lineup.
//   2. A short signpost paragraph — "A player didn't turn up? Tap
//      here to mark them unavailable." Steve 2026-05-13 usability
//      test (Mike): without this hint, parents tried "Lend a
//      player" semantically — wrong, that's for loans to the
//      opposition — and got stuck for two steps before finding the
//      breadcrumb. Surfacing the use case removes the detour.
//
// Renders nothing when `backHref` is null/undefined. That's the
// signal from runner-token flows where there's no game-detail page
// to navigate back to.

import Link from "next/link";
import { SFIcon } from "@/components/sf";

interface LineupPickerBreadcrumbProps {
  /** Target href for the "Update availability" link. Omit to hide entirely. */
  backHref?: string | null;
}

export function LineupPickerBreadcrumb({
  backHref,
}: LineupPickerBreadcrumbProps) {
  if (!backHref) return null;
  return (
    <div className="flex flex-col gap-1">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm font-medium text-ink-dim transition-colors duration-fast ease-out-quart hover:text-ink"
      >
        <SFIcon.chevronLeft />
        Update availability
      </Link>
      <p className="text-xs text-ink-mute">
        A player didn&apos;t turn up? Tap here to mark them
        unavailable.
      </p>
    </div>
  );
}
