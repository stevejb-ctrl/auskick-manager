"use client";

import { usePathname } from "next/navigation";
import { OfflineBanner } from "@/components/live/OfflineBanner";

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
 */
export function LiveAwareMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLiveRoute = pathname?.endsWith("/live") ?? false;
  return (
    <main className={isLiveRoute ? "px-4 pb-4" : "px-4 py-4"}>
      <div
        className={
          isLiveRoute
            ? "mx-auto max-w-4xl"
            : "mx-auto mb-3 max-w-4xl"
        }
      >
        <OfflineBanner />
      </div>
      {children}
    </main>
  );
}
