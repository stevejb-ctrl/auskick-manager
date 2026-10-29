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
// Renders nothing when both `availabilityHref` and `action` are
// absent. A null `availabilityHref` is the signal from flows with no
// availability page to go back to.

import type { ReactNode } from "react";
import Link from "next/link";
import { SFIcon } from "@/components/sf";

interface LineupPickerBreadcrumbProps {
  /**
   * The availability page for this game — where "Update availability"
   * goes. Never game detail (UX plan H2). Omit to hide the link half.
   */
  availabilityHref?: string | null;
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
  availabilityHref,
  action,
}: LineupPickerBreadcrumbProps) {
  if (!availabilityHref && !action) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      {availabilityHref ? (
        // A row that goes forward, not a "‹" back link (design review,
        // Oct 2026: everywhere else ‹ means go back). Same words as the
        // coach's "Who's here" row.
        <Link
          href={availabilityHref}
          aria-label="Who's here: update availability"
          className="flex min-h-[48px] min-w-0 flex-1 items-center gap-3 rounded-lg border border-hairline bg-surface px-4 py-2 text-left shadow-card transition-colors duration-fast ease-out-quart hover:bg-surface-alt"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">Who&apos;s here</span>
            <span className="block text-xs text-ink-dim">A kid didn&apos;t turn up? Mark them out.</span>
          </span>
          <span aria-hidden className="text-ink-mute">
            <SFIcon.chevronRight />
          </span>
        </Link>
      ) : (
        <span />
      )}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
