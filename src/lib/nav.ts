// Route helpers shared by the team navigation chrome (bottom tab bar,
// header team switcher, feedback button), so they agree on which
// screens are full-screen game modes.

/** The team id in a /teams/[teamId]/… path (not /teams/new). */
export function teamIdFromPath(pathname: string | null | undefined): string | null {
  const m = pathname?.match(/^\/teams\/([0-9a-f-]{36})(?:\/|$)/);
  return m ? m[1] : null;
}

/**
 * Full-screen modes that own the whole screen: the game-day / live /
 * break screen, the availability step and the setup wizard. Team tabs
 * hide there (UX plan §6: "hidden on game day, live and break screens").
 */
export function isFullScreenTeamPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return (
    pathname.endsWith("/live") ||
    pathname.endsWith("/availability") ||
    /\/teams\/[^/]+\/setup(\/|$)/.test(pathname)
  );
}

/** True where the phone bottom tab bar is showing. */
export function showsTeamBottomBar(pathname: string | null | undefined): boolean {
  return teamIdFromPath(pathname) !== null && !isFullScreenTeamPath(pathname);
}

/** The team list and a team's Today tab: where the feedback button floats. */
export function isHomeSurface(pathname: string | null | undefined): boolean {
  return !!pathname && (pathname === "/dashboard" || /^\/teams\/(?!new$)[^/]+$/.test(pathname));
}
