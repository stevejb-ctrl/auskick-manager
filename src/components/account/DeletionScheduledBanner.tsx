"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface DeletionScheduledBannerProps {
  /** ISO timestamp of the planned purge. `null` collapses to nothing. */
  scheduledFor: string | null;
}

/**
 * App-wide notice that the user has scheduled their account for
 * deletion. Mounted near the top of the (app) layout so it follows
 * the user across every authenticated screen — the goal is that they
 * never forget the clock is ticking, and never have to hunt for
 * "where do I cancel this?".
 *
 * Renders nothing on accounts that haven't requested deletion (the
 * common case), so there's zero layout impact for everyone else.
 *
 * Hidden on /live routes: the in-game UI is deliberately chrome-free
 * (see AppHeaderShell) and a banner above the field view would push
 * the sticky top bar down. The user can find the same affordance from
 * the /account page after the game.
 *
 * Manage link routes to /account, where the full restore affordance
 * lives. Keeping the action a navigation rather than an inline button
 * keeps this component small.
 */
export function DeletionScheduledBanner({
  scheduledFor,
}: DeletionScheduledBannerProps) {
  const pathname = usePathname();
  if (!scheduledFor) return null;
  if (pathname?.endsWith("/live")) return null;

  const date = new Date(scheduledFor);
  const formatted = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn"
      data-testid="deletion-scheduled-banner"
    >
      <span className="leading-relaxed">
        <span aria-hidden="true" className="mr-1.5">
          ⚠
        </span>
        Account scheduled for deletion on{" "}
        <strong className="font-semibold">{formatted}</strong>.
      </span>
      <Link
        href="/account"
        className="rounded-md border border-warn/40 bg-surface px-2.5 py-1 font-semibold text-warn transition-colors duration-fast ease-out-quart hover:bg-warn/10"
      >
        Manage
      </Link>
    </div>
  );
}
