"use client";

import { usePathname } from "next/navigation";
import { OfflineBanner } from "@/components/live/OfflineBanner";
import { DeletionScheduledBanner } from "@/components/account/DeletionScheduledBanner";

interface LiveAwareMainProps {
  children: React.ReactNode;
  /**
   * ISO timestamp of the user's pending account deletion, or null if
   * none is scheduled. Threaded through from the (app) layout so the
   * banner can mount in the same wrapper strip as OfflineBanner and
   * share the live-route hide behaviour.
   */
  deletionScheduledFor?: string | null;
}

/**
 * Client wrapper around the (app) layout's <main> + the offline-
 * banner strip. On /live routes:
 *   - <main> drops `pt` so the in-game sticky top bar can anchor
 *     flush at viewport top:0.
 *   - the OfflineBanner wrapper drops its `mb-3` — when online,
 *     OfflineBanner returns null but the wrapper's bottom margin
 *     still pushes the in-game header 12px down from the viewport
 *     top, causing a subtle "scroll" until the bar locks at top:0.
 *
 * Non-live routes keep `py-4` + the `mb-3` spacer below the offline
 * strip so their existing rhythm is preserved.
 *
 * (Steve 2026-05-13: with the pt + mb-3 in place, the bar's natural
 * flow position was below viewport top, which made sticky `top-0`
 * behave inconsistently — the bar appeared to scroll a few pixels
 * before locking.)
 *
 * The DeletionScheduledBanner shares the same wrapper so a user with
 * a pending deletion sees the reminder at the same screen position
 * as the offline notice — and it self-hides on /live just like
 * OfflineBanner is rendered with a zero-margin wrapper there.
 */
export function LiveAwareMain({
  children,
  deletionScheduledFor = null,
}: LiveAwareMainProps) {
  const pathname = usePathname();
  const isLiveRoute = pathname?.endsWith("/live") ?? false;
  return (
    <main className={isLiveRoute ? "px-4 pb-4" : "px-4 py-4"}>
      <div
        className={
          isLiveRoute
            ? "mx-auto max-w-4xl"
            : "mx-auto mb-3 max-w-4xl space-y-2"
        }
      >
        <OfflineBanner />
        <DeletionScheduledBanner scheduledFor={deletionScheduledFor} />
      </div>
      {children}
    </main>
  );
}
