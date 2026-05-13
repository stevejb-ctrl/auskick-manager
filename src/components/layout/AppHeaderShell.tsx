"use client";

import { usePathname } from "next/navigation";

/**
 * Wraps the (app) layout header. Returns `null` when the user is on
 * a live-game route so the in-game top bar (rendered by LiveGame /
 * NetballLiveGame) is the sole top chrome.
 *
 * The live-game flow has its own purpose-built header — Exit on the
 * left, game date/round/venue in the centre, walkthrough ? button on
 * the right — and the Admin/Sign-out controls in the default app
 * header are noise during in-game (Steve 2026-05-13). Pathname-based
 * hiding keeps the (app) layout a server component while still
 * letting us swap chrome per route.
 *
 * Detects any route ending in `/live` (covers
 * /teams/[teamId]/games/[gameId]/live for both AFL and netball
 * branches, plus the /run/[token]/live token-auth path if it lands
 * later).
 */
export function AppHeaderShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLiveRoute = pathname?.endsWith("/live") ?? false;
  if (isLiveRoute) return null;
  return <>{children}</>;
}
