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
// Renders nothing when both `backHref` and `action` are absent. A
// null `backHref` is the signal from runner-token flows where there's
// no game-detail page to navigate back to.

import type { ReactNode } from "react";
import Link from "next/link";
import { SFIcon } from "@/components/sf";

interface LineupPickerBreadcrumbProps {
  /** Target href for the "Update availability" link. Omit to hide the link half. */
  backHref?: string | null;
  /**
   * Optional right-aligned action rendered alongside the breadcrumb —
   * the pre-game "Game plan" opener slots in here so it sits in the
   * same place above the AFL / netball / RL pickers (one consistent
   * home, per "reuse before you fork"). Omit on flows that don't offer
   * a planner (e.g. the Q-break reuse of this breadcrumb).
   */
  action?: ReactNode;
}

export function LineupPickerBreadcrumb({
  backHref,
  action,
}: LineupPickerBreadcrumbProps) {
  if (!backHref && !action) return null;
  return (
    <div className="flex items-start justify-between gap-3">
      {backHref ? (
        <div className="flex min-w-0 flex-col gap-1">
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
      ) : (
        <span />
      )}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
