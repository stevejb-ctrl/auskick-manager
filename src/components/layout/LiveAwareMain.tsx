"use client";

import { usePathname } from "next/navigation";

/**
 * Client wrapper around the (app) layout's <main>. Drops the top
 * padding on /live routes so the in-game sticky top bar (rendered
 * inside LiveGame / NetballLiveGame) anchors flush at viewport
 * top:0 instead of fighting <main>'s 16px pt against `sticky top-0`
 * (Steve 2026-05-13: with the pt in place, the bar's natural flow
 * position was inside <main>'s padding, which made sticky behave
 * inconsistently — the bar appeared to scroll a few pixels before
 * locking).
 *
 * Horizontal padding (`px-4`) and bottom padding (`py-4` minus the
 * top) are preserved on all routes so non-live pages keep their
 * existing rhythm.
 */
export function LiveAwareMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLiveRoute = pathname?.endsWith("/live") ?? false;
  return (
    <main className={isLiveRoute ? "px-4 pb-4" : "px-4 py-4"}>{children}</main>
  );
}
